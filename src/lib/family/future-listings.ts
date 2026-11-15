import type { PoolClient } from 'pg';
import { applyHostOk } from './future-domains';
import { computeStatus, daysLeft, nextEvent, VISIBLE, type FutureStatus, type KeyDate } from './future-status';

// What a family sees in the Future tab (step 1, 15 Nov 2026). Reading is done as the family role, so the table's own
// policy already holds back anything not approved; this file adds the child's class and state, recomputes the status
// from the dates (a closed item can never show as open, whatever the job has or has not run), and groups for the page.

type Sql = Pick<PoolClient, 'query'>;
export type Bilingual = { en: string; hi: string | null };
export type FutureListing = {
  id: string; hub: string; category: string; providerType: string; provider: string;
  titleEn: string; titleHi: string | null; summaryEn: string | null; summaryHi: string | null;
  eligibilityEn: string | null; eligibilityHi: string | null; benefitEn: string | null; benefitHi: string | null; feeEn: string | null; feeHi: string | null;
  keyDates: KeyDate[]; lastDate: string | null; documents: Bilingual[]; prepareSteps: Bilingual[];
  classes: number[]; prepareClasses: number[]; futureClasses: number[]; states: string[];
  applyUrl: string | null; sourceUrl: string; verifiedOn: string; status: FutureStatus;
};
export type FutureCard = FutureListing & { shown: FutureStatus; daysLeft: number | null; next: KeyDate | null; applyHost: string | null; officialHost: string | null };

const COLUMNS = `listing_id, hub, category, provider_type, provider, title_en, title_hi, summary_en, summary_hi, eligibility_en, eligibility_hi, benefit_en, benefit_hi, fee_en, fee_hi,
  key_dates, to_char(last_date, 'YYYY-MM-DD') as last_date, documents, prepare_steps, classes, prepare_classes, future_classes, states, apply_url, source_url,
  to_char(last_verified_at, 'YYYY-MM-DD') as verified_on, status`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const listingOf = (r: any): FutureListing => ({
  id: String(r.listing_id), hub: r.hub, category: r.category, providerType: r.provider_type, provider: r.provider,
  titleEn: r.title_en, titleHi: r.title_hi ?? null, summaryEn: r.summary_en ?? null, summaryHi: r.summary_hi ?? null,
  eligibilityEn: r.eligibility_en ?? null, eligibilityHi: r.eligibility_hi ?? null, benefitEn: r.benefit_en ?? null, benefitHi: r.benefit_hi ?? null, feeEn: r.fee_en ?? null, feeHi: r.fee_hi ?? null,
  keyDates: (r.key_dates ?? []) as KeyDate[], lastDate: r.last_date ?? null, documents: (r.documents ?? []) as Bilingual[], prepareSteps: (r.prepare_steps ?? []) as Bilingual[],
  classes: (r.classes ?? []).map(Number), prepareClasses: (r.prepare_classes ?? []).map(Number), futureClasses: (r.future_classes ?? []).map(Number), states: r.states ?? [],
  applyUrl: r.apply_url ?? null, sourceUrl: r.source_url, verifiedOn: String(r.verified_on), status: r.status,
});

// The founder's switched-on official sites outside the built-in suffixes.
export async function loadEnabledApplyDomains(db: Sql): Promise<string[]> {
  return (await db.query(`select domain from content.future_apply_domains where enabled`)).rows.map((r) => String(r.domain));
}

export const forState = (l: Pick<FutureListing, 'states'>, stateCode: string | null) => l.states.includes('ALL') || (stateCode !== null && l.states.includes(stateCode));

// One hub's listings for one child: the main list (the child's class now) and the plan-ahead row (the classes before it),
// each already filtered by the child's state, with the status as of today.
export async function loadFutureCards(db: Sql, hub: string, classLevel: number, stateCode: string | null, today: string): Promise<{ main: FutureCard[]; planAhead: FutureCard[] }> {
  const { rows } = await db.query(
    `select ${COLUMNS} from content.future_listings
      where hub = $1 and ($2::smallint = any(classes) or $2::smallint = any(prepare_classes) or $2::smallint = any(future_classes))
        and ('ALL' = any(states) or $3::text = any(states))
      order by last_date nulls last, title_en`,
    [hub, classLevel, stateCode]
  );
  const extras = await loadEnabledApplyDomains(db);
  const main: FutureCard[] = [];
  const planAhead: FutureCard[] = [];
  for (const l of rows.map(listingOf)) {
    const shown = computeStatus({ status: l.status, keyDates: l.keyDates, lastDate: l.lastDate }, today);
    if (!VISIBLE.includes(shown)) continue;
    const card: FutureCard = { ...l, shown, daysLeft: daysLeft(l.lastDate, today), next: nextEvent(l, today), applyHost: applyHostOk(l.applyUrl, extras), officialHost: applyHostOk(l.applyUrl, extras) };
    (l.classes.includes(classLevel) ? main : planAhead).push(card);
  }
  return { main, planAhead };
}

// ---- grouping (founder plan §3.10) --------------------------------------------------------------------------------

// Level 1: who runs it, in this order. Level 2: the type of listing.
export const GROUPS = ['state', 'central', 'boards', 'institutions'] as const;
export type GroupId = (typeof GROUPS)[number];
export const GROUP_OF: Record<string, GroupId> = { state: 'state', central: 'central', board_exam_body: 'boards', institution: 'institutions' };

export const TYPES = ['scholarship', 'admission_exam', 'olympiad', 'scheme', 'career'] as const;
export type TypeId = (typeof TYPES)[number];
export const TYPE_OF: Record<string, TypeId> = { scholarship: 'scholarship', admission: 'admission_exam', board_exam: 'admission_exam', olympiad: 'olympiad', central_scheme: 'scheme', state_scheme: 'scheme', entrance_exam: 'career', career: 'career', recruitment: 'career' };
// One colour per type, from the app's lesson tints: the same on the chip, the card's left edge and the badge.
export const TYPE_TINT: Record<TypeId, 'mint' | 'sky' | 'lilac' | 'butter' | 'blush'> = { scholarship: 'mint', admission_exam: 'sky', olympiad: 'lilac', scheme: 'butter', career: 'blush' };

const URGENCY: Record<string, number> = { closing_soon: 0, open: 1, upcoming: 2, expected: 3, in_progress: 4 };
export const byUrgency = (a: FutureCard, b: FutureCard) => (URGENCY[a.shown] ?? 9) - (URGENCY[b.shown] ?? 9) || (a.lastDate ?? '9999').localeCompare(b.lastDate ?? '9999') || a.titleEn.localeCompare(b.titleEn);

export type FutureGroup = { id: GroupId; types: { id: TypeId; cards: FutureCard[] }[] };

// Apply lists: everything but the exams already in progress. Level 1 then level 2; empty groups and types are left out.
export function groupCards(cards: readonly FutureCard[]): FutureGroup[] {
  const live = cards.filter((c) => c.shown !== 'in_progress');
  return GROUPS.map((g) => ({
    id: g,
    types: TYPES.map((ty) => ({ id: ty, cards: live.filter((c) => GROUP_OF[c.providerType] === g && TYPE_OF[c.category] === ty).sort(byUrgency) })).filter((t) => t.cards.length > 0),
  })).filter((g) => g.types.length > 0);
}

// "Your exams": closed to new forms but with an exam or result still ahead.
export const inProgress = (cards: readonly FutureCard[]) => cards.filter((c) => c.shown === 'in_progress').sort((a, b) => (a.next?.date ?? '').localeCompare(b.next?.date ?? ''));

// Search over the visible words of both languages.
export function matchesSearch(c: FutureListing, q: string): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return [c.titleEn, c.titleHi, c.summaryEn, c.provider, c.benefitEn].some((s) => (s ?? '').toLowerCase().includes(n));
}
