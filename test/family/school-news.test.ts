import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// What is new from a connected school, counted in the app (M3-8a, C338), on the real schema through the real pool.
//   1. New homework, sent notices and published results for the matched child's class, counted as the guardian from
//      what the school's own rules let them see: never a draft, another class's or another school's, never what came
//      before the link.
//   2. The parent looking at the school's part makes them seen; a kind the parent turned off is not counted.
//   3. The family's own rows only; only the parent (PIN) marks seen or turns kinds off.

const A = 'da000000-0000-4000-8000-00000000000a';
const B = 'da000000-0000-4000-8000-00000000000b';
const PRINCIPAL = 'da000000-0000-4000-8000-0000000000a1';
const TEACHER = 'da000000-0000-4000-8000-0000000000a2';
const PRINCIPAL_B = 'da000000-0000-4000-8000-0000000000b1';
const P1 = 'da000000-0000-4000-8000-0000000000e1';
const S1 = 'da000000-0000-4000-8000-0000000005a1';
const C6A = 'da000000-0000-4000-8000-0000000000c6';
const C6B = 'da000000-0000-4000-8000-0000000000c7';
const CB = 'da000000-0000-4000-8000-0000000000cb';
const SCI = 'da000000-0000-4000-8000-0000000000d1';
const SCI_B = 'da000000-0000-4000-8000-0000000000db';
const ID = (n: number) => `da000000-0000-4000-8000-0000000007${n.toString().padStart(2, '0')}`;
const ACCOUNT = 'f8000000-0000-4000-8000-0000000000a1';
const OTHER = 'f8000000-0000-4000-8000-0000000000b1';
const CHILD = 'f8000000-0000-4000-8000-0000000000c1';
const COMPONENTS = JSON.stringify([{ key: 'marks', name: 'Marks', max: 50, share: null }]);
const SCHEME = JSON.stringify({
  bands: [{ from: 0, to: 100, grade: 'A', meaning: null }],
  decimals: 0,
  passMark: 33,
  components: [],
  terms: [{ name: 'Term 1' }],
  layout: { components: true, total: true, percent: true, grade: true, attendance: true, remarks: true, coScholastic: true },
  coScholastic: { areas: [], grades: [] },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let link = '';
const claims = { accountId: ACCOUNT, tokenVersion: 0 };
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asStaff = (role: string, user: string, school = A) => (fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (c: any) => {
    await c.query(`set local role app_user`);
    for (const [k, v] of Object.entries({ 'app.current_tenant_id': school, 'app.current_role': role, 'app.current_user_id': user })) await c.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(c);
  });
const fam = async <R>(fn: (c: never) => Promise<R>, account = ACCOUNT): Promise<R> => (await import('@/lib/auth/db')).withFamilyContext({ accountId: account, tokenVersion: 0 }, fn as never) as Promise<R>;
const news = async () => {
  const { activeLinks, notifyOff, readSeen, schoolNewsFor } = await import('@/lib/family/school');
  const { links, seen, off } = await fam(async (c: never) => ({ links: await activeLinks(c, ACCOUNT), seen: await readSeen(c, ACCOUNT), off: await notifyOff(c, ACCOUNT) }));
  return schoolNewsFor(claims, links, seen, off);
};
const cookie = async (account = ACCOUNT, parent = true) => {
  const { signFamilySession, signParentMode } = await import('@/lib/family/session');
  const s = { accountId: account, tokenVersion: 0, sessionId: 's1' };
  return `ncf_session=${await signFamilySession(s)}${parent ? `; ncf_parent=${await signParentMode(s)}` : ''}`;
};
const post = async (path: '/api/family/school/seen' | '/api/family/notify', body: unknown, opts: { account?: string; parent?: boolean } = {}) => {
  const mod = path === '/api/family/notify' ? await import('@/app/api/family/notify/route') : await import('@/app/api/family/school/seen/route');
  const res = await mod.POST(new NextRequest(`http://localhost${path}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: await cookie(opts.account, opts.parent ?? true) }, body: JSON.stringify(body) }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-school-news-tests-0123456789';
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${B}', 'School B', 'IN-DL', false);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true), ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Tara Teacher', true),
      ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', 'principal', 'Pavan Principal', true);
    insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true), ('${TEACHER}', '${A}', 'teacher', true), ('${PRINCIPAL_B}', '${B}', 'principal', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C6A}', '${A}', '6-A', '6', 'A'), ('${C6B}', '${A}', '6-B', '6', 'B'), ('${CB}', '${B}', '6-A', '6', 'A');
    insert into subjects (subject_id, school_id, name) values ('${SCI}', '${A}', 'Science'), ('${SCI_B}', '${B}', 'Science');
    insert into students (student_id, school_id, admission_no, name, class_id, status) values ('${S1}', '${A}', 'A-1', 'Aarav Kumar', '${C6A}', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values ('${P1}', '${A}', 'Rajesh Kumar', '9800000001', 'Father');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P1}', '${S1}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values ('${A}', '${S1}', 'core_records', true, 'school_attested', 'v1');
    insert into grading_schemes (school_id, version, scheme, made_by) values ('${A}', 1, '${SCHEME}'::jsonb, '${PRINCIPAL}'), ('${B}', 1, '${SCHEME}'::jsonb, '${PRINCIPAL_B}');
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'news@example.org'), ('${OTHER}', 'other@example.org');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ('${CHILD}', '${ACCOUNT}', 'Aarav', 6, 'CBSE', 'en', 'en', 'IN-HR');
    -- Before the link: never counted.
    insert into homework (homework_id, school_id, subject_id, title, due_date, created_by) values ('${ID(1)}', '${A}', '${SCI}', 'Before the link', current_date + 2, '${TEACHER}');
    insert into homework_targets (school_id, homework_id, class_id, title, due_date, assigned_at) values ('${A}', '${ID(1)}', '${C6A}', 'Before the link', current_date + 2, now() - interval '2 days');
    insert into class_notices (school_id, class_id, body, status, written_by, written_at, decided_by, decided_at) values ('${A}', '${C6A}', 'Before the link.', 'sent', '${TEACHER}', now() - interval '2 days', '${PRINCIPAL}', now() - interval '2 days');
  `);
  const { issueConnectCode, redeemConnectCode } = await import('@/lib/school-link');
  const { withFamilyContext } = await import('@/lib/auth/db');
  const { setChildLinks } = await import('@/lib/family/school');
  const issued = await asStaff('principal', PRINCIPAL)((c) => issueConnectCode(c, { userId: PRINCIPAL, role: 'principal', schoolId: A }, P1));
  const made = await withFamilyContext(claims, (c) => redeemConnectCode(c, ACCOUNT, issued.code));
  link = made!.linkId;
  await withFamilyContext(claims, (c) => setChildLinks(c, ACCOUNT, link, [S1], [{ studentId: S1, childId: CHILD }]));
  // After the link: two homework pieces for 6-A, one for 6-B, one in another school; notices sent to 6-A and to the whole
  // school, one waiting, one for 6-B; a result published for 6-A, one for 6-B.
  await db.pg.exec(`
    insert into homework (homework_id, school_id, subject_id, title, due_date, created_by) values
      ('${ID(2)}', '${A}', '${SCI}', 'Magnets', current_date + 2, '${TEACHER}'), ('${ID(3)}', '${A}', '${SCI}', 'Poles', current_date + 3, '${TEACHER}'),
      ('${ID(4)}', '${A}', '${SCI}', 'Only 6-B', current_date + 2, '${PRINCIPAL}'), ('${ID(5)}', '${B}', '${SCI_B}', 'Other school', current_date + 2, '${PRINCIPAL_B}');
    insert into homework_targets (school_id, homework_id, class_id, title, due_date) values
      ('${A}', '${ID(2)}', '${C6A}', 'Magnets', current_date + 2), ('${A}', '${ID(3)}', '${C6A}', 'Poles', current_date + 3),
      ('${A}', '${ID(4)}', '${C6B}', 'Only 6-B', current_date + 2), ('${B}', '${ID(5)}', '${CB}', 'Other school', current_date + 2);
    insert into class_notices (school_id, class_id, body, status, written_by, written_at, decided_by, decided_at) values
      ('${A}', '${C6A}', 'Bring a magnet.', 'sent', '${TEACHER}', now(), '${PRINCIPAL}', now()),
      ('${A}', null, 'Closed on Friday.', 'sent', '${PRINCIPAL}', now(), '${PRINCIPAL}', now()),
      ('${A}', '${C6B}', 'Only 6-B.', 'sent', '${PRINCIPAL}', now(), '${PRINCIPAL}', now()),
      ('${B}', null, 'Other school.', 'sent', '${PRINCIPAL_B}', now(), '${PRINCIPAL_B}', now());
    insert into class_notices (school_id, class_id, body, status, written_by, written_at) values ('${A}', '${C6A}', 'Still waiting.', 'waiting', '${TEACHER}', now());
    insert into exams (exam_id, school_id, name, term, created_by) values ('${ID(6)}', '${A}', 'Unit test 1', 'Term 1', '${PRINCIPAL}');
    insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, unit_ids, components, created_by) values
      ('${ID(7)}', '${A}', '${ID(6)}', '${C6A}', '${SCI}', '{}', '${COMPONENTS}', '${PRINCIPAL}'),
      ('${ID(8)}', '${A}', '${ID(6)}', '${C6B}', '${SCI}', '{}', '${COMPONENTS}', '${PRINCIPAL}');
    update exam_papers set entered_at = now(), entered_by = '${TEACHER}' where paper_id in ('${ID(7)}', '${ID(8)}');
    insert into exam_publications (school_id, exam_id, class_id, version, scheme_version, scheme, published_by) values
      ('${A}', '${ID(6)}', '${C6A}', 1, 1, '{}', '${PRINCIPAL}'), ('${A}', '${ID(6)}', '${C6B}', 1, 1, '{}', '${PRINCIPAL}');
  `);
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('what is new from the school (C338)', () => {
  it('counts the matched child’s new homework, sent notices and published results since the link, and nothing else', async () => {
    expect(await news()).toEqual({ homework: 2, notices: 2, results: 1, total: 5 });
  });

  it('a kind the parent turns off is not counted; turning it on again counts it', async () => {
    expect(await post('/api/family/notify', { kind: 'notices', on: false })).toEqual({ status: 200, body: { ok: true } });
    expect(await news()).toEqual({ homework: 2, notices: 0, results: 1, total: 3 });
    expect(await post('/api/family/notify', { kind: 'notices', on: true })).toEqual({ status: 200, body: { ok: true } });
    expect((await news()).notices).toBe(2);
    expect(await post('/api/family/notify', { kind: 'marks', on: false })).toEqual({ status: 400, body: { error: 'bad_request' } });
  });

  it('the parent looking at the school’s part makes it seen; what comes after is new again', async () => {
    expect(await post('/api/family/school/seen', { linkId: link })).toEqual({ status: 200, body: { ok: true } });
    expect(await news()).toEqual({ homework: 0, notices: 0, results: 0, total: 0 });
    await q(`insert into class_notices (school_id, class_id, body, status, written_by, written_at, decided_by, decided_at) values ($1, $2, 'A new one.', 'sent', $3, now() + interval '1 second', $4, now() + interval '1 second')`, [A, C6A, TEACHER, PRINCIPAL]);
    expect(await news()).toEqual({ homework: 0, notices: 1, results: 0, total: 1 });
  });

  it('the database refuses a seen mark naming another account’s link', async () => {
    const { withFamilyContext } = await import('@/lib/auth/db');
    const other = 'f8000000-0000-4000-8000-0000000000e9';
    await q(`insert into family.school_links (link_id, account_id, school_id, parent_id) values ($1, $2, $3, $4)`, [other, OTHER, A, P1]);
    const said = await withFamilyContext(claims, (c) => c.query(`insert into family.school_seen (account_id, link_id, kind, seen_at) values ('${ACCOUNT}', '${other}', 'homework', now())`)).then(
      () => 'ran',
      (e: Error) => String(e.message)
    );
    expect(said).toMatch(/foreign key/);
    await q(`delete from family.school_links where link_id = $1`, [other]);
  });

  it('only the parent marks seen or turns kinds off, and only for the account’s own link', async () => {
    expect((await post('/api/family/school/seen', { linkId: link }, { parent: false })).status).toBe(403);
    expect((await post('/api/family/notify', { kind: 'homework', on: false }, { parent: false })).status).toBe(403);
    expect(await post('/api/family/school/seen', { linkId: link }, { account: OTHER })).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(await fam(async (c: { query: (s: string) => Promise<{ rows: unknown[] }> }) => (await c.query(`select * from family.school_seen`)).rows, OTHER)).toEqual([]);
    expect(await fam(async (c: { query: (s: string) => Promise<{ rows: unknown[] }> }) => (await c.query(`select * from family.notify_off`)).rows, OTHER)).toEqual([]);
  });

  it('an unmatched child, or an unlinked family, has nothing new', async () => {
    const { schoolNewsFor } = await import('@/lib/family/school');
    const { activeLinks } = await import('@/lib/family/school');
    const links = (await fam((c: never) => activeLinks(c, ACCOUNT))).map((l) => ({ ...l, children: [] }));
    expect(await schoolNewsFor(claims, links, [], [])).toEqual({ homework: 0, notices: 0, results: 0, total: 0 });
    expect(await schoolNewsFor({ accountId: OTHER, tokenVersion: 0 }, await fam((c: never) => activeLinks(c, ACCOUNT)), [], [])).toEqual({ homework: 0, notices: 0, results: 0, total: 0 });
  });
});
