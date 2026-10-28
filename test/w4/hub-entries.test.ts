import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { GET as getHubs, POST as postHubs } from '@/app/api/control/content/hubs/route';
import { listHubEntriesForControl, sourceUrlOk, validateHubEntry } from '@/lib/content/hub-entries';
import { hubText, loadHubEntries } from '@/lib/family/hubs';
import { indiaDate } from '@/lib/time/india';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// W4-3 (C387): the entries of the three hubs, added in Control → Content → Hubs and read by the family app. On the real
// migrations (PGlite): families see only published entries before their review day, in their class band, national or
// of their own state; no school role and no public role reaches the table; the platform role never deletes. The
// routes: staff only, validated, audited with the entry before and after. Every name and link below is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, page: null as unknown, tx: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (_claims: any, fn: any) => staffTx(fn),
}));
vi.mock('@/lib/family/server', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    requireFamilyPage: async () => state.page,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    familyPageRead: (_page: unknown, fn: any) => familyTx(fn),
  };
});
vi.mock('@/lib/family/flags', () => ({ familyModuleOn: async () => true }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));

const u = (n: number) => `4e000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [SCHOOL, PRINCIPAL, STAFF, ACCOUNT] = [u(1), u(2), u(3), u(4)];

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
const asRole = <T>(role: string, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (raw: unknown) => {
    const tx = raw as Tx;
    await tx.query(`set local role ${role}`);
    return fn(tx);
  });

const day = (offset: number) => {
  const d = new Date(`${indiaDate()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const URL_OK = 'https://example.invalid/official-page';
const entry = (over: Record<string, unknown> = {}) => ({
  hub: 'careers',
  titleEn: 'A career path (illustrative)',
  titleHi: '',
  bodyEn: 'An illustrative line.',
  bodyHi: '',
  scope: 'national',
  stateCode: '',
  classFrom: 6,
  classTo: 12,
  sourceUrl: URL_OK,
  verifiedOn: day(-3),
  reviewOn: day(90),
  ...over,
});

async function seed(title: string, o: { hub?: string; status?: string; scope?: string; state?: string | null; from?: number; to?: number; review?: string; verified?: string }) {
  await db.pg.query(
    `insert into content.hub_entries (hub, title_en, body_en, scope, state_code, class_from, class_to, source_url, verified_on, review_on, status, created_by, updated_by)
     values ($1, $2, 'Illustrative.', $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
    [o.hub ?? 'careers', title, o.scope ?? 'national', o.state ?? null, o.from ?? 1, o.to ?? 12, URL_OK, o.verified ?? day(-400), o.review ?? day(30), o.status ?? 'published', STAFF]
  );
}
const seen = async (hub: string, cls: number, st: string | null) => (await familyTx((tx) => loadHubEntries(tx, hub, cls, st))).map((e) => e.titleEn).sort();

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.query(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Illustrative Staff')`, [STAFF]);
  await db.pg.query(`insert into family.accounts (account_id, email) values ($1, 'w43.parent@example.org')`, [ACCOUNT]);
}, 120_000);
afterAll(async () => db?.stop());

describe('what a family sees', () => {
  it('only published entries before their review day: never a draft, a withdrawn one or an expired one', async () => {
    await seed('shown', {});
    await seed('draft', { status: 'draft' });
    await seed('withdrawn', { status: 'withdrawn' });
    await seed('expired', { review: day(-1) });
    await seed('last day', { review: day(0) });
    expect(await seen('careers', 8, null)).toEqual(['last day', 'shown']);
    // The raw table, as the family role, holds the same rule: no filter in the code is needed.
    expect((await familyTx((tx) => tx.query(`select title_en from content.hub_entries order by title_en`))).rows.map((r: { title_en: string }) => r.title_en)).toEqual(['last day', 'shown']);
  });

  it('a state entry only to a child of that state; a national entry to all', async () => {
    await seed('nat-s', { hub: 'opportunities' });
    await seed('up-s', { hub: 'opportunities', scope: 'state', state: 'IN-UP' });
    await seed('hr-s', { hub: 'opportunities', scope: 'state', state: 'IN-HR' });
    expect(await seen('opportunities', 8, 'IN-UP')).toEqual(['nat-s', 'up-s']);
    expect(await seen('opportunities', 8, 'IN-HR')).toEqual(['hr-s', 'nat-s']);
    expect(await seen('opportunities', 8, null)).toEqual(['nat-s']);
    expect(await seen('opportunities', 8, 'IN-KL')).toEqual(['nat-s']);
  });

  it('only the child’s class band, and only the hub asked for', async () => {
    await seed('band-6-8', { hub: 'exams_portal', from: 6, to: 8 });
    await seed('band-nursery', { hub: 'exams_portal', from: -2, to: 0 });
    expect(await seen('exams_portal', 6, null)).toEqual(['band-6-8']);
    expect(await seen('exams_portal', 8, null)).toEqual(['band-6-8']);
    expect(await seen('exams_portal', 9, null)).toEqual([]);
    expect(await seen('exams_portal', -2, null)).toEqual(['band-nursery']);
    expect(await seen('careers', 6, null)).not.toContain('band-6-8');
  });

  it('the hub page shows the title, the text, a Source link opening safely and the day it was checked; Hindi where it exists', async () => {
    await db.pg.query(
      `insert into content.hub_entries (hub, title_en, title_hi, body_en, body_hi, scope, class_from, class_to, source_url, verified_on, review_on, status, created_by, updated_by)
       values ('careers', 'Page entry', 'पृष्ठ प्रविष्टि', 'English text', 'हिंदी पाठ', 'national', 1, 12, 'https://example.invalid/page-entry', '2026-10-01', $1, 'published', $2, $2),
              ('careers', 'English only', null, 'Only English', null, 'national', 1, 12, 'https://example.invalid/en-only', '2026-10-02', $1, 'published', $2, $2)`,
      [day(60), STAFF]
    );
    const { HubShell } = await import('@/components/family/HubShell');
    for (const lang of ['en', 'hi'] as const) {
      const child = { childId: u(9), firstName: 'Asha', classLevel: 8, board: 'CBSE', language: lang, style: lang, stateCode: 'IN-UP', freeSubject: null };
      state.page = { session: { accountId: ACCOUNT, tokenVersion: 0 }, account: { hasPin: true }, consents: { study_core: true }, children: [child], child, parentMode: false, childLang: lang, parentLang: 'en' };
      const html = renderToStaticMarkup(await HubShell({ module: 'careers' }));
      expect(html).toContain('href="https://example.invalid/page-entry"');
      expect(html).toMatch(/<a [^>]*target="_blank"[^>]*rel="noopener noreferrer"|<a [^>]*rel="noopener noreferrer"[^>]*target="_blank"/);
      expect(html).toContain(lang === 'hi' ? 'स्रोत' : 'Source');
      expect(html).toContain(lang === 'hi' ? 'अक्तू॰ 2026' : '1 Oct 2026');
      expect(html).toContain('Only English');
      if (lang === 'hi') {
        expect(html).toContain('<h3 lang="hi"');
        expect(html).toContain('पृष्ठ प्रविष्टि');
        expect(html).toContain('हिंदी पाठ');
        expect(html).toContain('<h3 lang="en"');
      } else {
        expect(html).toContain('Page entry');
        expect(html).not.toContain('पृष्ठ प्रविष्टि');
      }
    }
    // A section with nothing keeps its honest line.
    const child = { childId: u(9), firstName: 'Asha', classLevel: 8, board: 'CBSE', language: 'en', style: 'en', stateCode: 'IN-UP', freeSubject: null };
    state.page = { session: { accountId: ACCOUNT, tokenVersion: 0 }, account: { hasPin: true }, consents: { study_core: true }, children: [child], child, parentMode: false, childLang: 'en', parentLang: 'en' };
    expect(renderToStaticMarkup(await HubShell({ module: 'exams_portal' }))).toContain('data-hub-empty');
  });

  it('chooses the Hindi text only when the app is in Hindi and it exists', () => {
    const e = { id: '1', titleEn: 'T', titleHi: 'शीर्षक', bodyEn: 'B', bodyHi: null, stateCode: null, sourceUrl: URL_OK, verifiedOn: '2026-10-01' };
    expect(hubText(e, 'hi')).toEqual({ title: 'शीर्षक', titleLang: 'hi', body: 'B', bodyLang: 'en' });
    expect(hubText(e, 'en')).toEqual({ title: 'T', titleLang: 'en', body: 'B', bodyLang: 'en' });
  });
});

describe('who reaches the table', () => {
  it('no school role, no public role: nothing; the family role cannot write; the platform role cannot delete', async () => {
    for (const role of ['app_user', 'anon', 'authenticated']) await expect(asRole(role, (tx) => tx.query(`select * from content.hub_entries`))).rejects.toThrow(/permission denied/);
    await expect(asRole('app_user', (tx) => tx.query(`insert into content.hub_entries (hub, title_en, body_en, scope, class_from, class_to, source_url, verified_on, review_on, created_by, updated_by) values ('careers','x','x','national',1,2,'${URL_OK}','2026-01-01','2026-02-01','${STAFF}','${STAFF}')`))).rejects.toThrow(/permission denied/);
    await expect(familyTx((tx) => tx.query(`update content.hub_entries set status = 'withdrawn'`))).rejects.toThrow(/permission denied/);
    await expect(familyTx((tx) => tx.query(`insert into content.hub_entries (hub, title_en, body_en, scope, class_from, class_to, source_url, verified_on, review_on, created_by, updated_by) values ('careers','x','x','national',1,2,'${URL_OK}','2026-01-01','2026-02-01','${STAFF}','${STAFF}')`))).rejects.toThrow(/permission denied/);
    await expect(staffTx((tx) => tx.query(`delete from content.hub_entries`))).rejects.toThrow(/permission denied/);
    expect((await staffTx((tx) => tx.query(`select count(*)::int as n from content.hub_entries`))).rows[0].n).toBeGreaterThan(5);
  });

  it('the columns refuse an entry without an https source, a state without its code, a day out of order or markup', async () => {
    const row = (set: string) => staffTx((tx) => tx.query(`insert into content.hub_entries (hub, title_en, body_en, scope, state_code, class_from, class_to, source_url, verified_on, review_on, created_by, updated_by) values ${set}`));
    const ok = `'careers', 'x', 'x', 'national', null, 1, 2, '${URL_OK}', '2026-01-01', '2026-02-01', '${STAFF}', '${STAFF}'`;
    await expect(row(`(${ok.replace(URL_OK, 'http://example.invalid/a')})`)).rejects.toThrow(/check constraint/);
    await expect(row(`(${ok.replace(URL_OK, 'https://exa mple.invalid')})`)).rejects.toThrow(/check constraint/);
    await expect(row(`(${ok.replace("'national', null", "'state', null")})`)).rejects.toThrow(/check constraint/);
    await expect(row(`(${ok.replace("'national', null", "'national', 'IN-UP'")})`)).rejects.toThrow(/check constraint/);
    await expect(row(`(${ok.replace("'2026-02-01'", "'2026-01-01'")})`)).rejects.toThrow(/check constraint/);
    await expect(row(`(${ok.replace('1, 2', '5, 2')})`)).rejects.toThrow(/check constraint/);
    await expect(row(`(${ok.replace('1, 2', '-3, 2')})`)).rejects.toThrow(/check constraint/);
    await expect(row(`(${ok.replace("'x', 'x'", "'<b>x</b>', 'x'")})`)).rejects.toThrow(/check constraint/);
    await expect(row(`(${ok.replace("'careers'", "'games'")})`)).rejects.toThrow(/check constraint/);
    await expect(row(`(${ok.replace(URL_OK, '')})`)).rejects.toThrow(/check constraint/);
  });
});

describe('validation', () => {
  it('accepts a good entry, trims it, and gives each problem its code', () => {
    const good = validateHubEntry(entry({ titleEn: '  A   title ', bodyEn: 'Line one.\r\n\r\n\r\n\r\nLine two.' }));
    expect(good).toMatchObject({ ok: true, value: { titleEn: 'A title', bodyEn: 'Line one.\n\nLine two.', titleHi: null, stateCode: null } });
    const code = (o: Record<string, unknown>) => {
      const r = validateHubEntry(entry(o));
      return r.ok ? 'ok' : r.reason;
    };
    expect(code({ hub: 'games' })).toBe('hub');
    expect(code({ titleEn: '' })).toBe('title_en');
    expect(code({ titleEn: 'x'.repeat(161) })).toBe('title_en');
    expect(code({ titleEn: '<b>x</b>' })).toBe('title_en');
    expect(code({ titleHi: 'English words' })).toBe('title_hi');
    expect(code({ titleHi: 'हिंदी शीर्षक' })).toBe('ok');
    expect(code({ bodyEn: ' ' })).toBe('body_en');
    expect(code({ bodyEn: 'x'.repeat(1201) })).toBe('body_en');
    expect(code({ bodyEn: 'a <script> b' })).toBe('body_en');
    expect(code({ bodyHi: 'English words' })).toBe('body_hi');
    expect(code({ scope: 'world' })).toBe('scope');
    expect(code({ scope: 'state', stateCode: '' })).toBe('state_code');
    expect(code({ scope: 'state', stateCode: 'IN-ZZ' })).toBe('state_code');
    expect(code({ scope: 'state', stateCode: 'IN-UP' })).toBe('ok');
    expect(code({ scope: 'national', stateCode: 'IN-UP' })).toBe('state_code');
    expect(code({ classFrom: 9, classTo: 6 })).toBe('class_band');
    expect(code({ classFrom: -3 })).toBe('class_band');
    expect(code({ classTo: 13 })).toBe('class_band');
    expect(code({ classFrom: 1.5 })).toBe('class_band');
    expect(code({ sourceUrl: '' })).toBe('source_url');
    expect(code({ sourceUrl: 'http://example.invalid/a' })).toBe('source_url');
    expect(code({ sourceUrl: 'javascript:alert(1)' })).toBe('source_url');
    expect(code({ sourceUrl: 'https://user:pw@example.invalid/a' })).toBe('source_url');
    expect(code({ verifiedOn: '' })).toBe('verified_on');
    expect(code({ verifiedOn: day(1) })).toBe('verified_on');
    expect(code({ verifiedOn: '2026-02-30' })).toBe('verified_on');
    expect(code({ reviewOn: '' })).toBe('review_on');
    expect(code({ reviewOn: day(-3) })).toBe('review_on');
    expect(code({ reviewOn: day(800) })).toBe('review_on');
    expect(sourceUrlOk('https://example.invalid/a?b=1')).toBe(true);
    expect(sourceUrlOk('https://localhost/a')).toBe(false);
  });
});

describe('the Control routes', () => {
  const claims = (role: string, sub: string, schoolId: string | null) => ({ sub, role, schoolId, membershipId: null, tokenVersion: 0, aal: 'aal2', sessionId: u(70) });
  const school = claims('principal', PRINCIPAL, SCHOOL);
  const staff = claims('super_admin', STAFF, null);
  const req = (method: string, body?: unknown) => new NextRequest('http://localhost/api/control/content/hubs', { method, ...(body ? { body: JSON.stringify(body) } : {}) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = async (who: any, fn: () => Promise<Response>) => {
    state.claims = who;
    const res = await fn();
    return { status: res.status, body: await res.json() };
  };
  const post = (who: unknown, body: unknown) => call(who, () => postHubs(req('POST', body)));
  const audits = async (id: string) => (await db.pg.query(`select event_action, actor_user_id, before_state, after_state from audit_log where target_id = $1 order by audit_id`, [id])).rows;
  let id = '';

  it('refuses a school role and accepts staff', async () => {
    expect((await call(school, () => getHubs(req('GET')))).status).toBe(403);
    expect((await post(school, { action: 'add', ...entry() })).status).toBe(403);
    expect((await call(null, () => getHubs(req('GET')))).status).toBe(401);
    const list = await call(staff, () => getHubs(req('GET')));
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.entries)).toBe(true);
  });

  it('validation errors return 400 with a code, and nothing is written', async () => {
    const before = (await db.pg.query(`select count(*)::int as n from content.hub_entries`)).rows[0].n;
    for (const [over, c] of [
      [{ sourceUrl: 'http://example.invalid/a' }, 'source_url'],
      [{ sourceUrl: '' }, 'source_url'],
      [{ verifiedOn: '' }, 'verified_on'],
      [{ reviewOn: day(-5) }, 'review_on'],
      [{ scope: 'state', stateCode: '' }, 'state_code'],
      [{ classFrom: 10, classTo: 2 }, 'class_band'],
      [{ titleHi: 'English only' }, 'title_hi'],
      [{ bodyEn: '' }, 'body_en'],
    ] as const) expect(await post(staff, { action: 'add', ...entry(over) })).toMatchObject({ status: 400, body: { code: c } });
    expect(await post(staff, { action: 'nope' })).toMatchObject({ status: 400 });
    expect(await post(staff, { action: 'publish', entryId: 'not-an-id' })).toMatchObject({ status: 404, body: { code: 'not_found' } });
    expect((await db.pg.query(`select count(*)::int as n from content.hub_entries`)).rows[0].n).toBe(before);
  });

  it('add (a draft, not seen by families) → edit → publish (seen) → withdraw (gone), each audited with before and after', async () => {
    expect(await post(staff, { action: 'add', ...entry({ titleEn: 'Route entry', titleHi: 'मार्ग प्रविष्टि' }) })).toEqual({ status: 201, body: { ok: true } });
    id = (await db.pg.query(`select entry_id from content.hub_entries where title_en = 'Route entry'`)).rows[0].entry_id;
    expect(await seen('careers', 8, null)).not.toContain('Route entry');
    const listed = (await call(staff, () => getHubs(req('GET')))).body.entries.find((e: { entryId: string }) => e.entryId === id);
    expect(listed).toMatchObject({ status: 'draft', expired: false, reviewOn: day(90), titleHi: 'मार्ग प्रविष्टि' });

    expect(await post(staff, { action: 'edit', entryId: id, ...entry({ titleEn: 'Route entry', titleHi: 'मार्ग प्रविष्टि', bodyEn: 'Corrected line.' }) })).toEqual({ status: 200, body: { ok: true } });
    // The same fields again change nothing and write no audit row.
    expect(await post(staff, { action: 'edit', entryId: id, ...entry({ titleEn: 'Route entry', titleHi: 'मार्ग प्रविष्टि', bodyEn: 'Corrected line.' }) })).toEqual({ status: 200, body: { ok: true } });
    expect(await post(staff, { action: 'edit', entryId: id, ...entry({ sourceUrl: 'http://example.invalid/a' }) })).toMatchObject({ status: 400, body: { code: 'source_url' } });

    expect(await post(staff, { action: 'publish', entryId: id })).toEqual({ status: 200, body: { ok: true } });
    expect(await seen('careers', 8, null)).toContain('Route entry');
    expect(await post(staff, { action: 'withdraw', entryId: id })).toEqual({ status: 200, body: { ok: true } });
    expect(await seen('careers', 8, null)).not.toContain('Route entry');

    const rows = await audits(id);
    expect(rows.map((r: { event_action: string }) => r.event_action)).toEqual(['content.hub_entry_added', 'content.hub_entry_edited', 'content.hub_entry_published', 'content.hub_entry_withdrawn']);
    expect(rows.every((r: { actor_user_id: string }) => r.actor_user_id === STAFF)).toBe(true);
    expect(rows[0]).toMatchObject({ before_state: null, after_state: { title_en: 'Route entry', status: 'draft', source_url: URL_OK } });
    expect(rows[1].before_state.body_en).toBe('An illustrative line.');
    expect(rows[1].after_state.body_en).toBe('Corrected line.');
    expect(rows[2]).toMatchObject({ before_state: { status: 'draft' }, after_state: { status: 'published' } });
    expect(rows[3]).toMatchObject({ before_state: { status: 'published' }, after_state: { status: 'withdrawn' } });
  });

  it('a withdrawn entry can be published again, until its review day passes; an expired one is shown as expired and cannot be published', async () => {
    expect(await post(staff, { action: 'publish', entryId: id })).toEqual({ status: 200, body: { ok: true } });
    expect(await seen('careers', 8, null)).toContain('Route entry');
    await db.pg.query(`update content.hub_entries set verified_on = $2, review_on = $3, status = 'draft' where entry_id = $1`, [id, day(-40), day(-1)]);
    const row = (await staffTx((tx) => listHubEntriesForControl(tx))).find((e) => e.entryId === id);
    expect(row).toMatchObject({ status: 'draft', expired: true });
    expect(await post(staff, { action: 'publish', entryId: id })).toMatchObject({ status: 409, body: { code: 'expired' } });
    // A published entry cannot be edited into the past, and is not seen once its day has gone.
    await db.pg.query(`update content.hub_entries set status = 'published' where entry_id = $1`, [id]);
    expect(await seen('careers', 8, null)).not.toContain('Route entry');
    expect(await post(staff, { action: 'edit', entryId: id, ...entry({ titleEn: 'Route entry', titleHi: 'मार्ग प्रविष्टि', bodyEn: 'Corrected line.', verifiedOn: day(-40), reviewOn: day(-1) }) })).toMatchObject({ status: 400, body: { code: 'review_on' } });
    // Moving the review day on brings it back.
    expect(await post(staff, { action: 'edit', entryId: id, ...entry({ titleEn: 'Route entry', titleHi: 'मार्ग प्रविष्टि', bodyEn: 'Corrected line.', verifiedOn: day(-1), reviewOn: day(120) }) })).toEqual({ status: 200, body: { ok: true } });
    expect(await seen('careers', 8, null)).toContain('Route entry');
  });
});

describe('the words', () => {
  it('every hub message is in English and Hindi, the Hindi in Devanagari and not the English', () => {
    const keys = Object.keys(en).filter((k) => k.startsWith('hubs.') || k.startsWith('control.hubs.') || k === 'control.content.hubsLink' || k === 'fam.hub.source' || k === 'fam.hub.checked');
    expect(keys.length).toBeGreaterThan(50);
    for (const k of keys) {
      const h = (hi as Record<string, string>)[k];
      expect(h, k).toBeTruthy();
      expect(h, k).toMatch(/[ऀ-ॿ]/);
      expect(h, k).not.toBe((en as Record<string, string>)[k]);
    }
  });
});
