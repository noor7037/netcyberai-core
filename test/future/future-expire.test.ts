import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { expireListings, nextCycle } from '@/lib/future/expire';
import { importSeed, type SeedListing } from '@/lib/future/seed-import';

// The daily expiry on the real migrations: statuses move on from the dates, closed items are archived and never deleted, an
// item with an exam still ahead is kept (in progress), a yearly series is copied forward as expected and pending, and a
// second run on the same day changes nothing.

const SEED = (JSON.parse(readFileSync('data/future/future_listings_seed.json', 'utf8')) as { listings: SeedListing[] }).listings;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const statusOf = async (seed: string) => (await db.pg.query(`select status from content.future_listings where seed_id = $1`, [seed])).rows[0]?.status;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await importSeed(db.pg, SEED, '2026-11-15');
  await db.pg.query(`update content.future_listings set review_state = 'approved'`);
}, 120_000);
afterAll(async () => db?.stop());

describe('the daily expiry', () => {
  it('works out the next cycle label', () => {
    expect(nextCycle('2026-27')).toBe('2027-28');
    expect(nextCycle('2027')).toBe('2028');
    expect(nextCycle('2027-29')).toBe('2029-31');
    expect(nextCycle('2026-2027')).toBe('2027-2028');
    expect(nextCycle('2027 S1')).toBe('2028 S1');
    expect(nextCycle('spring')).toBeNull();
  });

  it('on 15 Nov 2026 nothing already right moves; a second run changes nothing', async () => {
    await expireListings(db.pg, '2026-11-15');
    const again = await expireListings(db.pg, '2026-11-15');
    expect(again).toEqual({ moved: 0, archived: 0, cloned: 0 });
  });

  it('on 25 Nov 2026 the forms that closed on 22 Nov are not open; the JEE Main form (last day 22 Nov) is gone from the lists', async () => {
    const before = await statusOf('nta.jee_main.2027.s1');
    expect(['open', 'closing_soon']).toContain(before);
    await expireListings(db.pg, '2026-11-25');
    // JEE Main session 1 has an exam date still ahead (January), so it is kept, not archived.
    expect(await statusOf('nta.jee_main.2027.s1')).toBe('in_progress');
  });

  it('after its last exam date a listing is archived, never deleted, and its yearly series is copied forward as expected', async () => {
    const total = (await db.pg.query(`select count(*)::int as n from content.future_listings`)).rows[0].n;
    const r = await expireListings(db.pg, '2027-09-01');
    expect(r.archived).toBeGreaterThan(5);
    expect(r.cloned).toBeGreaterThan(0);
    expect(await statusOf('nta.jee_main.2027.s1')).toBe('archived');
    const now = (await db.pg.query(`select count(*)::int as n from content.future_listings`)).rows[0].n;
    expect(now).toBe(total + r.cloned);
    const clone = (await db.pg.query(`select cycle, status, review_state, key_dates, last_date, confidence from content.future_listings where series_key = 'nta.jee_main' and seed_id is null`)).rows;
    expect(clone.length).toBeGreaterThan(0);
    for (const c of clone) {
      expect(c.status).toBe('expected');
      expect(c.review_state).toBe('pending');
      expect(c.key_dates).toEqual([]);
      expect(c.last_date).toBeNull();
      expect(Number(c.confidence)).toBeLessThan(0.8);
    }
    expect(clone.map((c: { cycle: string }) => c.cycle).sort()).toEqual(['2028 S1', '2028 S2']);
    // Idempotent: no second copy on a second run.
    expect((await expireListings(db.pg, '2027-09-01')).cloned).toBe(0);
  });

  it('a listing with no dates (open-ended) stays open, and is not copied forward', async () => {
    expect(await statusOf('moe.pm_poshan')).toBe('open');
    expect((await db.pg.query(`select count(*)::int as n from content.future_listings where series_key = (select series_key from content.future_listings where seed_id = 'moe.pm_poshan')`)).rows[0].n).toBe(1);
  });

  it('an extension re-opens: moving the last date later brings a closed listing back from the next run of status rules', async () => {
    const { rows } = await db.pg.query(`select listing_id from content.future_listings where seed_id = 'cbse.science_exhibition.2026'`);
    await db.pg.query(`update content.future_listings set status = 'closed', last_date = '2027-09-20' where listing_id = $1`, [rows[0].listing_id]);
    await expireListings(db.pg, '2027-09-10');
    expect(await statusOf('cbse.science_exhibition.2026')).toBe('open');
  });
});
