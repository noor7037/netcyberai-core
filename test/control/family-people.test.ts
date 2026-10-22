import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { POST as previewAddPost } from '@/app/api/control/apps/preview/add/route';
import { POST as previewRemovePost } from '@/app/api/control/apps/preview/remove/route';
import { POST as undoPost } from '@/app/api/control/apps/undo/route';
import { loadFamilyPeople, parsePeopleQuery, readFamilyPeople, PEOPLE_VIEWED_ACTION, type FamilyPeople } from '@/lib/control/family-people';
import { FamilyPeopleView } from '@/components/control/family/FamilyPeopleView';
import { ASKED_PURPOSES, FAMILY_NOTICE_VERSION, recordParentTap } from '@/lib/family/consent';

// C230-V: Control → Family → People, on the real migrations (PGlite). The people come only through
// family.control_accounts(), which the platform role may call and nobody else; each read is audited; "offers" is the
// parent's own latest answer. Made-up people only.

const h = vi.hoisted(() => ({ db: null as unknown as { pg: any; stop?: () => Promise<void> } }));
vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  return {
    ...real,
    withTenantContext: (claims: { role: string }, fn: (db: unknown) => Promise<unknown>) =>
      h.db.pg.transaction(async (tx: { query: (sql: string, p?: unknown[]) => Promise<unknown> }) => {
        await tx.query(`set local role ${claims.role === 'super_admin' ? 'nca_super' : 'app_user'}`);
        return fn(tx);
      }),
  };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const FOUNDER = randomUUID();
const PRINCIPAL = randomUUID();
const SCHOOL = randomUUID();
const ASHA = 'f7000000-0000-4000-8000-0000000000a1';
const RAVI = 'f7000000-0000-4000-8000-0000000000b1';
const MEERA = 'f7000000-0000-4000-8000-0000000000c1';

const q = async (sql: string, params: unknown[] = []) => (await h.db.pg.query(sql, params)).rows as any[];
const as = async <T>(role: string, fn: (tx: { query: (s: string, p?: unknown[]) => Promise<{ rows: any[] }> }) => Promise<T>): Promise<T> =>
  h.db.pg.transaction(async (tx: any) => {
    await tx.query(`set local role ${role}`);
    return fn(tx);
  });
const people = (query: string | null, offersOnly = false, limit = 50, offset = 0) =>
  as('nca_super', async (tx) => (await tx.query(`select family.control_accounts($1, $2, $3, $4) as p`, [query, offersOnly, limit, offset])).rows[0].p);
const emails = (p: { rows: { email: string }[] }) => p.rows.map((r) => r.email).sort();

async function cookieFor(sub: string, role: string, aal: 'aal1' | 'aal2', schoolId: string | null = null) {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal, sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
const req = (path: string, body: unknown, cookie?: string) =>
  new NextRequest(`https://www.netcyberai.test${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } });

let founder = '';
let founderAal1 = '';
let principal = '';

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-people-tests-0123456789ab';
  h.db = await startHarnessDb({ port: 0 });
  await h.db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${SCHOOL}', 'Made-up School', 'IN-HR');
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${FOUNDER}', null, 'founder@example.invalid', 'super_admin', 'Farid Founder', true),
      ('${PRINCIPAL}', '${SCHOOL}', 'p@example.invalid', 'principal', 'Priya Principal', true);
    insert into family.accounts (account_id, email, created_at, last_sign_in_at) values
      ('${ASHA}', 'asha.parent@example.org', now() - interval '10 days', now() - interval '1 day'),
      ('${RAVI}', 'ravi_100%@example.org', now() - interval '5 days', null),
      ('${MEERA}', 'meera@example.org', now() - interval '2 days', now() - interval '3 hours');
    insert into family.children (account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${ASHA}', 'Alsifa', 6, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${ASHA}', 'Kabir', -1, 'CBSE', 'hi', 'hi', 'IN-HR'),
      ('${MEERA}', 'Zoya', 9, 'CBSE', 'hi', 'hi', 'IN-UP');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version, created_at) values
      ('${ASHA}', 'study_core', true, 'parent_tap', 'v1', now() - interval '9 days'),
      ('${ASHA}', 'offers', true, 'parent_tap', 'v1', now() - interval '8 days'),
      ('${RAVI}', 'offers', true, 'parent_tap', 'v1', now() - interval '4 days'),
      ('${RAVI}', 'offers', false, 'parent_tap', 'v1', now() - interval '1 day');
  `);
  founder = await cookieFor(FOUNDER, 'super_admin', 'aal2');
  founderAal1 = await cookieFor(FOUNDER, 'super_admin', 'aal1');
  principal = await cookieFor(PRINCIPAL, 'principal', 'aal2', SCHOOL);
}, 120_000);
afterAll(async () => {
  await h.db?.stop?.();
});

describe('the door: family.control_accounts()', () => {
  it('the platform role may call it; school staff and a family may not', async () => {
    expect((await people(null)).total).toBe(3);
    for (const role of ['app_user', 'family_app']) {
      await expect(as(role, (tx) => tx.query(`select family.control_accounts(null, false, 10, 0)`))).rejects.toThrow(/permission denied/);
    }
  });

  it('returns what Control needs and nothing else: never a PIN, a token version or an answer', async () => {
    const asha = (await people('asha')).rows[0];
    expect(Object.keys(asha).sort()).toEqual(['account_id', 'answers_7d', 'children', 'consents', 'created_at', 'email', 'has_pin', 'last_answered_on', 'last_sign_in_at', 'preview', 'ui_language']);
    expect(asha.children).toEqual([
      { first_name: 'Alsifa', class_level: 6, board_id: 'CBSE', language: 'en', free_subject: null },
      { first_name: 'Kabir', class_level: -1, board_id: 'CBSE', language: 'hi', free_subject: null },
    ]);
    expect(asha.consents).toEqual({ study_core: true, offers: true });
  });

  it('newest sign-in first; a family never signed in is ordered by when it joined', async () => {
    expect((await people(null)).rows.map((r: { email: string }) => r.email)).toEqual(['meera@example.org', 'asha.parent@example.org', 'ravi_100%@example.org']);
  });

  it('searches the email or a child’s first name, any part, any case; % and _ are only letters', async () => {
    expect(emails(await people('PARENT@'))).toEqual(['asha.parent@example.org']);
    expect(emails(await people('alsi'))).toEqual(['asha.parent@example.org']);
    expect(emails(await people('zoya'))).toEqual(['meera@example.org']);
    expect(emails(await people('100%'))).toEqual(['ravi_100%@example.org']);
    expect((await people('%')).rows).toHaveLength(1);
    expect((await people('_')).rows).toHaveLength(1);
    expect((await people('nobody-at-all')).total).toBe(0);
  });

  it('"offers only" keeps the parents whose latest answer is yes: a withdrawal counts', async () => {
    expect(emails(await people(null, true))).toEqual(['asha.parent@example.org']);
  });

  it('a page is between 1 and 100 rows, from the offset asked', async () => {
    expect((await people(null, false, 0)).rows).toHaveLength(1);
    expect((await people(null, false, 1, 1)).rows.map((r: { email: string }) => r.email)).toEqual(['asha.parent@example.org']);
    expect((await people(null, false, 5000)).rows).toHaveLength(3);
  });
});

describe('the reader and the audit', () => {
  it('keeps only the named fields, of the right type, and drops a row it cannot trust', () => {
    const got = readFamilyPeople({
      total: 2,
      rows: [
        { account_id: ASHA, email: 'a@example.org', created_at: '2026-10-01T00:00:00Z', children: [{ first_name: 'A', class_level: 6, board_id: 'CBSE' }, { first_name: '', class_level: 6 }], consents: { offers: true, bad: 'yes' }, pin_hash: 'x', answers_7d: '4' },
        { account_id: 'not-a-uuid', email: 'b@example.org', created_at: '2026-10-01T00:00:00Z' },
      ],
    });
    expect(got.total).toBe(2);
    expect(got.rows).toHaveLength(1);
    expect(got.rows[0]).not.toHaveProperty('pin_hash');
    expect(got.rows[0].children).toEqual([{ firstName: 'A', classLevel: 6, board: 'CBSE', language: '', freeSubject: null }]);
    expect(got.rows[0].consents).toEqual({ offers: true });
    expect(got.rows[0].answers7d).toBe(4);
  });

  it('the page’s query string is cleaned', () => {
    expect(parsePeopleQuery({ q: '  asha  ', offers: '1', page: '2' })).toEqual({ query: 'asha', offersOnly: true, page: 2 });
    expect(parsePeopleQuery({ q: 'x'.repeat(300), page: '-4' })).toEqual({ query: 'x'.repeat(100), offersOnly: false, page: 1 });
  });

  it('each read is audited with what was asked and which accounts were shown', async () => {
    const got: FamilyPeople = await h.db.pg.transaction(async (tx: any) => {
      await tx.query('set local role nca_super');
      return loadFamilyPeople(tx, { userId: FOUNDER, role: 'super_admin' }, { query: 'alsifa', offersOnly: false, page: 1 });
    });
    expect(got.rows.map((r) => r.email)).toEqual(['asha.parent@example.org']);
    const [row] = await q(`select actor_user_id, school_id, after_state from audit_log where event_action = $1 order by audit_id desc limit 1`, [PEOPLE_VIEWED_ACTION]);
    expect(row).toMatchObject({ actor_user_id: FOUNDER, school_id: null });
    expect(row.after_state).toEqual({ query: 'alsifa', offers_only: false, page: 1, total: 1, shown: [ASHA] });
  });
});

describe('staff preview from the people list', () => {
  it('only the founder with the authenticator adds an account, with a reason; audited; Undo takes it off', async () => {
    expect((await previewAddPost(req('/api/control/apps/preview/add', { accountId: ASHA, reason: 'x' }))).status).toBe(401);
    expect((await previewAddPost(req('/api/control/apps/preview/add', { accountId: ASHA, reason: 'x' }, principal))).status).toBe(403);
    expect((await previewAddPost(req('/api/control/apps/preview/add', { accountId: ASHA, reason: 'x' }, founderAal1))).status).toBe(403);
    expect((await previewAddPost(req('/api/control/apps/preview/add', { accountId: ASHA, reason: '' }, founder))).status).toBe(400);
    expect((await previewAddPost(req('/api/control/apps/preview/add', { accountId: ASHA, reason: 'My own test account' }, founder))).status).toBe(200);
    expect((await previewAddPost(req('/api/control/apps/preview/add', { accountId: ASHA, reason: 'again' }, founder))).status).toBe(409);
    expect((await people('asha')).rows[0].preview).toBe(true);
    const [row] = await q(`select audit_id::text as id, after_state from audit_log where event_action = 'preview_account.add' order by audit_id desc limit 1`);
    expect(row.after_state).toMatchObject({ account_id: ASHA, added_by: FOUNDER, change_reason: 'My own test account' });
    expect((await undoPost(req('/api/control/apps/undo', { auditId: row.id, reason: 'undo' }, founder))).status).toBe(200);
    expect(await q(`select 1 from control.preview_accounts where account_id = $1`, [ASHA])).toHaveLength(0);
  });

  it('undoing an old add leaves a later listing of the same account alone', async () => {
    expect((await previewAddPost(req('/api/control/apps/preview/add', { accountId: RAVI, reason: 'first' }, founder))).status).toBe(200);
    const [first] = await q(`select audit_id::text as id from audit_log where event_action = 'preview_account.add' order by audit_id desc limit 1`);
    expect((await previewRemovePost(req('/api/control/apps/preview/remove', { accountId: RAVI, reason: 'off' }, founder))).status).toBe(200);
    expect((await previewAddPost(req('/api/control/apps/preview/add', { accountId: RAVI, reason: 'again' }, founder))).status).toBe(200);
    expect((await undoPost(req('/api/control/apps/undo', { auditId: first.id, reason: 'undo the first' }, founder))).status).toBe(404);
    expect(await q(`select 1 from control.preview_accounts where account_id = $1`, [RAVI])).toHaveLength(1);
    await q(`delete from control.preview_accounts where account_id = $1`, [RAVI]);
  });
});

describe('the offers consent', () => {
  it('is asked of the parent and is a purpose the database accepts', async () => {
    expect(ASKED_PURPOSES).toContain('offers');
    await q(`insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ($1, 'offers', true, 'parent_tap', 'v1')`, [MEERA]);
    await expect(q(`insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ($1, 'marketing', true, 'parent_tap', 'v1')`, [MEERA])).rejects.toThrow(/consents_purpose_check/);
  });

  it('a tap is recorded against the notice that names offers', async () => {
    expect(FAMILY_NOTICE_VERSION).toBe('fam-notice-2');
    await recordParentTap(h.db.pg, MEERA, 'offers', false);
    const [row] = await q(`select granted, notice_version from family.consents where account_id = $1 and purpose = 'offers' order by created_at desc limit 1`, [MEERA]);
    expect(row).toEqual({ granted: false, notice_version: 'fam-notice-2' });
  });
});

describe('the page', () => {
  it('shows the email, the children, the consents as words and the preview switch', () => {
    const data: FamilyPeople = {
      total: 1,
      rows: [{ accountId: ASHA, email: 'asha.parent@example.org', language: 'en', joinedAt: '2026-10-12T05:00:00.000Z', lastSignInAt: null, hasPin: true, children: [{ firstName: 'Alsifa', classLevel: 6, board: 'CBSE', language: 'en', freeSubject: 'science' }], consents: { study_core: true, offers: true }, answers7d: 3, lastAnsweredOn: '2026-10-21', preview: false }],
    };
    const html = renderToStaticMarkup(createElement(FamilyPeopleView, { lang: 'en', people: data, q: { query: '', offersOnly: false, page: 1 } }));
    expect(html).toContain('asha.parent@example.org');
    expect(html).toContain('Alsifa · Class 6 · CBSE');
    expect(html).toContain('data-person-consent="offers" data-given="yes"');
    expect(html).toContain('data-person-consent="photo_input" data-given="no"');
    expect(html).toContain('Add to staff preview');
    expect(html).toContain('3 answers in the last 7 days');
  });

  it('a page past the end says so and links back to the first page', () => {
    const html = renderToStaticMarkup(createElement(FamilyPeopleView, { lang: 'en', people: { total: 120, rows: [] }, q: { query: '', offersOnly: false, page: 99 } }));
    expect(html).toContain('data-people-past-end');
    expect(html).not.toContain('No family has signed up yet');
    expect(html).toContain('href="/control/family/people"');
  });
});
