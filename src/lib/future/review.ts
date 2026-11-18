import { writeAuditLog } from '@/lib/audit/log';
import { INDIAN_STATES } from '@/lib/contracts/indian-states';
import type { Sql } from '@/lib/jobs/types';
import { indiaDate, isIsoDate } from '@/lib/time/india';
import { listingOf, type Bilingual, type FutureListing } from '@/lib/family/future-listings';
import { computeStatus } from '@/lib/family/future-status';

// Control → Content → Future: the founder's review queue. Every listing starts pending; nothing shows to a family until a
// person approves it here. A person can edit, reject, or approve; a listing with confidence under 0.8 needs a reviewer
// note to be approved (the note says what was checked). Nothing is deleted. Every change is audited with the listing before
// and after. Platform staff only (the route enforces it).

type By = { userId: string };
export const LOW_CONFIDENCE = 0.8;
// A reviewer note says what was checked: a stray key press ("1") is not one (C530).
export const NOTE_MIN = 10;
export type ReviewFilter = 'all' | 'pending' | 'low' | 'approved' | 'rejected';
export const REVIEW_FILTERS: readonly ReviewFilter[] = ['all', 'pending', 'low', 'approved', 'rejected'];

export type ReviewRow = FutureListing & {
  reviewState: string; confidence: number; reviewNote: string | null; applyUrlStatus: string; notes: string | null; seedId: string | null;
  low: boolean; cycle: string; provider: string;
};
export type DomainRow = { domain: string; enabled: boolean; who: string };

export type ReviewProblem = 'not_found' | 'title_en' | 'title_hi' | 'text' | 'url' | 'classes' | 'states' | 'last_date' | 'note_needed' | 'state' | 'domain';
type Result = { ok: true; changed?: boolean } | { ok: false; reason: ReviewProblem };

const DEVANAGARI = /[ऀ-ॿ]/;
const HTML = /[<>]/;
const COLUMNS = `listing_id, seed_id, hub, category, provider_type, provider, cycle, title_en, title_hi, summary_en, summary_hi, eligibility_en, eligibility_hi, benefit_en, benefit_hi, fee_en, fee_hi,
  key_dates, to_char(last_date, 'YYYY-MM-DD') as last_date, documents, prepare_steps, classes, prepare_classes, future_classes, states, apply_url, apply_url_status, source_url,
  to_char(last_verified_at, 'YYYY-MM-DD') as verified_on, status, review_state, review_note, confidence, notes`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowOf = (r: any): ReviewRow => ({ ...listingOf(r), reviewState: r.review_state, confidence: Number(r.confidence), reviewNote: r.review_note ?? null, applyUrlStatus: r.apply_url_status, notes: r.notes ?? null, seedId: r.seed_id ?? null, low: Number(r.confidence) < LOW_CONFIDENCE, cycle: r.cycle, provider: r.provider });

export async function listForReview(db: Sql, filter: ReviewFilter = 'all'): Promise<ReviewRow[]> {
  const where = { all: 'true', pending: `review_state in ('pending', 'changes_flagged')`, low: `confidence < ${LOW_CONFIDENCE} and review_state in ('pending', 'changes_flagged')`, approved: `review_state = 'approved'`, rejected: `review_state = 'rejected'` }[filter];
  const { rows } = await db.query(`select ${COLUMNS} from content.future_listings where ${where} order by confidence, hub, title_en`);
  return rows.map(rowOf);
}

export async function listDomains(db: Sql): Promise<DomainRow[]> {
  return (await db.query(`select domain, enabled, who_en from content.future_apply_domains order by domain`)).rows.map((r) => ({ domain: String(r.domain), enabled: Boolean(r.enabled), who: String(r.who_en) }));
}

const audit = (db: Sql, by: By, action: string, id: string, before: unknown, after: unknown, type = 'content.future_listings') =>
  writeAuditLog(db, { schoolId: null, actorUserId: by.userId, actorRole: 'super_admin', eventAction: action, targetType: type, targetId: id, beforeState: before ?? undefined, afterState: after });

const snap = (r: ReviewRow) => ({ title_en: r.titleEn, title_hi: r.titleHi, summary_en: r.summaryEn, eligibility_en: r.eligibilityEn, benefit_en: r.benefitEn, apply_url: r.applyUrl, last_date: r.lastDate, classes: r.classes, states: r.states, review_state: r.reviewState, status: r.status, note_given: Boolean(r.reviewNote) });

async function current(db: Sql, id: unknown): Promise<ReviewRow | null> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = (await db.query(`select ${COLUMNS} from content.future_listings where listing_id = $1 for update`, [id])).rows[0];
  return r ? rowOf(r) : null;
}

const oneLine = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const lines = (v: unknown): string[] => (typeof v === 'string' ? v.split('\n').map((x) => x.trim()).filter(Boolean) : []);
const httpsOk = (u: string) => /^https:\/\/[^\s<>"]+$/.test(u) && u.length <= 500;
const classList = (v: unknown): number[] | null => {
  const parts = oneLine(v).split(/[ ,]+/).filter(Boolean);
  const nums = parts.map(Number);
  return nums.every((n) => Number.isInteger(n) && n >= -2 && n <= 12) ? [...new Set(nums)].sort((a, b) => a - b) : null;
};

export type EditInput = Record<string, unknown>;

// The fields a reviewer may change. Documents and steps are one line each; the Hindi lines pair with the English by position.
export async function editListing(db: Sql, by: By, id: unknown, raw: EditInput): Promise<Result> {
  const before = await current(db, id);
  if (!before) return { ok: false, reason: 'not_found' };
  const titleEn = oneLine(raw.titleEn);
  if (!titleEn || titleEn.length > 220 || HTML.test(titleEn)) return { ok: false, reason: 'title_en' };
  const titleHi = oneLine(raw.titleHi);
  if (titleHi && (titleHi.length > 220 || HTML.test(titleHi) || !DEVANAGARI.test(titleHi))) return { ok: false, reason: 'title_hi' };
  const text = (v: unknown, max: number, hindi = false): string | null | 'bad' => {
    const s = typeof v === 'string' ? v.trim() : '';
    if (!s) return null;
    return s.length > max || HTML.test(s) || (hindi && !DEVANAGARI.test(s)) ? 'bad' : s;
  };
  const f = {
    summary_en: text(raw.summaryEn, 280), summary_hi: text(raw.summaryHi, 280, true), eligibility_en: text(raw.eligibilityEn, 1500), eligibility_hi: text(raw.eligibilityHi, 1500, true),
    benefit_en: text(raw.benefitEn, 1500), benefit_hi: text(raw.benefitHi, 1500, true), fee_en: text(raw.feeEn, 500), fee_hi: text(raw.feeHi, 500, true),
  };
  if (Object.values(f).includes('bad')) return { ok: false, reason: 'text' };
  const applyUrl = oneLine(raw.applyUrl);
  const sourceUrl = oneLine(raw.sourceUrl);
  if ((applyUrl && !httpsOk(applyUrl)) || !httpsOk(sourceUrl)) return { ok: false, reason: 'url' };
  const classes = classList(raw.classes);
  const prepare = classList(raw.prepareClasses);
  if (!classes || !prepare) return { ok: false, reason: 'classes' };
  const states = oneLine(raw.states).split(/[ ,]+/).filter(Boolean);
  if (states.length < 1 || !states.every((s) => s === 'ALL' || INDIAN_STATES.some((x) => x.code === s))) return { ok: false, reason: 'states' };
  const lastDate = oneLine(raw.lastDate);
  if (lastDate && (!isIsoDate(lastDate) || new Date(`${lastDate}T00:00:00Z`).toISOString().slice(0, 10) !== lastDate)) return { ok: false, reason: 'last_date' };
  const pair = (en: unknown, hi: unknown): Bilingual[] | 'bad' => {
    const e = lines(en);
    const h = lines(hi);
    if (e.some((x) => x.length > 400 || HTML.test(x)) || h.some((x) => x.length > 400 || HTML.test(x) || !DEVANAGARI.test(x))) return 'bad';
    return e.map((x, i) => ({ en: x, hi: h.length === e.length ? h[i] : null }));
  };
  const documents = pair(raw.documentsEn, raw.documentsHi);
  const steps = pair(raw.stepsEn, raw.stepsHi);
  if (documents === 'bad' || steps === 'bad') return { ok: false, reason: 'text' };
  const status = computeStatus({ status: before.status, keyDates: before.keyDates, lastDate: lastDate || null }, indiaDate());
  await db.query(
    `update content.future_listings set title_en = $2, title_hi = $3, summary_en = $4, summary_hi = $5, eligibility_en = $6, eligibility_hi = $7, benefit_en = $8, benefit_hi = $9, fee_en = $10, fee_hi = $11,
       apply_url = $12, source_url = $13, classes = $14::smallint[], prepare_classes = $15::smallint[], states = $16::text[], last_date = $17, documents = $18::jsonb, prepare_steps = $19::jsonb,
       status = $20, updated_by = $21, updated_at = now() where listing_id = $1`,
    [before.id, titleEn, titleHi || null, f.summary_en, f.summary_hi, f.eligibility_en, f.eligibility_hi, f.benefit_en, f.benefit_hi, f.fee_en, f.fee_hi, applyUrl || null, sourceUrl, classes, prepare, states, lastDate || null,
      JSON.stringify(documents), JSON.stringify(steps), status, by.userId]
  );
  const after = (await current(db, before.id))!;
  await audit(db, by, 'content.future_listing_edited', before.id, snap(before), snap(after));
  return { ok: true, changed: true };
}

// Approve: a low-confidence listing needs a reviewer note. The status is brought up to today's from the dates.
export async function approveListing(db: Sql, by: By, id: unknown, note: unknown): Promise<Result> {
  const before = await current(db, id);
  if (!before) return { ok: false, reason: 'not_found' };
  const n = oneLine(note).slice(0, 1000);
  if (before.low && n.length < NOTE_MIN) return { ok: false, reason: 'note_needed' };
  const status = computeStatus({ status: before.status, keyDates: before.keyDates, lastDate: before.lastDate }, indiaDate());
  await db.query(`update content.future_listings set review_state = 'approved', review_note = $2, status = $3, reviewed_by = $4, reviewed_at = now(), updated_by = $4, updated_at = now() where listing_id = $1`, [before.id, n || null, status, by.userId]);
  await audit(db, by, 'content.future_listing_approved', before.id, snap(before), { ...snap(before), review_state: 'approved', status, note_given: Boolean(n) });
  return { ok: true, changed: before.reviewState !== 'approved' };
}

export async function countPending(db: Sql): Promise<number> {
  return Number((await db.query(`select count(*)::int as n from content.future_listings where review_state = 'pending'`)).rows[0]?.n ?? 0);
}

// Approve every pending listing in one click (founder, 15 and 18 Nov 2026: he verifies the listings himself). Each row
// goes through approveListing, so its status is worked out from its dates (a listing whose date has passed is not shown
// as open) and it is audited on its own. A low-confidence row carries the note APPROVE_ALL_NOTE, so the record says who
// vouched for it. Rejected and flagged rows stay as they are. A second run changes nothing (C530).
export const APPROVE_ALL_NOTE = 'Verified by the founder; approved with Approve all.';
export async function approveAllPending(db: Sql, by: By): Promise<{ approved: number }> {
  const pending = await countPending(db);
  const { rows } = await db.query(`select listing_id::text as id from content.future_listings where review_state = 'pending' order by listing_id`);
  let approved = 0;
  for (const r of rows as { id: string }[]) {
    const res = await approveListing(db, by, r.id, APPROVE_ALL_NOTE);
    if (res.ok && res.changed) approved += 1;
  }
  await writeAuditLog(db, {
    schoolId: null, actorUserId: by.userId, actorRole: 'super_admin', eventAction: 'content.future_listing_approve_all', targetType: 'content.future_listings',
    beforeState: { pending }, afterState: { approved },
  });
  return { approved };
}

export async function rejectListing(db: Sql, by: By, id: unknown, note: unknown): Promise<Result> {
  const before = await current(db, id);
  if (!before) return { ok: false, reason: 'not_found' };
  const n = oneLine(note).slice(0, 1000);
  if (!n) return { ok: false, reason: 'note_needed' };
  await db.query(`update content.future_listings set review_state = 'rejected', review_note = $2, reviewed_by = $3, reviewed_at = now(), updated_by = $3, updated_at = now() where listing_id = $1`, [before.id, n, by.userId]);
  await audit(db, by, 'content.future_listing_rejected', before.id, snap(before), { ...snap(before), review_state: 'rejected', note_given: true });
  return { ok: true, changed: before.reviewState !== 'rejected' };
}

// The founder switches an official site on or off for Apply (off by default).
export async function setApplyDomain(db: Sql, by: By, domain: unknown, enabled: unknown): Promise<Result> {
  if (typeof domain !== 'string' || typeof enabled !== 'boolean') return { ok: false, reason: 'domain' };
  const before = (await db.query(`select enabled from content.future_apply_domains where domain = $1 for update`, [domain])).rows[0];
  if (!before) return { ok: false, reason: 'domain' };
  if (before.enabled === enabled) return { ok: true, changed: false };
  await db.query(`update content.future_apply_domains set enabled = $2, changed_by = $3, changed_at = now() where domain = $1`, [domain, enabled, by.userId]);
  await audit(db, by, enabled ? 'content.future_domain_enabled' : 'content.future_domain_disabled', domain, { enabled: before.enabled }, { enabled }, 'content.future_apply_domains');
  return { ok: true, changed: true };
}
