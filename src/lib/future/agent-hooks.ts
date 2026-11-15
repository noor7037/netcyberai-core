import type { Sql } from '@/lib/jobs/types';

// Hooks for the weekly Future agent of step 2, and nothing more. There is NO scraper here and nothing fetches a page:
//   - content.future_sources is the registry the agent will read (tier, owner, url, method, interval, robots, hash).
//   - content.future_candidates holds what it proposes, with a field-by-field diff against the live listing.
//   - content.future_submit_candidate(...) is the only door: it adds a candidate and, for a change to a listing a person
//     approved, flags the listing for review. It cannot edit a listing, so the agent never publishes. The approved values
//     stay live until a person decides in Control.
// A candidate carries, for every date and amount, the source sentence it came from; one without a sentence is dropped.

export type FieldChange = { old: unknown; new: unknown; quote: string };
export type CandidateDiff = Record<string, FieldChange>;

// What the agent may compare between a live listing and a fresh reading. Dates and links only matter here.
export const DIFFABLE_FIELDS = ['last_date', 'form_open', 'exam', 'apply_url', 'title_en', 'fee_en', 'eligibility_en'] as const;

// The diff of two readings, keeping only the fields that changed and have a source sentence. Pure.
export function diffReadings(live: Record<string, unknown>, fresh: Record<string, unknown>, quotes: Record<string, string>): CandidateDiff {
  const out: CandidateDiff = {};
  for (const f of DIFFABLE_FIELDS) {
    if (fresh[f] === undefined || JSON.stringify(live[f] ?? null) === JSON.stringify(fresh[f])) continue;
    const quote = (quotes[f] ?? '').trim();
    if (!quote) continue;
    out[f] = { old: live[f] ?? null, new: fresh[f], quote };
  }
  return out;
}

// Hands one candidate to the review queue through the only door. Platform role.
export async function submitCandidate(db: Sql, c: { listingId: string | null; sourceId: string | null; payload: Record<string, unknown>; diff: CandidateDiff; confidence: number }): Promise<string> {
  const { rows } = await db.query(`select content.future_submit_candidate($1, $2, $3::jsonb, $4::jsonb, $5) as id`, [c.listingId, c.sourceId, JSON.stringify(c.payload), JSON.stringify(c.diff), c.confidence]);
  return String(rows[0].id);
}

// The entry point of step 2. Deliberately empty: the weekly agent is a separate piece of work.
export async function runWeeklyAgent(): Promise<never> {
  throw new Error('The weekly Future agent is step 2 and is not built. Nothing is fetched.');
}
