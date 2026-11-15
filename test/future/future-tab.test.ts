import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { FutureHub } from '@/components/family/FutureHub';
import { applyHostOk } from '@/lib/future/domains';
import { groupCards, loadFutureCards, matchesSearch } from '@/lib/future/listings';
import { importSeed, mapCategory, mapState, toRow, type SeedListing } from '@/lib/future/seed-import';
import { computeStatus } from '@/lib/future/status';

// Future tab, step 1 (founder, 15 Nov 2026), on the real migrations (PGlite): the 54 government listings from the seed file
// are imported as pending, approved by the test (standing in for the founder), and for EVERY class from Nursery to 12 and
// for Delhi, Haryana and Karnataka the family query returns exactly the approved listings for that class and state,
// closed items are hidden, plan-ahead items are labelled, and Hindi renders. The expected sets below are worked out from
// the seed file's own fields by a separate, plain rule, not by the code under test.

const TODAY = '2026-11-15';
const SEED = (JSON.parse(readFileSync('data/future/future_listings_seed.json', 'utf8')) as { listings: SeedListing[] }).listings;
const ACCOUNT = '4f000000-0000-4000-8000-000000000001';
const STAFF = '4f000000-0000-4000-8000-000000000002';
const CLASSES = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const STATES = ['IN-DL', 'IN-HR', 'IN-KA'];
const HUBS = ['careers', 'exams_portal', 'opportunities'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Tx = import('pg').PoolClient;
const familyTx = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (raw: unknown) => {
    const tx = raw as Tx;
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [ACCOUNT]);
    return fn(tx);
  });

// The plain rule for "still worth showing on 15 Nov 2026", from the seed's own words.
const wantedStates = (l: SeedListing, st: string) => l.states.includes('ALL') || l.states.map(mapState).includes(st);
const stillAhead = (l: SeedListing) => l.key_dates.some((d) => !['form_open', 'last_date', 'late_fee_last_date', 'notification'].includes(d.type) && (d.end ?? d.date) >= TODAY);
const visible = (l: SeedListing) => {
  if (l.status === 'closed') return stillAhead(l);
  if (l.last_date && l.last_date < TODAY) return stillAhead(l);
  if (l.status === 'upcoming' && !l.last_date && l.key_dates.length && !stillAhead(l)) return false;
  return true;
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.query(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Illustrative Staff')`, [STAFF]);
  await db.pg.query(`insert into family.accounts (account_id, email) values ($1, 'future.parent@example.org')`, [ACCOUNT]);
}, 120_000);
afterAll(async () => db?.stop());

describe('the importer', () => {
  it('writes every seed row as pending, once, and never touches a decision on a second run', async () => {
    const first = await importSeed(db.pg, SEED, TODAY);
    expect(first).toEqual({ inserted: 54, skipped: 0 });
    expect((await db.pg.query(`select count(*)::int as n from content.future_listings where review_state = 'pending'`)).rows[0].n).toBe(54);
    // Nothing is visible to a family while pending.
    expect(await familyTx((tx) => tx.query(`select 1 from content.future_listings`)).then((r) => r.rows.length)).toBe(0);
    await db.pg.query(`update content.future_listings set review_state = 'rejected', review_note = 'kept' where seed_id = $1`, [SEED[0].id]);
    expect(await importSeed(db.pg, SEED, TODAY)).toEqual({ inserted: 0, skipped: 54 });
    expect((await db.pg.query(`select review_note from content.future_listings where seed_id = $1`, [SEED[0].id])).rows[0].review_note).toBe('kept');
    await db.pg.query(`update content.future_listings set review_state = 'pending', review_note = null where seed_id = $1`, [SEED[0].id]);
  });

  it('maps states, categories and the class split as the plan says', () => {
    expect(mapState('DL')).toBe('IN-DL');
    expect(mapState('HR')).toBe('IN-HR');
    expect(mapState('ALL')).toBe('ALL');
    expect(mapCategory({ category: 'admission_exam', series_key: 'cbse.board_exams', provider_type: 'board_exam_body' })).toBe('board_exam');
    expect(mapCategory({ category: 'scheme_benefit', series_key: 'x', provider_type: 'state' })).toBe('state_scheme');
    expect(mapCategory({ category: 'scheme_benefit', series_key: 'x', provider_type: 'central' })).toBe('central_scheme');
    for (const l of SEED) {
      const r = toRow(l, TODAY);
      expect(r.states.every((s) => s === 'ALL' || /^IN-[A-Z]{2}$/.test(s))).toBe(true);
      expect(r.classes).toEqual(l.classes_eligible);
      expect([...r.prepare_classes, ...r.future_classes].sort()).toEqual([...l.classes_plan_ahead].sort());
    }
  });

  it('keeps the pre-primary codes: the five pre-primary seed rows reach only a child of class -2, -1 or 0', () => {
    const pre = SEED.filter((l) => l.classes_eligible.some((c) => c <= 0)).map((l) => l.id);
    expect([...pre].sort()).toEqual(['dl.doe.ews_dg.2027', 'dl.doe.nursery_general.2027', 'kvs.admission.2027', 'moe.pm_poshan', 'mof.sukanya_samriddhi']);
  });
});

describe('what each class and state sees (approved listings only)', () => {
  beforeAll(async () => {
    await db.pg.query(`update content.future_listings set review_state = 'approved', reviewed_by = $1, reviewed_at = now()`, [STAFF]);
  });

  for (const st of STATES) {
    it(`state ${st}: every class from Nursery to 12 sees exactly its approved, still-live listings`, async () => {
      for (const cls of CLASSES) {
        for (const hub of HUBS) {
          const got = await familyTx((tx) => loadFutureCards(tx, hub, cls, st, TODAY));
          const mainWant = SEED.filter((l) => l.hub === hub && l.classes_eligible.includes(cls) && wantedStates(l, st) && visible(l)).map((l) => l.id).sort();
          const planWant = SEED.filter((l) => l.hub === hub && !l.classes_eligible.includes(cls) && l.classes_plan_ahead.includes(cls) && wantedStates(l, st) && visible(l)).map((l) => l.id).sort();
          const ids = async (cards: { id: string }[]) => {
            const { rows } = await db.pg.query(`select listing_id, seed_id from content.future_listings where listing_id = any($1::uuid[])`, [cards.map((c) => c.id)]);
            return rows.map((r: { seed_id: string }) => r.seed_id).sort();
          };
          expect(await ids(got.main), `${st} class ${cls} ${hub} main`).toEqual(mainWant);
          expect(await ids(got.planAhead), `${st} class ${cls} ${hub} plan-ahead`).toEqual(planWant);
          // Closed items are never shown as open.
          for (const c of [...got.main, ...got.planAhead]) expect(['closed', 'archived', 'withdrawn', 'draft']).not.toContain(c.shown);
        }
      }
    });
  }

  it('Delhi and Haryana listings never reach another state, and each reaches its own', async () => {
    const all = async (st: string) => {
      const out: string[] = [];
      for (const cls of CLASSES) for (const hub of HUBS) {
        const g = await familyTx((tx) => loadFutureCards(tx, hub, cls, st, TODAY));
        out.push(...[...g.main, ...g.planAhead].map((c) => c.states.join(',')));
      }
      return out;
    };
    const ka = await all('IN-KA');
    expect(ka.some((s) => s.includes('IN-DL') || s.includes('IN-HR'))).toBe(false);
    expect((await all('IN-DL')).some((s) => s === 'IN-DL')).toBe(true);
    expect((await all('IN-HR')).some((s) => s === 'IN-HR')).toBe(true);
    expect((await all('IN-DL')).some((s) => s.includes('IN-HR'))).toBe(false);
  });

  it('a child with no state sees only the central listings', async () => {
    const g = await familyTx((tx) => loadFutureCards(tx, 'exams_portal', 10, null, TODAY));
    expect(g.main.every((c) => c.states.includes('ALL'))).toBe(true);
  });

  it('a rejected, pending or withdrawn listing never shows, even when its dates say open', async () => {
    const before = await familyTx((tx) => loadFutureCards(tx, 'exams_portal', 12, 'IN-DL', TODAY));
    const victim = before.main[0];
    for (const [col, val] of [['review_state', 'rejected'], ['review_state', 'pending'], ['status', 'withdrawn']]) {
      await db.pg.query(`update content.future_listings set ${col} = $2 where listing_id = $1`, [victim.id, val]);
      const g = await familyTx((tx) => loadFutureCards(tx, 'exams_portal', 12, 'IN-DL', TODAY));
      expect(g.main.map((c) => c.id)).not.toContain(victim.id);
      await db.pg.query(`update content.future_listings set review_state = 'approved', status = $2 where listing_id = $1`, [victim.id, victim.status]);
    }
  });

  it('the family role can read but never write a listing', async () => {
    await expect(familyTx((tx) => tx.query(`update content.future_listings set title_en = 'x'`))).rejects.toThrow();
    await expect(familyTx((tx) => tx.query(`select 1 from content.future_sources`))).rejects.toThrow();
    await expect(familyTx((tx) => tx.query(`select 1 from content.future_candidates`))).rejects.toThrow();
  });
});

describe('status, expiry and the screen', () => {
  const dated = (kd: { kind: string; date: string; approx?: boolean }[], last: string | null, status: 'open' | 'expected' | 'upcoming' | 'closed' = 'open') => ({ status, keyDates: kd, lastDate: last });
  it('computes the lifecycle in days', () => {
    expect(computeStatus(dated([{ kind: 'last_date', date: '2026-11-22' }], '2026-11-22'), TODAY)).toBe('closing_soon');
    expect(computeStatus(dated([{ kind: 'last_date', date: '2026-12-22' }], '2026-12-22'), TODAY)).toBe('open');
    expect(computeStatus(dated([{ kind: 'last_date', date: TODAY }], TODAY), TODAY)).toBe('closing_soon');
    expect(computeStatus(dated([{ kind: 'form_open', date: '2027-01-05' }, { kind: 'last_date', date: '2027-02-03' }], '2027-02-03'), TODAY)).toBe('upcoming');
    expect(computeStatus(dated([{ kind: 'last_date', date: '2026-11-14' }], '2026-11-14'), TODAY)).toBe('closed');
    expect(computeStatus(dated([{ kind: 'last_date', date: '2026-11-14' }, { kind: 'exam', date: '2026-11-28' }], '2026-11-14'), TODAY)).toBe('in_progress');
    expect(computeStatus(dated([{ kind: 'last_date', date: '2026-11-14' }, { kind: 'exam', date: '2026-11-20' }], '2026-11-14'), '2026-11-21')).toBe('closed');
    expect(computeStatus(dated([], null, 'expected'), TODAY)).toBe('expected');
    expect(computeStatus(dated([{ kind: 'form_open', date: '2027-04-01', approx: true }], null, 'expected'), TODAY)).toBe('expected');
    // An extension re-opens a closed item.
    expect(computeStatus(dated([{ kind: 'last_date', date: '2026-11-30' }], '2026-11-30', 'closed'), TODAY)).toBe('open');
  });

  it('only the official sites get a link: suffixes always, extras only when switched on', () => {
    expect(applyHostOk('https://www.jeemain.nta.nic.in/x', [])).toBe('jeemain.nta.nic.in');
    expect(applyHostOk('https://scholarships.gov.in', [])).toBe('scholarships.gov.in');
    expect(applyHostOk('https://iimidr.ac.in', [])).toBe('iimidr.ac.in');
    expect(applyHostOk('https://bseh.org.in', [])).toBeNull();
    expect(applyHostOk('https://bseh.org.in', ['bseh.org.in'])).toBe('bseh.org.in');
    expect(applyHostOk('https://evil.example.com/gov.in', [])).toBeNull();
    expect(applyHostOk('https://gov.in.evil.com', [])).toBeNull();
    expect(applyHostOk('http://scholarships.gov.in', [])).toBeNull();
    expect(applyHostOk('https://user:pw@scholarships.gov.in', [])).toBeNull();
  });

  it('the allowlist table holds the seven extra domains, all off', async () => {
    const { rows } = await db.pg.query(`select domain, enabled from content.future_apply_domains order by domain`);
    expect(rows.map((r: { domain: string }) => r.domain)).toEqual(['academic.cbseit.in', 'bseh.org.in', 'iapt.org.in', 'iiseradmission.in', 'n-csc.in', 'nid.edu', 'registration.buniyaadhry.com']);
    expect(rows.every((r: { enabled: boolean }) => r.enabled === false)).toBe(true);
  });

  // All three hubs on one page, so a test reads every section at once.
  const render = async (cls: number, st: string, lang: 'en' | 'hi', q = '') => {
    const gs = await Promise.all(HUBS.map((hub) => familyTx((tx) => loadFutureCards(tx, hub, cls, st, TODAY))));
    return renderToStaticMarkup(createElement(FutureHub, { cards: gs.flatMap((g) => g.main), planAhead: gs.flatMap((g) => g.planAhead), lang, classLevel: cls, stateCode: st, q, path: '/family/future/exams' }));
  };

  it('Class 12 in Delhi: groups, chips, countdown, Apply to an official site, verified date; in English and Hindi', async () => {
    const en = await render(12, 'IN-DL', 'en');
    expect(en).toContain('Central Government');
    expect(en).toContain('Delhi Government');
    expect(en).toContain('Open now');
    expect(en).toContain('days left');
    expect(en).toContain('Verified on');
    expect(en).toContain('data-future-apply="apply"');
    expect(en).toContain('rel="noopener noreferrer"');
    expect(en).toContain('Opens ');
    const hi = await render(12, 'IN-DL', 'hi');
    expect(hi).toMatch(/[ऀ-ॿ]/);
    expect(hi).toContain('केंद्र सरकार');
    expect(hi).toContain('अभी खुला है');
    expect(hi).toContain('दिन बचे हैं');
    expect(hi).toContain('आवेदन करें');
    expect(hi).not.toContain('Open now');
  });

  it('an expected listing has no Apply button and says the dates are not out', async () => {
    const html = await render(12, 'IN-DL', 'en');
    const expected = html.split('<li ').filter((x) => x.includes('data-status="expected"'));
    expect(expected.length).toBeGreaterThan(0);
    for (const card of expected) expect(card).not.toContain('data-future-apply');
    expect(html).toContain('Official dates are not out yet');
  });

  it('Plan ahead is labelled and its cards are not in the main list', async () => {
    const html = await render(9, 'IN-HR', 'en');
    expect(html).toContain('data-future-plan');
    expect(html).toContain('Plan ahead');
    const hi = await render(9, 'IN-HR', 'hi');
    expect(hi).toContain('आगे की तैयारी');
  });

  it('closed items are not rendered; a form that closed with an exam ahead sits under Your exams', async () => {
    const html = await render(5, 'IN-DL', 'en');
    expect(html).not.toContain('data-status="closed"');
    expect(html).toContain('data-future-exams');
    expect(html).toContain('Your exams');
  });

  it('search narrows the list; no match says so', async () => {
    const hit = await render(12, 'IN-DL', 'en', 'JEE Main');
    expect(hit).toContain('JEE Main');
    expect(hit).not.toContain('NIFT Entrance');
    expect(await render(12, 'IN-DL', 'en', 'zzzz-nothing')).toContain('Nothing matches your search.');
    expect(matchesSearch({ titleEn: 'A', titleHi: 'जेईई', summaryEn: null, provider: 'P', benefitEn: null } as never, 'जेईई')).toBe(true);
  });

  it('every class renders in English and Hindi without a stray key', async () => {
    for (const cls of CLASSES) for (const lang of ['en', 'hi'] as const) {
      const html = await render(cls, 'IN-DL', lang);
      expect(html).not.toMatch(/fam\.future\./);
      expect(html).not.toContain('undefined');
    }
  });

  it('groups state, central, boards, institutions in order, by type inside', async () => {
    const g = await familyTx((tx) => loadFutureCards(tx, 'exams_portal', 12, 'IN-DL', TODAY));
    const groups = groupCards(g.main);
    const order = ['state', 'central', 'boards', 'institutions'];
    expect(groups.map((x) => order.indexOf(x.id))).toEqual([...groups.map((x) => order.indexOf(x.id))].sort((a, b) => a - b));
  });
});
