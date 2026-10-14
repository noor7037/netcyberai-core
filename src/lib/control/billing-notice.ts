import type { SchoolEntitlements } from '@/lib/contracts/entitlements';
import { t, type Lang } from '@/lib/i18n';
import type { Sql } from '@/lib/jobs/types';
import { indiaDate } from '@/lib/time/india';
import { billingOwnSql } from './billing-nightly';
import { lastGraceDay } from './grace-day';

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
