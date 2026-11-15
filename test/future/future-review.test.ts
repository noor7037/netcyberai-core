import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { GET, POST } from '@/app/api/control/content/future/route';
import { importSeed, type SeedListing } from '@/lib/future/seed-import';
import { loadFutureCards } from '@/lib/family/future-listings';
import { listForReview } from '@/lib/future/review';

// The founder's review queue (Control → Content → Future), on the real migrations: staff only; nothing approved by the
// importer; a low-confidence listing needs a note to be approved; edits are validated and audited; the founder's switch for
// an official site turns Apply on for exactly that site. Every address and name is from the seed or made up.

const TODAY = '2026-11-15';
const SEED = (JSON.parse(readFileSync('data/future/future_listings_seed.json', 'utf8')) as { listings: SeedListing[] }).listings;
const state = vi.hoisted(() => ({ claims: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (_c: any, fn: any) => staffTx(fn),
}));
const u = (n: number) => `4f100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [STAFF, PRINCIPAL, SCHOOL, ACCOUNT] = [u(1), u(2), u(3), u(4)];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Tx = import('pg').PoolClient;
const staffTx = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (raw: unknown) => {
    const tx = raw as Tx;
    await tx.query('set local role nca_super');
    for (const [k, v] of [['app.current_tenant_id', '00000000-0000-0000-0000-000000000000'], ['app.current_role', 'super_admin'], ['app.current_user_id', STAFF]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const familyTx = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (raw: unknown) => {
    const tx = raw as Tx;
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [ACCOUNT]);
    return fn(tx);
  });
const claims = (role: string, sub: string, schoolId: string | null) => ({ sub, role, schoolId, membershipId: null, tokenVersion: 0, aal: 'aal2', sessionId: u(70) });
const staff = claims('super_admin', STAFF, null);
const req = (method: string, body?: unknown, qs = '') => new NextRequest(`http://localhost/api/control/content/future${qs}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = async (who: any, fn: () => Promise<Response>) => {
  state.claims = who;
  const res = await fn();
  return { status: res.status, body: await res.json() };
};
const post = (who: unknown, body: unknown) => call(who, () => POST(req('POST', body)));
const idOf = async (seed: string) => String((await db.pg.query(`select listing_id from content.future_listings where seed_id = $1`, [seed])).rows[0].listing_id);
const audits = async (id: string) => (await db.pg.query(`select event_action, actor_user_id from audit_log where target_id = $1 order by audit_id`, [id])).rows;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.query(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Illustrative Staff')`, [STAFF]);
  await db.pg.query(`insert into family.accounts (account_id, email) values ($1, 'review.parent@example.org')`, [ACCOUNT]);
  await importSeed(db.pg, SEED, TODAY);
}, 120_000);
afterAll(async () => db?.stop());

describe('the review queue', () => {
  it('is staff only', async () => {
    expect((await call(claims('principal', PRINCIPAL, SCHOOL), () => GET(req('GET')))).status).toBe(403);
    expect((await call(null, () => GET(req('GET')))).status).toBe(401);
    expect((await post(claims('principal', PRINCIPAL, SCHOOL), { action: 'approve', listingId: u(9) })).status).toBe(403);
    expect((await call(staff, () => GET(req('GET')))).status).toBe(200);
  });

  it('lists the pending rows, and the low-confidence filter holds exactly the rows under 0.8', async () => {
    const all = await call(staff, () => GET(req('GET', undefined, '?filter=pending')));
    expect(all.body.listings).toHaveLength(54);
    const low = await call(staff, () => GET(req('GET', undefined, '?filter=low')));
    const want = SEED.filter((l) => l.confidence < 0.8).length;
    expect(want).toBeGreaterThan(20);
    expect(low.body.listings).toHaveLength(want);
    expect(low.body.listings.every((l: { confidence: number; low: boolean }) => l.confidence < 0.8 && l.low)).toBe(true);
    expect(low.body.listings[0].keyDates).toBeDefined();
    expect(all.body.domains).toHaveLength(7);
  });

  it('a high-confidence listing is approved at once; a low one needs a note first; both are audited', async () => {
    const high = await idOf('nta.jee_main.2027.s1');
    const lowId = await idOf('dl.doe.rpvv.2027');
    expect((await post(staff, { action: 'approve', listingId: high })).status).toBe(200);
    const refused = await post(staff, { action: 'approve', listingId: lowId, note: '  ' });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('note_needed');
    expect((await post(staff, { action: 'approve', listingId: lowId, note: 'Checked edudel page 15 Nov: no 2027 dates yet.' })).status).toBe(200);
    expect((await audits(high)).map((a: { event_action: string }) => a.event_action)).toEqual(['content.future_listing_approved']);
    expect((await audits(lowId))[0].actor_user_id).toBe(STAFF);
    // Only the approved two reach a family.
    const rows = await familyTx((tx) => tx.query(`select seed_id from content.future_listings order by seed_id`));
    expect(rows.rows.map((r: { seed_id: string }) => r.seed_id)).toEqual(['dl.doe.rpvv.2027', 'nta.jee_main.2027.s1']);
  });

  it('reject needs a note, hides the listing and keeps the row', async () => {
    const id = await idOf('nsp.postmatric.2026');
    expect((await post(staff, { action: 'reject', listingId: id, note: '' })).body.code).toBe('note_needed');
    expect((await post(staff, { action: 'reject', listingId: id, note: 'Date not on NSP.' })).status).toBe(200);
    const rej = await call(staff, () => GET(req('GET', undefined, '?filter=rejected')));
    expect(rej.body.listings.map((l: { id: string }) => l.id)).toEqual([id]);
    expect((await db.pg.query(`select 1 from content.future_listings where listing_id = $1`, [id])).rows).toHaveLength(1);
  });

  const edit = (id: string, over: Record<string, unknown> = {}) => ({
    action: 'edit', listingId: id, titleEn: 'Edited title', titleHi: 'संपादित शीर्षक', summaryEn: 'One line.', summaryHi: '', eligibilityEn: 'Class 12.', eligibilityHi: '', benefitEn: '', benefitHi: '', feeEn: '', feeHi: '',
    applyUrl: 'https://scholarships.gov.in/', sourceUrl: 'https://scholarships.gov.in/', classes: '11, 12', prepareClasses: '10', states: 'ALL', lastDate: '2026-12-20', documentsEn: 'Marksheet\nPhoto', documentsHi: 'अंकपत्र\nफ़ोटो', stepsEn: 'Register', stepsHi: '', ...over,
  });

  it('an edit is validated, written, and audited with before and after; the Hindi pairs with the English', async () => {
    const id = await idOf('nsp.prematric_other.2026');
    for (const [over, code] of [[{ titleEn: '' }, 'title_en'], [{ titleHi: 'English only' }, 'title_hi'], [{ applyUrl: 'http://x.gov.in' }, 'url'], [{ classes: '13' }, 'classes'], [{ states: 'IN-ZZ' }, 'states'], [{ lastDate: '2026-02-30' }, 'last_date'], [{ benefitEn: '<b>x</b>' }, 'text']] as const) {
      const r = await post(staff, edit(id, over));
      expect([r.status, r.body.code], JSON.stringify(over)).toEqual([400, code]);
    }
    expect((await post(staff, edit(id))).status).toBe(200);
    const row = (await db.pg.query(`select title_en, title_hi, classes, prepare_classes, documents, to_char(last_date,'YYYY-MM-DD') as ld, status from content.future_listings where listing_id = $1`, [id])).rows[0];
    expect(row.title_en).toBe('Edited title');
    expect(row.classes).toEqual([11, 12]);
    expect(row.documents).toEqual([{ en: 'Marksheet', hi: 'अंकपत्र' }, { en: 'Photo', hi: 'फ़ोटो' }]);
    expect(row.ld).toBe('2026-12-20');
    expect((await audits(id)).map((a: { event_action: string }) => a.event_action)).toEqual(['content.future_listing_edited']);
  });

  it('the founder’s switch turns Apply on for exactly one extra site, and back off', async () => {
    const id = await idOf('hr.bseh.board.2027');
    await post(staff, { action: 'approve', listingId: id, note: 'ok' });
    const apply = async () => (await familyTx((tx) => loadFutureCards(tx, 'exams_portal', 10, 'IN-HR', TODAY))).main.find((c) => c.id === id)?.applyHost ?? null;
    expect(await apply()).toBeNull();
    expect((await post(staff, { action: 'domain', domain: 'bseh.org.in', enabled: true })).status).toBe(200);
    expect(await apply()).toBe('bseh.org.in');
    expect((await post(staff, { action: 'domain', domain: 'nid.edu', enabled: true })).status).toBe(200);
    expect((await post(staff, { action: 'domain', domain: 'bseh.org.in', enabled: false })).status).toBe(200);
    expect(await apply()).toBeNull();
    expect((await post(staff, { action: 'domain', domain: 'not-listed.example', enabled: true })).body.code).toBe('domain');
    expect((await audits('bseh.org.in')).map((a: { event_action: string }) => a.event_action)).toEqual(['content.future_domain_enabled', 'content.future_domain_disabled']);
  });

  it('a listing flagged by the agent’s door goes back to review and its old values stay live until decided', async () => {
    const id = await idOf('nta.jee_main.2027.s1');
    await staffTx((tx) => tx.query(`select content.future_submit_candidate($1, null, '{"last_date":"2026-12-01"}'::jsonb, '{"last_date":{"old":"2026-11-22","new":"2026-12-01","quote":"q"}}'::jsonb, 0.9)`, [id]));
    const flagged = (await staffTx((tx) => listForReview(tx, 'pending'))).map((l) => l.id);
    expect(flagged).toContain(id);
    // The approved values stay live until a person decides; the agent changed nothing in the listing itself.
    expect((await familyTx((tx) => tx.query(`select 1 from content.future_listings where listing_id = $1 and to_char(last_date, 'YYYY-MM-DD') = '2026-11-22'`, [id]))).rows).toHaveLength(1);
    await expect(familyTx((tx) => tx.query(`select content.future_submit_candidate($1, null, '{}'::jsonb, '{}'::jsonb, 0.5)`, [id]))).rejects.toThrow();
  });
});

describe('the hooks for the weekly agent (no scraper)', () => {
  it('keeps only changed fields that carry a source sentence', async () => {
    const { diffReadings, runWeeklyAgent, submitCandidate } = await import('@/lib/future/agent-hooks');
    expect(diffReadings({ last_date: '2026-11-22', apply_url: 'https://a.gov.in' }, { last_date: '2026-12-01', apply_url: 'https://a.gov.in', fee_en: '₹100' }, { last_date: 'Last date extended to 1 December 2026', fee_en: '' })).toEqual({
      last_date: { old: '2026-11-22', new: '2026-12-01', quote: 'Last date extended to 1 December 2026' },
    });
    await expect(runWeeklyAgent()).rejects.toThrow(/not built/);
    const id = await idOf('nta.jee_main.2027.s2');
    const cand = await staffTx((tx) => submitCandidate(tx, { listingId: id, sourceId: null, payload: { last_date: '2027-02-10' }, diff: { last_date: { old: '2027-02-03', new: '2027-02-10', quote: 'q' } }, confidence: 0.9 }));
    expect((await db.pg.query(`select state, listing_id from content.future_candidates where candidate_id = $1`, [cand])).rows[0]).toEqual({ state: 'pending', listing_id: id });
    // The registry exists and is empty: nothing is fetched in step 1.
    expect((await db.pg.query(`select count(*)::int as n from content.future_sources`)).rows[0].n).toBe(0);
  });
});
