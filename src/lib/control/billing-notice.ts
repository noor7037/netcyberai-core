import type { SchoolEntitlements } from '@/lib/contracts/entitlements';
import { t, tCount, type Lang } from '@/lib/i18n';
import type { Sql } from '@/lib/jobs/types';
import { indiaDate } from '@/lib/time/india';
import { billingOwnSql } from './billing-nightly';
import { lastGraceDay } from './grace-day';
import { addDays, daysBetween, TRIAL_NOTICE_DAYS, TRIAL_READERS } from './trial';

// What a school is told on its own screens while it is in grace or
// read-only (docs/26 slice 8e, C204): plain and dated. Read with the
// school's own session: row level security lets it see its own
// subscription row and nothing of another school. Never an amount.
//
//   paidUntil   only when the state is the billing check's doing
//   worksUntil  the last day everything still works (grace)
//   since       the first day nothing could be changed (read-only), when known

export type AccessNotice =
  | { kind: 'grace'; paidUntil: string | null; worksUntil: string }
  | { kind: 'read_only'; paidUntil: string | null; since: string | null };

export async function schoolAccessNotice(db: Sql, entitlements: SchoolEntitlements): Promise<AccessNotice | null> {
  const mode = entitlements.accessMode;
  if (mode !== 'grace' && mode !== 'read_only') return null;
  const sub = (await db.query(
    `select sub.paid_until::text as paid_until, sub.billing_access, sub.billing_access_since::text as since, coalesce(${billingOwnSql('sub', 'e')}, false) as own
       from school_subscriptions sub join school_entitlements e on e.school_id = sub.school_id where sub.school_id = $1`,
    [entitlements.schoolId]
  )).rows[0];
  const paidUntil = sub?.own ? (sub.paid_until as string | null) : null;
  const ends = entitlements.graceEndsAt ? Date.parse(entitlements.graceEndsAt) : null;
  if (mode === 'grace') {
    // The stored mode is always 'grace' with an end here (the database requires the end).
    return ends === null ? null : { kind: 'grace', paidUntil, worksUntil: lastGraceDay(ends) };
  }
  // Read-only the check set directly has its own first day; after a grace period it is the day after grace ended.
  const since = sub?.own && sub.billing_access === 'read_only' ? (sub.since as string) : ends === null ? null : indiaDate(new Date(ends + 1000));
  return { kind: 'read_only', paidUntil, since };
}

// A date as a person reads it (day, month in words, year), in the reader's language.
export function dayInWords(lang: Lang, isoDate: string): string {
  return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${isoDate}T00:00:00Z`));
}

// The one line the school reads. With no date to give, the plain read-only line the school app already had.
export function accessNoticeText(lang: Lang, notice: AccessNotice): string {
  const day = (iso: string) => dayInWords(lang, iso);
  if (notice.kind === 'grace') {
    return notice.paidUntil
      ? t(lang, 'accessNotice.billingGrace', { paidUntil: day(notice.paidUntil), worksUntil: day(notice.worksUntil) })
      : t(lang, 'accessNotice.grace', { worksUntil: day(notice.worksUntil) });
  }
  if (notice.paidUntil && notice.since) return t(lang, 'accessNotice.billingReadOnly', { paidUntil: day(notice.paidUntil), since: day(notice.since) });
  if (notice.since) return t(lang, 'accessNotice.readOnlySince', { since: day(notice.since) });
  return t(lang, 'modules.readOnly');
}

// ---- the free month (C226, docs/30) ---------------------------------------------------------------------------
//
// What the school's office (the principal and the school admin) reads in the app shell while the school is in its
// free month: the days left, and from TRIAL_NOTICE_DAYS before the last day a notice of the plan the school moves to
// the next day. Read with the school's own session: row level security gives the row to those two roles only, and
// school_trial_plan_name() gives them the plan's name and nothing else of it. Never a message, never an amount.
//
//   days_left  more than TRIAL_NOTICE_DAYS left: the quiet line
//   ending     1 to TRIAL_NOTICE_DAYS left: the notice
//   last_day   today is the last day
//   ended      the last day has passed and the nightly job has not moved the school yet

export type TrialNotice = { kind: 'days_left' | 'ending' | 'last_day' | 'ended'; daysLeft: number; endsOn: string; planName: string | null };

export async function schoolTrialNotice(db: Sql, schoolId: string, role: string, today: string = indiaDate()): Promise<TrialNotice | null> {
  if (!(TRIAL_READERS as readonly string[]).includes(role)) return null;
  const r = (await db.query(`select ends_on::text as ends_on, school_trial_plan_name(school_id) as plan_name from school_trials where school_id = $1 and ended_at is null`, [schoolId])).rows[0];
  if (!r) return null;
  const daysLeft = daysBetween(today, r.ends_on as string);
  const kind = daysLeft < 0 ? 'ended' : daysLeft === 0 ? 'last_day' : daysLeft <= TRIAL_NOTICE_DAYS ? 'ending' : 'days_left';
  return { kind, daysLeft, endsOn: r.ends_on as string, planName: (r.plan_name as string | null) ?? null };
}

// The one line the office reads, in the reader's language, with the days in words.
export function trialNoticeText(lang: Lang, notice: TrialNotice): string {
  const day = (iso: string) => dayInWords(lang, iso);
  const plan = notice.planName ? t(lang, 'trialNotice.planNamed', { name: notice.planName }) : t(lang, 'trialNotice.planUnnamed');
  const next = day(addDays(notice.endsOn, 1));
  if (notice.kind === 'days_left') return tCount(lang, 'trialNotice.daysLeft', notice.daysLeft, { last: day(notice.endsOn) });
  if (notice.kind === 'ending') return tCount(lang, 'trialNotice.ending', notice.daysLeft, { last: day(notice.endsOn), next, plan });
  if (notice.kind === 'last_day') return t(lang, 'trialNotice.lastDay', { next, plan });
  return t(lang, 'trialNotice.ended', { last: day(notice.endsOn), plan });
}
