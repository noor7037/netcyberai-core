import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// W14-G: the parent area's Overview carries the school's numbers (attendance, fees due, published results, homework
// due) for a connected family, none for a standalone family, and never another family's child. The numbers come from
// the same read the School tab uses.

const A = 'd3000000-0000-4000-8000-00000000000a';
const PRINCIPAL = 'd3000000-0000-4000-8000-0000000000a1';
const P1 = 'd3000000-0000-4000-8000-0000000000e1';
const P2 = 'd3000000-0000-4000-8000-0000000000e2';
const S1 = 'd3000000-0000-4000-8000-0000000005a1';
const S2 = 'd3000000-0000-4000-8000-0000000005a2';
const C6A = 'd3000000-0000-4000-8000-0000000000c6';
const SCI = 'd3000000-0000-4000-8000-0000000000d1';
const HW = 'd3000000-0000-4000-8000-0000000000f1';
const HW2 = 'd3000000-0000-4000-8000-0000000000f2';
const CONNECTED = 'f8000000-0000-4000-8000-0000000000a1';
const NEIGHBOUR = 'f8000000-0000-4000-8000-0000000000b1';
const STANDALONE = 'f8000000-0000-4000-8000-0000000000c1';
const KID = 'f8000000-0000-4000-8000-0000000000d1';
const NEIGHBOUR_KID = 'f8000000-0000-4000-8000-0000000000d2';
const STANDALONE_KID = 'f8000000-0000-4000-8000-0000000000d3';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const cookies: Record<string, string> = {};
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asPrincipal = (fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (c: any) => {
    await c.query(`set local role app_user`);
    for (const [k, v] of Object.entries({ 'app.current_tenant_id': A, 'app.current_role': 'principal', 'app.current_user_id': PRINCIPAL })) await c.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(c);
  });
const post = async (route: string, body: unknown, cookie: string) => {
  const mod = await import(`@/app/api/family/school/${route}/route`);
  const res = await mod.POST(new NextRequest(`http://localhost/api/family/school/${route}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: res.status as number, body: await res.json() };
};
// What the parent page does: the account's active links, each read as the guardian, then the Overview's numbers.
async function overviewOf(accountId: string) {
  const { activeLinks, linkedSchool, schoolOverview } = await import('@/lib/family/school');
  const { withFamilyContext } = await import('@/lib/auth/db');
  const claims = { accountId, tokenVersion: 0 };
  const links = await withFamilyContext(claims, (c) => activeLinks(c, accountId));
  const schools = (await Promise.all(links.map(async (l) => ({ linkId: l.linkId, school: await linkedSchool(claims, l.linkId, l.children.map((c) => c.studentId)) })))).flatMap((x) => (x.school ? [{ linkId: x.linkId, school: x.school }] : []));
  return schoolOverview(schools, (await import('@/lib/time/india')).indiaDate());
}

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-parent-overview-tests-0123456789';
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'DAV Public School', 'IN-HR', false);
    insert into users (user_id, school_id, email, role, display_name, is_active) values ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true);
    insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C6A}', '${A}', '6-A', '6', 'A');
    insert into subjects (subject_id, school_id, name) values ('${SCI}', '${A}', 'Science');
    insert into students (student_id, school_id, admission_no, name, class_id, status) values
      ('${S1}', '${A}', 'A-1', 'Aarav Kumar', '${C6A}', 'active'), ('${S2}', '${A}', 'A-2', 'Bela Singh', '${C6A}', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values
      ('${P1}', '${A}', 'Rajesh Kumar', '9800000001', 'Father'), ('${P2}', '${A}', 'Sunita Singh', '9800000002', 'Mother');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P1}', '${S1}'), ('${A}', '${P2}', '${S2}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values
      ('${A}', '${S1}', 'core_records', true, 'school_attested', 'v1'), ('${A}', '${S2}', 'core_records', true, 'school_attested', 'v1');
    insert into attendance (school_id, student_id, class_id, date, status, marked_by) values
      ('${A}', '${S1}', '${C6A}', (now() at time zone 'Asia/Kolkata')::date, 'present', '${PRINCIPAL}'),
      ('${A}', '${S1}', '${C6A}', (now() at time zone 'Asia/Kolkata')::date - 1, 'absent', '${PRINCIPAL}'),
      ('${A}', '${S2}', '${C6A}', (now() at time zone 'Asia/Kolkata')::date, 'present', '${PRINCIPAL}');
    insert into fees_ledger (school_id, student_id, amount_minor, due_date, status) values ('${A}', '${S1}', 250000, current_date + 5, 'pending');
    insert into homework (homework_id, school_id, subject_id, title, due_date, created_by) values
      ('${HW}', '${A}', '${SCI}', 'Magnets', current_date + 2, '${PRINCIPAL}'), ('${HW2}', '${A}', '${SCI}', 'Old sheet', current_date - 3, '${PRINCIPAL}');
    insert into homework_targets (school_id, homework_id, class_id, title, due_date) values
      ('${A}', '${HW}', '${C6A}', 'Magnets', current_date + 2), ('${A}', '${HW2}', '${C6A}', 'Old sheet', current_date - 3);
    insert into family.accounts (account_id, email) values ('${CONNECTED}', 'one@example.org'), ('${NEIGHBOUR}', 'two@example.org'), ('${STANDALONE}', 'three@example.org');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${KID}', '${CONNECTED}', 'Aarav', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${NEIGHBOUR_KID}', '${NEIGHBOUR}', 'Bela', 6, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${STANDALONE_KID}', '${STANDALONE}', 'Zoya', 6, 'CBSE', 'en', 'en', 'IN-DL');
  `);
  const { signFamilySession, signParentMode } = await import('@/lib/family/session');
  for (const id of [CONNECTED, NEIGHBOUR]) {
    const s = { accountId: id, tokenVersion: 0, sessionId: `s-${id}` };
    cookies[id] = `ncf_session=${await signFamilySession(s)}; ncf_parent=${await signParentMode(s)}`;
  }
  const { issueConnectCode } = await import('@/lib/school-link');
  for (const [account, parent, student, kid] of [
    [CONNECTED, P1, S1, KID],
    [NEIGHBOUR, P2, S2, NEIGHBOUR_KID],
  ] as const) {
    const { code } = await asPrincipal((c) => issueConnectCode(c, { userId: PRINCIPAL, role: 'principal', schoolId: A }, parent));
    const linked = await post('connect', { code }, cookies[account]);
    expect(linked.status).toBe(200);
    expect((await post('children', { linkId: linked.body.linkId, pairs: [{ studentId: student, childId: kid }] }, cookies[account])).status).toBe(200);
  }
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('the parent area overview and the school', () => {
  it('a connected family’s overview carries the school’s numbers, with the school named', async () => {
    const [school, ...rest] = await overviewOf(CONNECTED);
    expect(rest).toEqual([]);
    expect(school.schoolName).toBe('DAV Public School');
    expect(school.children).toEqual([{ studentId: S1, name: 'Aarav Kumar', attendance: { present: 1, marked: 2 }, dueMinor: 250000, results: 0, homeworkDue: 1 }]);
  });

  it('a standalone family’s overview carries no school numbers', async () => {
    expect(await overviewOf(STANDALONE)).toEqual([]);
  });

  it('another family’s child never appears in the overview', async () => {
    const mine = JSON.stringify(await overviewOf(CONNECTED));
    expect(mine).not.toContain('Bela');
    expect(mine).not.toContain(S2);
    const theirs = await overviewOf(NEIGHBOUR);
    expect(theirs[0].children.map((c) => c.name)).toEqual(['Bela Singh']);
    expect(theirs[0].children[0].dueMinor).toBe(0);
    expect(JSON.stringify(theirs)).not.toContain('Aarav');
  });
});
