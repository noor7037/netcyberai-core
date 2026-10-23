import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// School Link (C230-AA): the founder's four paths, on the real schema through the real pool.
//   1. A standalone family works with no school, and nothing of any school is visible to it.
//   2. Standalone → a verified connection (a code the school's office made for one guardian) → that guardian's own
//      children and their class syllabus, and nothing else of the school.
//   3. The school's other families and another school stay out of reach.
//   4. Unlinked by the family or disconnected by the school → the school's part stops at once; the family's own
//      children and learning stay.

const A = 'd2000000-0000-4000-8000-00000000000a';
const B = 'd2000000-0000-4000-8000-00000000000b';
const PRINCIPAL = 'd2000000-0000-4000-8000-0000000000a1';
const TEACHER = 'd2000000-0000-4000-8000-0000000000a2';
const P1 = 'd2000000-0000-4000-8000-0000000000e1'; // guardian of S1 in A (no login of their own)
const P2 = 'd2000000-0000-4000-8000-0000000000e2'; // guardian of S2 in A
const PB = 'd2000000-0000-4000-8000-0000000000e9'; // guardian in B
const S1 = 'd2000000-0000-4000-8000-0000000005a1';
const S2 = 'd2000000-0000-4000-8000-0000000005a2';
const SB = 'd2000000-0000-4000-8000-0000000005b1';
const C6A = 'd2000000-0000-4000-8000-0000000000c6';
const C6B = 'd2000000-0000-4000-8000-0000000000c7';
const SCI = 'd2000000-0000-4000-8000-0000000000d1';
const ACCOUNT = 'f9000000-0000-4000-8000-0000000000a1';
const OTHER_ACCOUNT = 'f9000000-0000-4000-8000-0000000000b1';
const CHILD = 'f9000000-0000-4000-8000-0000000000c1';
const OTHER_CHILD = 'f9000000-0000-4000-8000-0000000000c2';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let cookie = '';
let otherCookie = '';
const claims = { accountId: ACCOUNT, tokenVersion: 0 };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asStaff = (role: string, user: string, school = A) => (fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (c: any) => {
    await c.query(`set local role app_user`);
    for (const [k, v] of Object.entries({ 'app.current_tenant_id': school, 'app.current_role': role, 'app.current_user_id': user })) await c.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(c);
  });
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
const post = async (route: string, body: unknown, c = cookie) => {
  const mod = await import(`@/app/api/family/school/${route}/route`);
  const res = await mod.POST(new NextRequest(`http://localhost/api/family/school/${route}`, { method: 'POST', headers: { cookie: c, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: res.status as number, body: await res.json() };
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-school-link-tests-0123456789ab';
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${B}', 'School B', 'IN-DL', false);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true),
      ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Tara Teacher', true);
    insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true), ('${TEACHER}', '${A}', 'teacher', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C6A}', '${A}', '6-A', '6', 'A'), ('${C6B}', '${A}', '6-B', '6', 'B');
    insert into subjects (subject_id, school_id, name) values ('${SCI}', '${A}', 'Science');
    insert into students (student_id, school_id, admission_no, name, class_id, status) values
      ('${S1}', '${A}', 'A-1', 'Aarav Kumar', '${C6A}', 'active'), ('${S2}', '${A}', 'A-2', 'Bela Singh', '${C6B}', 'active'),
      ('${SB}', '${B}', 'B-1', 'Other School Child', null, 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values
      ('${P1}', '${A}', 'Rajesh Kumar', '9800000001', 'Father'), ('${P2}', '${A}', 'Sunita Singh', '9800000002', 'Mother'),
      ('${PB}', '${B}', 'Other Parent', '9800000009', 'Father');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P1}', '${S1}'), ('${A}', '${P2}', '${S2}'), ('${B}', '${PB}', '${SB}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values
      ('${A}', '${S1}', 'core_records', true, 'school_attested', 'v1'), ('${A}', '${S2}', 'core_records', true, 'school_attested', 'v1');
    insert into attendance (school_id, student_id, class_id, date, status, marked_by) values
      ('${A}', '${S1}', '${C6A}', current_date, 'present', '${PRINCIPAL}');
    insert into syllabus_units (school_id, class_id, subject_id, position, chapter, topic) values
      ('${A}', '${C6A}', '${SCI}', 1, 'Exploring Magnets', 'Magnetic and non-magnetic materials'),
      ('${A}', '${C6A}', '${SCI}', 2, 'Exploring Magnets', 'Poles of a magnet'),
      ('${A}', '${C6B}', '${SCI}', 1, 'Only for 6-B', 'Not for Aarav');
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'parent@example.org'), ('${OTHER_ACCOUNT}', 'other@example.org');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${CHILD}', '${ACCOUNT}', 'Aarav', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${OTHER_CHILD}', '${OTHER_ACCOUNT}', 'Zoya', 6, 'CBSE', 'en', 'en', 'IN-DL');
  `);
  const { signFamilySession, signParentMode } = await import('@/lib/family/session');
  const s = { accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' };
  cookie = `ncf_session=${await signFamilySession(s)}; ncf_parent=${await signParentMode(s)}`;
  const o = { accountId: OTHER_ACCOUNT, tokenVersion: 0, sessionId: 's2' };
  otherCookie = `ncf_session=${await signFamilySession(o)}; ncf_parent=${await signParentMode(o)}`;
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

const issue = async (parentId = P1, role = 'principal', user = PRINCIPAL, school = A) => {
  const { issueConnectCode } = await import('@/lib/school-link');
  return asStaff(role, user, school)((c) => issueConnectCode(c, { userId: user, role, schoolId: school }, parentId));
};
const linkId = async (account = ACCOUNT) => (await q(`select link_id from family.school_links where account_id = $1 and revoked_at is null`, [account]))[0]?.link_id as string | undefined;

describe('1. standalone', () => {
  it('a family with no school has no link and the family role reads no school table', async () => {
    const { activeLinks } = await import('@/lib/family/school');
    const { withFamilyContext } = await import('@/lib/auth/db');
    expect(await withFamilyContext(claims, (c) => activeLinks(c, ACCOUNT))).toEqual([]);
    await expect(withFamilyContext(claims, (c) => c.query(`select * from students`))).rejects.toThrow();
    await expect(withFamilyContext(claims, (c) => c.query(`select * from family_connect_codes`))).rejects.toThrow();
  });
});

describe('2. a verified connection', () => {
  it('only the principal or a school admin makes a code; it is shown once and stored as a hash', async () => {
    // A teacher gets no code: the guardian is out of their sight, and the office-only rule refuses the insert anyway.
    expect(await issue(P1, 'teacher', TEACHER).catch(() => 'refused')).toMatch(/^(not_found|refused)$/);
    const r = await issue();
    expect(r.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    const rows = await q(`select code_hash, parent_id, used_at from family_connect_codes where parent_id = $1`, [P1]);
    expect(rows).toHaveLength(1);
    expect(rows[0].code_hash).not.toContain(r.code.replace('-', ''));
    const [audit] = await q(`select after_state from audit_log where event_action = 'family.connect_code_issued' order by audit_id desc limit 1`);
    expect(JSON.stringify(audit.after_state)).not.toContain(r.code.replace('-', ''));
  });

  it('needs parent mode; a wrong code says only that it did not work', async () => {
    const childOnly = cookie.replace(/; ncf_parent=[^;]+/, '');
    expect((await post('connect', { code: 'ABCD-EFGH' }, childOnly)).status).toBe(403);
    expect(await post('connect', { code: 'ABCD-EFGH' })).toEqual({ status: 400, body: { error: 'bad_code' } });
  });

  it('a right code links this account to that guardian once; the code cannot be used again, by anyone', async () => {
    const { code } = await issue();
    const r = await post('connect', { code: code.toLowerCase().replace('-', ' ') });
    expect(r).toEqual({ status: 200, body: { linkId: expect.any(String), schoolName: 'School A' } });
    expect(await post('connect', { code }, otherCookie)).toEqual({ status: 400, body: { error: 'bad_code' } });
    expect(await linkId(OTHER_ACCOUNT)).toBeUndefined();
  });

  it('shows the guardian’s own child, today’s attendance, and the class syllabus; nothing of other children', async () => {
    const { linkedSchool, schoolSyllabusFor } = await import('@/lib/family/school');
    const link = (await linkId()) as string;
    const school = await linkedSchool(claims, link);
    expect(school?.schoolName).toBe('School A');
    expect(school?.children.map((c) => [c.studentId, c.name, c.className, c.today])).toEqual([[S1, 'Aarav Kumar', '6-A', 'present']]);
    expect(await schoolSyllabusFor(claims, link, S1)).toEqual({ subjects: [{ name: 'Science', chapters: [{ title: 'Exploring Magnets', topics: ['Magnetic and non-magnetic materials', 'Poles of a magnet'] }] }] });
    // Another family's child of the same school: nothing.
    expect(await schoolSyllabusFor(claims, link, S2)).toEqual({ subjects: [] });
  });

  it('the parent says which family child is which school child; a student not shown or a child of another account is refused', async () => {
    const link = (await linkId()) as string;
    expect((await post('children', { linkId: link, pairs: [{ studentId: S2, childId: CHILD }] })).status).toBe(400);
    expect((await post('children', { linkId: link, pairs: [{ studentId: S1, childId: OTHER_CHILD }] })).status).toBe(400);
    expect(await post('children', { linkId: link, pairs: [{ studentId: S1, childId: CHILD }] })).toEqual({ status: 200, body: { ok: true } });
    expect(await q(`select child_id, student_id from family.child_links where account_id = $1`, [ACCOUNT])).toEqual([{ child_id: CHILD, student_id: S1 }]);
    // Another account cannot change this link.
    expect((await post('children', { linkId: link, pairs: [{ studentId: S1, childId: null }] }, otherCookie)).status).toBe(404);
  });
});

describe('3. no cross-tenant reach', () => {
  it('reading as the guardian sees only that school, and only that guardian’s rows', async () => {
    const { withGuardianContext } = await import('@/lib/auth/db');
    const link = (await linkId()) as string;
    const seen = await withGuardianContext(claims, link, async (c) => ({
      students: (await c.query(`select student_id from students`)).rows.map((r: { student_id: string }) => r.student_id),
      parents: (await c.query(`select parent_id from parents`)).rows.map((r: { parent_id: string }) => r.parent_id),
      units: (await c.query(`select chapter from syllabus_units`)).rows.length,
    }));
    expect(seen).toEqual({ students: [S1], parents: [P1], units: 2 });
    await expect(withGuardianContext(claims, link, (c) => c.query(`insert into syllabus_units (school_id, class_id, subject_id, position, chapter, topic) values ($1, $2, $3, 9, 'x', 'y')`, [A, C6A, SCI]))).rejects.toThrow();
  });

  it('another account cannot use this link, and a link id that is not a link is refused', async () => {
    const { withGuardianContext, SchoolLinkGoneError } = await import('@/lib/auth/db');
    const link = (await linkId()) as string;
    await expect(withGuardianContext({ accountId: OTHER_ACCOUNT, tokenVersion: 0 }, link, async () => 1)).rejects.toBeInstanceOf(SchoolLinkGoneError);
    await expect(withGuardianContext(claims, 'not-a-link', async () => 1)).rejects.toBeInstanceOf(SchoolLinkGoneError);
  });

  it('a code made in another school links to that school and that guardian only', async () => {
    const { linkedSchool } = await import('@/lib/family/school');
    expect(await issue(PB)).toBe('not_found'); // A's office cannot make a code for B's guardian
    const { code } = await issue(PB, 'principal', PRINCIPAL, B);
    const { body } = await post('connect', { code }, otherCookie);
    const seen = await linkedSchool({ accountId: OTHER_ACCOUNT, tokenVersion: 0 }, body.linkId);
    expect(seen?.schoolName).toBe('School B');
    expect(seen?.children.map((c) => c.studentId) ?? []).not.toContain(S1);
  });
});

describe('4. unlinking', () => {
  it('the school disconnects the guardian: the school part stops at once; the family child stays', async () => {
    const { linkedSchool } = await import('@/lib/family/school');
    const { disconnectGuardian } = await import('@/lib/school-link');
    const link = (await linkId()) as string;
    expect(await asStaff('teacher', TEACHER)((c) => disconnectGuardian(c, { userId: TEACHER, role: 'teacher', schoolId: A }, P1)).catch(() => 'refused')).toEqual(expect.anything());
    // A teacher's call closes nothing (the function checks the office roles).
    expect(await linkedSchool(claims, link)).not.toBeNull();
    expect(await asStaff('principal', PRINCIPAL)((c) => disconnectGuardian(c, { userId: PRINCIPAL, role: 'principal', schoolId: A }, P1))).toEqual({ closed: 1 });
    expect(await linkedSchool(claims, link)).toBeNull();
    expect(await q(`select first_name from family.children where child_id = $1`, [CHILD])).toEqual([{ first_name: 'Aarav' }]);
  });

  it('the family unlinks: the school part stops, the child links go, the child stays', async () => {
    const { linkedSchool } = await import('@/lib/family/school');
    const { code } = await issue();
    const { body } = await post('connect', { code });
    await post('children', { linkId: body.linkId, pairs: [{ studentId: S1, childId: CHILD }] });
    expect(await post('unlink', { linkId: body.linkId })).toEqual({ status: 200, body: { ok: true } });
    expect(await linkedSchool(claims, body.linkId)).toBeNull();
    expect(await q(`select 1 from family.child_links where account_id = $1`, [ACCOUNT])).toEqual([]);
    expect(await q(`select first_name from family.children where child_id = $1`, [CHILD])).toEqual([{ first_name: 'Aarav' }]);
    expect((await post('unlink', { linkId: body.linkId })).status).toBe(404);
  });

  it('the family role cannot make a link without a code, reopen a closed one, or point one at another guardian', async () => {
    const { withFamilyContext } = await import('@/lib/auth/db');
    const [closed] = await q(`select link_id from family.school_links where account_id = $1 and revoked_at is not null limit 1`, [ACCOUNT]);
    await expect(withFamilyContext(claims, (c) => c.query(`insert into family.school_links (account_id, school_id, parent_id) values ($1, $2, $3)`, [ACCOUNT, A, P2]))).rejects.toThrow();
    await expect(withFamilyContext(claims, (c) => c.query(`update family.school_links set revoked_at = null, revoked_by = null where link_id = $1`, [closed.link_id]))).rejects.toThrow();
    await expect(withFamilyContext(claims, (c) => c.query(`update family.school_links set parent_id = $1 where link_id = $2`, [P2, closed.link_id]))).rejects.toThrow();
    expect(await linkId()).toBeUndefined();
  });

  it('a guardian merged into another at the school ends the link’s reach', async () => {
    const { linkedSchool } = await import('@/lib/family/school');
    const { code } = await issue(P2);
    const { body } = await post('connect', { code });
    expect((await linkedSchool(claims, body.linkId))?.children.map((c) => c.studentId)).toEqual([S2]);
    await q(`update parents set merged_into = $1, merged_at = now() where parent_id = $2`, [P1, P2]);
    expect(await linkedSchool(claims, body.linkId)).toBeNull();
  });

  it('ten code tries a day, then a pause', async () => {
    await q(`delete from family.connect_attempts where account_id = $1`, [ACCOUNT]);
    for (let i = 1; i <= 10; i++) expect((await post('connect', { code: 'ZZZZ-ZZZZ' })).body.error, `try ${i}`).toBe('bad_code');
    expect(await post('connect', { code: 'ZZZZ-ZZZZ' })).toEqual({ status: 429, body: { error: 'too_many_tries' } });
  });

  it('the school withdrawing its consent for the child hides the child, the day and the syllabus', async () => {
    const { linkedSchool, schoolSyllabusFor, schoolTodayFor, activeLinks } = await import('@/lib/family/school');
    const { withFamilyContext } = await import('@/lib/auth/db');
    await q(`delete from family.connect_attempts where account_id = $1`, [ACCOUNT]);
    await q(`update parents set merged_into = null, merged_at = null where parent_id = $1`, [P2]);
    const { code } = await issue();
    const { body } = await post('connect', { code });
    await post('children', { linkId: body.linkId, pairs: [{ studentId: S1, childId: CHILD }] });
    const links = await withFamilyContext(claims, (c) => activeLinks(c, ACCOUNT));
    expect(await schoolTodayFor(claims, links, CHILD)).toEqual({ schoolName: 'School A', today: 'present' });
    await q(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values ($1, $2, 'core_records', false, 'school_attested', 'v1')`, [A, S1]);
    expect((await linkedSchool(claims, body.linkId))?.children).toEqual([]);
    expect(await schoolSyllabusFor(claims, body.linkId, S1)).toEqual({ subjects: [] });
    expect(await schoolTodayFor(claims, links, CHILD)).toBeNull();
    // The database rule holds on its own too: read as the guardian, the class syllabus is gone.
    const { withGuardianContext } = await import('@/lib/auth/db');
    expect(await withGuardianContext(claims, body.linkId, async (c) => (await c.query(`select 1 from syllabus_units`)).rows.length)).toBe(0);
  });
});
