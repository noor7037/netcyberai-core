import type { Sql } from '@/lib/jobs/types';
import { computeStatus, type FutureStatus, type KeyDate } from './status';

// The importer for the reviewed-by-nobody seed file (data/future/future_listings_seed.json, government listings only).
// It writes every row as review_state = 'pending': nothing is approved, nothing shows to a family. It is idempotent: a
// row already imported (same seed id) is left exactly as it is, so a reviewer's edits and decisions are never undone.
// Run it on a database only on purpose: `npx tsx scripts/future/import-seed.ts` (see docs/future/FUTURE-BUILD-NOV15.md).

export type SeedListing = {
  id: string; series_key: string; cycle: string; states: string[]; title_en: string; title_hi: string | null;
  provider: string; provider_type: string; category: string; hub: string;
  classes_eligible: number[]; classes_plan_ahead: number[];
  eligibility: string | null; benefit: string | null; fee: string | null;
  key_dates: { type: string; date: string; end?: string; source_quote?: string; approx?: boolean }[];
  last_date: string | null; status: string; documents: string[]; prepare_steps: string[];
  apply_url: string | null; source_url: string; confidence: number; notes: string | null; last_verified: string;
};

// The app stores a state as IN-XX; ALL is the central marker.
export const mapState = (s: string): string => (s === 'ALL' ? 'ALL' : s.startsWith('IN-') ? s : `IN-${s}`);

// Seed category → the table's category. Board exams are told apart by their series; schemes by who runs them.
export function mapCategory(l: Pick<SeedListing, 'category' | 'series_key' | 'provider_type'>): string {
  switch (l.category) {
    case 'scholarship': return 'scholarship';
    case 'admission_exam': return /board/.test(l.series_key) ? 'board_exam' : 'admission';
    case 'olympiad_talent': return 'olympiad';
    case 'scheme_benefit': return l.provider_type === 'state' ? 'state_scheme' : 'central_scheme';
    case 'career_entrance': return 'entrance_exam';
    default: throw new Error(`unknown seed category ${l.category}`);
  }
}

// The plan-ahead classes: the year before the first class that can apply is "prepare now", anything earlier is "later".
export function splitPlanAhead(eligible: readonly number[], planAhead: readonly number[]): { prepare: number[]; future: number[] } {
  const first = eligible.length ? Math.min(...eligible) : 0;
  return { prepare: planAhead.filter((c) => c >= first - 1), future: planAhead.filter((c) => c < first - 1) };
}

// One short line for the collapsed card, made from the benefit (or the eligibility): the first sentence, at most 280 characters.
export function summaryOf(l: Pick<SeedListing, 'benefit' | 'eligibility'>): string | null {
  const t = (l.benefit ?? l.eligibility ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const first = t.split(/(?<=[.!?])\s/)[0];
  return (first.length <= 280 ? first : `${first.slice(0, 277).trimEnd()}…`);
}

const toKeyDates = (l: SeedListing): KeyDate[] => l.key_dates.map((d) => ({ kind: d.type, date: d.date, end: d.end ?? null, approx: Boolean(d.approx), quote: d.source_quote ?? null }));

// An official page the seed saw over plain http is stored as https (the table accepts only https); the reviewer checks it.
const https = (u: string | null): string | null => (u ? u.replace(/^http:\/\//, 'https://') : u);

// The row to insert; pure, so the tests can check the mapping for every seed row.
export function toRow(l: SeedListing, today: string) {
  const keyDates = toKeyDates(l);
  const split = splitPlanAhead(l.classes_eligible, l.classes_plan_ahead);
  const stored = (['expected', 'upcoming', 'open', 'closing_soon', 'closed'] as const).includes(l.status as 'open') ? (l.status as FutureStatus) : 'draft';
  return {
    seed_id: l.id, hub: l.hub, category: mapCategory(l), provider_type: l.provider_type, provider: l.provider, series_key: l.series_key, cycle: l.cycle,
    title_en: l.title_en, title_hi: l.title_hi, summary_en: summaryOf(l), eligibility_en: l.eligibility, benefit_en: l.benefit, fee_en: l.fee,
    key_dates: keyDates, last_date: l.last_date,
    documents: l.documents.map((en) => ({ en, hi: null })), prepare_steps: l.prepare_steps.map((en) => ({ en, hi: null })),
    classes: l.classes_eligible, prepare_classes: split.prepare, future_classes: split.future, states: l.states.map(mapState),
    apply_url: https(l.apply_url), source_url: https(l.source_url) as string, last_verified_at: l.last_verified, confidence: l.confidence, notes: l.notes,
    status: computeStatus({ status: stored, keyDates, lastDate: l.last_date }, today),
  };
}

export type ImportResult = { inserted: number; skipped: number };

export async function importSeed(db: Sql, listings: readonly SeedListing[], today: string, by: string | null = null): Promise<ImportResult> {
  let inserted = 0;
  for (const l of listings) {
    const r = toRow(l, today);
    const res = await db.query(
      `insert into content.future_listings (seed_id, hub, category, provider_type, provider, series_key, cycle, title_en, title_hi, summary_en, eligibility_en, benefit_en, fee_en,
         key_dates, last_date, documents, prepare_steps, classes, prepare_classes, future_classes, states, apply_url, source_url, last_verified_at, confidence, notes,
         status, review_state, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16::jsonb,$17::jsonb,$18::smallint[],$19::smallint[],$20::smallint[],$21::text[],$22,$23,$24,$25,$26,$27,'pending',$28,$28)
       on conflict (seed_id) do nothing`,
      [r.seed_id, r.hub, r.category, r.provider_type, r.provider, r.series_key, r.cycle, r.title_en, r.title_hi, r.summary_en, r.eligibility_en, r.benefit_en, r.fee_en,
        JSON.stringify(r.key_dates), r.last_date, JSON.stringify(r.documents), JSON.stringify(r.prepare_steps), r.classes, r.prepare_classes, r.future_classes, r.states,
        r.apply_url, r.source_url, r.last_verified_at, r.confidence, r.notes, r.status, by]
    );
    inserted += res.rowCount ?? 0;
  }
  return { inserted, skipped: listings.length - inserted };
}
