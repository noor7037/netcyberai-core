import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { addDays, checkNote, planNights } from '@/lib/family/home-plan';

// The home plan after a parent-teacher meeting (M3-7, C337; R5, Plus), on the real schema through the real pool.
//   1. Fourteen nights from tonight, the chosen topics in turn; every night a catalog topic the child can open.
//   2. Behind Plus: off until Control opens Family Plus (family.plus_open), and behind the module's switch.
//   3. A night is done by a checked answer on its topic that day; a new plan stops the old; the family's own rows only.
//   4. "Ask the teacher to follow up": for a matched child, the school's own follow-up queue, with the school's consent
//      for messages; once per open item; never by the family role or a staff session.

const ACCOUNT = 'f7000000-0000-4000-8000-0000000000a1';
const OTHER = 'f7000000-0000-4000-8000-0000000000b1';
const CHILD = 'f7000000-0000-4000-8000-0000000000c1';
const UNMATCHED = 'f7000000-0000-4000-8000-0000000000c2';
const SCI = 'f7000000-0000-4000-8000-0000000000e1';
const MATH = 'f7000000-0000-4000-8000-0000000000e2';
const T = (n: number) => `cbse.c6.science.ch01.t0${n}`;
const M1 = 'cbse.c6.mathematics.ch01.t01';
const A = 'd9000000-0000-4000-8000-00000000000a';
const PRINCIPAL = 'd9000000-0000-4000-8000-0000000000a1';
const TEACHER = 'd9000000-0000-4000-8000-0000000000a2';
const T_ROW = 'd9000000-0000-4000-8000-0000000000f1';
const C6A = 'd9000000-0000-4000-8000-0000000000c6';
const SUB = 'd9000000-0000-4000-8000-0000000000d1';
const P1 = 'd9000000-0000-4000-8000-0000000000e1';
const S1 = 'd9000000-0000-4000-8000-0000000005a1';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let link = '';
const claims = { accountId: ACCOUNT, tokenVersion: 0 };
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asStaff = (role: string, user: string) => (fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (c: any) => {
    await c.query(`set local role app_user`);
    for (const [k, v] of Object.entries({ 'app.current_tenant_id': A, 'app.current_role': role, 'app.current_user_id': user })) await c.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(c);
  });
const cookie = async (account = ACCOUNT) => {
  const { signFamilySession, signParentMode } = await import('@/lib/family/session');
  const s = { accountId: account, tokenVersion: 0, sessionId: 's1' };
  return `ncf_session=${await signFamilySession(s)}; ncf_parent=${await signParentMode(s)}`;
};
const post = async (body: unknown, account = ACCOUNT) => {
  const { POST } = await import('@/app/api/family/home-plan/route');
  const res = await POST(new NextRequest('http://localhost/api/family/home-plan', { method: 'POST', headers: { 'content-type': 'application/json', cookie: await cookie(account) }, body: JSON.stringify(body) }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const fam = async <R>(fn: (c: { query: (s: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) => Promise<R>, account = ACCOUNT): Promise<R> =>
  (await import('@/lib/auth/db')).withFamilyContext({ accountId: account, tokenVersion: 0 }, fn as never) as Promise<R>;
const planOf = async (childId = CHILD) => {
  const { homePlan } = await import('@/lib/family/home-plan');
  const { listChildren } = await import('@/lib/family/children');
  return fam(async (c) => homePlan(c, ACCOUNT, (await listChildren(c, ACCOUNT)).find((x) => x.childId === childId)!, today, 'en'));
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-home-plan-tests-0123456789';
  const topic = (n: number, chapter: string, version: string, key: string, title: string) => `('${version}', '${chapter}', '${key}', ${n}, '${title}', 'https://ncert.nic.in/', '1', '2026-10-21')`;
  await db.pg.exec(`
    update control.settings set value = '[]'::jsonb where key in ('family.open_subjects', 'family.reviewed_only_subjects');
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'plan@example.org'), ('${OTHER}', 'other@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1'), ('${OTHER}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code, free_subject) values
      ('${CHILD}', '${ACCOUNT}', 'Aarav', 6, 'CBSE', 'en', 'en', 'IN-HR', 'science'), ('${UNMATCHED}', '${ACCOUNT}', 'Isha', 6, 'CBSE', 'en', 'en', 'IN-HR', 'science');
    insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at) values
      ('${SCI}', 'CBSE', 6, 'science', '2026-27', 1, 'published', 'everyone', 'repository', 'test', 'f7000000-0000-4000-8000-0000000000f1', now()),
      ('${MATH}', 'CBSE', 6, 'mathematics', '2026-27', 1, 'published', 'everyone', 'repository', 'test', 'f7000000-0000-4000-8000-0000000000f1', now());
    insert into content.chapters (chapter_id, version_id, chapter_key, position, title_en, source_url, source_page, checked_on) values
      ('f7000000-0000-4000-8000-0000000000d1', '${SCI}', 'cbse.c6.science.ch01', 1, 'Magnets', 'https://ncert.nic.in/', '1', '2026-10-21'),
      ('f7000000-0000-4000-8000-0000000000d2', '${MATH}', 'cbse.c6.mathematics.ch01', 1, 'Patterns', 'https://ncert.nic.in/', '1', '2026-10-21');
    insert into content.topics (version_id, chapter_id, topic_key, position, title_en, source_url, source_page, checked_on) values
      ${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => topic(n, 'f7000000-0000-4000-8000-0000000000d1', SCI, T(n), `Magnet topic ${n}`)).join(',\n      ')},
      ${topic(1, 'f7000000-0000-4000-8000-0000000000d2', MATH, M1, 'Number patterns')};
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false);
    insert into users (user_id, school_id, email, role, display_name, is_active) values ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true), ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Tara Teacher', true);
    insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true), ('${TEACHER}', '${A}', 'teacher', true);
    insert into teachers (teacher_id, school_id, user_id, name) values ('${T_ROW}', '${A}', '${TEACHER}', 'Tara Teacher');
    insert into classes (class_id, school_id, name, grade, section) values ('${C6A}', '${A}', '6-A', '6', 'A');
    insert into subjects (subject_id, school_id, name) values ('${SUB}', '${A}', 'Science');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ('${A}', '${T_ROW}', '${SUB}', '${C6A}');
    insert into students (student_id, school_id, admission_no, name, class_id, status) values ('${S1}', '${A}', 'A-1', 'Aarav Kumar', '${C6A}', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values ('${P1}', '${A}', 'Rajesh Kumar', '9800000001', 'Father');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P1}', '${S1}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version)
      select '${A}', '${S1}', p::consent_purpose, true, 'school_attested', 'v1' from unnest(array['core_records', 'operational_communication']) p;
  `);
  const { issueConnectCode, redeemConnectCode } = await import('@/lib/school-link');
  const { withFamilyContext } = await import('@/lib/auth/db');
  const { setChildLinks } = await import('@/lib/family/school');
  const issued = await asStaff('principal', PRINCIPAL)((c) => issueConnectCode(c, { userId: PRINCIPAL, role: 'principal', schoolId: A }, P1));
  const made = await withFamilyContext(claims, (c) => redeemConnectCode(c, ACCOUNT, issued.code));
  link = made!.linkId;
  await withFamilyContext(claims, (c) => setChildLinks(c, ACCOUNT, link, [S1], [{ studentId: S1, childId: CHILD }]));
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('the plan’s shape (C337)', () => {
  it('fourteen nights from the first day, the topics in turn', () => {
    const nights = planNights('2026-10-25', [
      { topicKey: T(1), subject: 'science' },
      { topicKey: T(2), subject: 'science' },
      { topicKey: T(3), subject: 'science' },
    ]);
    expect(nights).toHaveLength(14);
    expect(nights[0]).toEqual({ night: 1, date: '2026-10-25', topicKey: T(1), subject: 'science' });
    expect(nights.map((n) => n.topicKey).slice(0, 7)).toEqual([T(1), T(2), T(3), T(1), T(2), T(3), T(1)]);
    expect(nights[13].date).toBe('2026-11-07');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('the parent’s notes: none, or plain text up to 1000 characters with no 12-digit number', () => {
    expect(checkNote(undefined)).toBeNull();
    expect(checkNote('   ')).toBeNull();
    expect(checkNote(' Fractions need work.\r\nAlso magnets. ')).toBe('Fractions need work.\nAlso magnets.');
    for (const bad of ['1234 5678 9012', '१२३४५६७८९०१२', 'a'.repeat(1001), '<b>x</b>', 42]) expect(checkNote(bad), String(bad)).toBeUndefined();
  });
});

describe('behind Family Plus (C337)', () => {
  it('is off until Control opens Plus: the route refuses and nothing is made', async () => {
    expect(await q(`select value from control.settings where key = 'family.plus_open'`)).toEqual([{ value: false }]);
    expect(await post({ action: 'start', childId: CHILD, topics: [T(1)] })).toEqual({ status: 403, body: { error: 'off' } });
    expect(await q(`select count(*)::int as n from family.home_plans`)).toEqual([{ n: 0 }]);
  });
  it('Control opens it, audited', async () => {
    const { setPlusOpen } = await import('@/lib/control/family-settings');
    const r = await db.pg.transaction(async (c: never) => setPlusOpen(c, { userId: PRINCIPAL }, true));
    expect(r).toEqual({ ok: true, open: true });
    expect(await q(`select event_action, before_state, after_state from audit_log where event_action = 'family.plus_open_set'`)).toEqual([{ event_action: 'family.plus_open_set', before_state: { open: false }, after_state: { open: true } }]);
    expect(await db.pg.transaction(async (c: never) => setPlusOpen(c, { userId: PRINCIPAL }, 'yes'))).toEqual({ ok: false, code: 'bad_value' });
  });
});

describe('making and following the plan', () => {
  it('refuses topics outside the child’s catalog or access, more than seven, repeats, and notes with a 12-digit number', async () => {
    const bad = [
      { topics: [] },
      { topics: [T(1), T(2), T(3), T(4), T(5), T(6), T(7), T(8)] },
      { topics: [T(1), T(1)] },
      { topics: ['cbse.c6.science.ch09.t01'] },
      { topics: [M1] }, // Mathematics is not Aarav's free subject, and not open to every child
      { topics: ['not a key'] },
    ];
    for (const b of bad) expect(await post({ action: 'start', childId: CHILD, ...b }), JSON.stringify(b)).toEqual({ status: 400, body: { error: 'topics' } });
    expect(await post({ action: 'start', childId: CHILD, topics: [T(1)], note: 'Call 1234-5678-9012' })).toEqual({ status: 400, body: { error: 'note' } });
    expect(await post({ action: 'start', childId: 'f7000000-0000-4000-8000-0000000000ff', topics: [T(1)] })).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(await q(`select count(*)::int as n from family.home_plans`)).toEqual([{ n: 0 }]);
  });

  it('makes 14 nights from tonight on the chosen topics; tonight is night 1; a checked answer marks it done', async () => {
    const made = await post({ action: 'start', childId: CHILD, topics: [T(2), T(5)], note: 'Magnets need practice.' });
    expect(made.status).toBe(200);
    let plan = (await planOf())!;
    expect(plan.startsOn).toBe(today);
    expect(plan.note).toBe('Magnets need practice.');
    expect(plan.nights.map((n) => n.title).slice(0, 3)).toEqual(['Magnet topic 2', 'Magnet topic 5', 'Magnet topic 2']);
    expect(plan.tonight).toMatchObject({ night: 1, topicKey: T(2), done: false });
    await q(`insert into family.attempts (account_id, child_id, subject, topic_key, item_key, kind, answer, correct, answered_on) values ($1, $2, 'science', $3, 'q1', 'check', 'a', false, $4)`, [ACCOUNT, CHILD, T(2), today]);
    plan = (await planOf())!;
    expect(plan.nights[0].done).toBe(true);
    expect(plan.nights[2].done).toBe(false); // the same topic on night 3 is that day's
  });

  it('a new plan stops the open one; stopping leaves none open', async () => {
    expect((await post({ action: 'start', childId: CHILD, topics: [T(3)] })).status).toBe(200);
    expect(await q(`select count(*)::int as n, count(*) filter (where stopped_at is null)::int as open from family.home_plans where child_id = $1`, [CHILD])).toEqual([{ n: 2, open: 1 }]);
    expect((await planOf())!.nights[0].topicKey).toBe(T(3));
    expect(await post({ action: 'stop', childId: CHILD })).toEqual({ status: 200, body: { ok: true } });
    expect(await planOf()).toBeNull();
    expect(await post({ action: 'stop', childId: CHILD })).toEqual({ status: 404, body: { error: 'not_found' } });
  });

  it('is the family’s own: another account sees and changes none of it', async () => {
    expect((await post({ action: 'start', childId: CHILD, topics: [T(1)] })).status).toBe(200);
    expect(await fam(async (c) => (await c.query(`select count(*)::int as n from family.home_plans`)).rows, OTHER)).toEqual([{ n: 0 }]);
    expect(await post({ action: 'stop', childId: CHILD }, OTHER)).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(await fam(async (c) => (await c.query(`update family.home_plans set stopped_at = now() returning 1`)).rows, OTHER)).toEqual([]);
  });

  it('a plan is stopped, never changed: the family’s role may not rewrite its topics, day or notes', async () => {
    for (const sql of [`update family.home_plans set topics = '[]'::jsonb`, `update family.home_plans set starts_on = starts_on - 1`, `update family.home_plans set note = 'changed'`]) {
      expect(await fam((c) => c.query(sql)).then(() => 'ran', (e: Error) => String(e.message)), sql).toMatch(/permission denied/);
    }
  });
});

describe('“Ask the teacher to follow up” (C337)', () => {
  it('opens the follow-up in the school’s queue, for the child’s teacher; a second ask finds it open', async () => {
    expect(await post({ action: 'followup', childId: CHILD })).toEqual({ status: 200, body: { ok: true, already: false } });
    const { listFollowups } = await import('@/lib/pulse/followups');
    const open = (await asStaff('teacher', TEACHER)((c) => listFollowups(c, A))).open;
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ student_id: S1, class_id: C6A, kind: 'other', source: 'parent_reply', status: 'open' });
    expect((await planOf())!.followupAsked).toBe(true);
    expect(await post({ action: 'followup', childId: CHILD })).toEqual({ status: 200, body: { ok: true, already: true } });
    expect(await q(`select count(*)::int as n from pulse_followups`)).toEqual([{ n: 1 }]);
  });

  it('refused: a child not matched to a school, a child without a plan, and without the school’s consent for messages', async () => {
    expect((await post({ action: 'start', childId: UNMATCHED, topics: [T(1)] })).status).toBe(200);
    expect(await post({ action: 'followup', childId: UNMATCHED })).toEqual({ status: 404, body: { error: 'not_found' } });
    await post({ action: 'stop', childId: UNMATCHED });
    expect(await post({ action: 'followup', childId: UNMATCHED })).toEqual({ status: 404, body: { error: 'not_found' } });
    await asStaff('principal', PRINCIPAL)((c) => c.query(`update pulse_followups set status = 'done', outcome = 'Spoke to the parent.', decided_by = $1, decided_at = now()`, [PRINCIPAL]));
    await q(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values ($1, $2, 'operational_communication', false, 'school_attested', 'v1')`, [A, S1]);
    expect(await post({ action: 'followup', childId: CHILD })).toEqual({ status: 409, body: { error: 'no_consent' } });
    expect(await q(`select count(*)::int as n from pulse_followups where status = 'open'`)).toEqual([{ n: 0 }]);
  });

  it('only a guardian’s session may ask; the family role cannot call it', async () => {
    const said = async (fn: () => Promise<unknown>) => fn().then(() => 'ran', (e: Error) => String(e.message));
    expect(await said(() => asStaff('principal', PRINCIPAL)((c) => c.query(`select public.guardian_followup_request('${S1}')`)))).toMatch(/only a guardian/);
    expect(await said(() => fam((c) => c.query(`select public.guardian_followup_request('${S1}')`)))).toMatch(/permission denied/);
  });
});
