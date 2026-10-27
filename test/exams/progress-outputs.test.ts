import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { certificateSvg } from '@/lib/documents/cert-doc';
import { certificatesToPrint, certificateRegister, verifyCertificate } from '@/lib/documents/certificates';
import { makeResultCertificates, resultCertificatesPreview } from '@/lib/documents/result-certificates';
import { composeResultCertificate, gradeFloor, readRules, recipientsOf } from '@/lib/documents/result-certificate-rules';
import { groupByType, progressReport } from '@/lib/exams/progress-report';
import { outputsState, publishAndNotify } from '@/lib/exams/publish-outputs';
import { publishClass, reopenClass } from '@/lib/exams/publish';
import { DEFAULT_EXAM_TYPES } from '@/lib/contracts/exam-types';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { TEMPLATE_LANGUAGES, TEMPLATE_REGISTRY } from '@/lib/whatsapp/templates';

// AJ-5 (C230-AJ part 5, slice E): one step from approved marks to every output.
//   1. A progress report: one child across the session's assessments, grouped by exam type, from published classes only.
//      The staff view; the Family app's (read as the guardian) shows it only for classes whose outputs the office made.
//   2. Merit and participation certificates from a published result, by the rules the school sets in its Documents
//      settings, into the school's register.
//   3. Publish and notify: one message per guardian through the outbox, a second press queues none, and a teacher
//      cannot press it.
// Every name and number is made up.

const u = (n: number) => `a5000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, ADMIN, COORDINATOR, T_CLASS, T_OTHER, ACCOUNTANT, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15), u(16), u(17)];
const [C6A, C6B] = [u(21), u(22)];
const [MATH, SCI] = [u(31), u(32)];
const SESSION = u(41);
const [S1, S2, S3, S4, S5] = [u(51), u(52), u(53), u(54), u(55)];
const [P1, P1B, P2, P3, P4] = [u(61), u(62), u(63), u(64), u(65)];
const [UNIT, HALF, WEEKLY, ANNUAL] = [u(71), u(72), u(73), u(74)];
const ACCOUNT = u(81);
const CHILD = u(82);
const comp = JSON.stringify([{ key: 'marks', name: 'Marks', max: 50, share: null }]);
const SCHEME = {
  bands: [
    { from: 75, to: 100, grade: 'A', meaning: null },
    { from: 50, to: 74, grade: 'B', meaning: null },
    { from: 33, to: 49, grade: 'C', meaning: null },
    { from: 0, to: 32, grade: 'D', meaning: null },
  ],
  decimals: 0,
  passMark: 33,
  components: [{ key: 'theory', kind: 'theory', name: 'Theory', share: 100, passMark: null, parts: [] }],
  terms: [{ name: 'Term 1' }],
  layout: { components: true, total: true, percent: true, grade: true, attendance: false, remarks: true, coScholastic: false },
  coScholastic: null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let link = '';
const claims = { accountId: ACCOUNT, tokenVersion: 0 };
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const admin: Who = { role: 'school_admin', user: ADMIN, school: A };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR, school: A };
const tClass: Who = { role: 'teacher', user: T_CLASS, school: A };
const tOther: Who = { role: 'teacher', user: T_OTHER, school: A };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };
const bPrincipal: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (c: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (c: any) => {
    await c.query(`set local role app_user`);
    for (const [k, v] of Object.entries({ 'app.current_tenant_id': who.school, 'app.current_role': who.role, 'app.current_user_id': who.user })) await c.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(c);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (c: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const queue = createPgJobQueue(platform);
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
const jobs = async () => (await q(`select payload from jobs where type = 'whatsapp.send' order by created_at`)).length;
const publish = (examId: string, who: Who = principal) => as(who, (c) => publishClass(c, actor(who), examId, C6A));
const notify = (examId: string, who: Who = principal) => as(who, (c) => publishAndNotify(c, queue, actor(who), examId, C6A));
const progress = (studentId: string, who: Who = principal, session: string | null = null) => as(who, (c) => progressReport(c, actor(who), studentId, session));
const asGuardian = async <T>(fn: (c: unknown) => Promise<T>): Promise<T> => (await import('@/lib/auth/db')).withGuardianContext(claims, link, fn as never);
const family = async (studentId = S1) => (await import('@/lib/school-link')).readSchoolProgress(claims, link, studentId, { childView: false });
const setDocuments = (values: Record<string, unknown>) =>
  q(`insert into school_settings (school_id, module_id, schema_version, setting_values, revision, updated_by) values ($1, 'documents', 2, $2::jsonb, 1, $3)
     on conflict (school_id, module_id) do update set setting_values = excluded.setting_values, revision = school_settings.revision + 1`, [A, JSON.stringify(values), PRINCIPAL]);

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-aj-5-outputs-tests-0123456789abcdef';
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, address) values
      ('${A}', 'School A', 'IN-HR', false, false, true, 100000, '1 Made-up Road'), ('${B}', 'School B', 'IN-DL', false, false, true, 100000, null);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'a@a.invalid', 'school_admin', 'Arjun Admin', true),
      ('${COORDINATOR}', '${A}', 'c@a.invalid', 'academic_coordinator', 'Chetan Coordinator', true), ('${T_CLASS}', '${A}', 'kt@a.invalid', 'teacher', 'Kiran Classteacher', true),
      ('${T_OTHER}', '${A}', 'ot@a.invalid', 'teacher', 'Omar Other', true), ('${ACCOUNTANT}', '${A}', 'ac@a.invalid', 'accountant', 'Anil Accountant', true),
      ('${B_PRINCIPAL}', '${B}', 'p@b.invalid', 'principal', 'Bela Principal', true);
    insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true), ('${ADMIN}', '${A}', 'school_admin', true), ('${T_CLASS}', '${A}', 'teacher', true);
    insert into teachers (teacher_id, school_id, user_id, name) values (gen_random_uuid(), '${A}', '${T_CLASS}', 'Kiran Classteacher'), (gen_random_uuid(), '${A}', '${T_OTHER}', 'Omar Other');
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
    insert into classes (class_id, school_id, name, grade, section, class_teacher_id) values ('${C6A}', '${A}', '6-A', '6', 'A', '${T_CLASS}'), ('${C6B}', '${A}', '6-B', '6', 'B', null);
    insert into subjects (subject_id, school_id, name) values ('${MATH}', '${A}', 'Mathematics'), ('${SCI}', '${A}', 'Science');
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${S1}', '${A}', 'A-1', 'Aarav Kumar', '${C6A}', '1', 'active'), ('${S2}', '${A}', 'A-2', 'Bela Singh', '${C6A}', '2', 'active'),
      ('${S3}', '${A}', 'A-3', 'Chirag Rao', '${C6A}', '3', 'active'), ('${S4}', '${A}', 'A-4', 'Diya Shah', '${C6A}', '4', 'active'),
      ('${S5}', '${A}', 'A-5', 'Esha Nair', '${C6B}', '1', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values
      ('${P1}', '${A}', 'Rajesh Kumar', '9800000001', 'Father'), ('${P1B}', '${A}', 'Rita Kumar', '9800000011', 'Mother'), ('${P2}', '${A}', 'Sunita Singh', '9800000002', 'Mother'),
      ('${P3}', '${A}', 'Ravi Rao', '9800000003', 'Father'), ('${P4}', '${A}', 'Hina Shah', '9800000004', 'Mother');
    insert into parent_student_map (school_id, parent_id, student_id) values
      ('${A}', '${P1}', '${S1}'), ('${A}', '${P1B}', '${S1}'), ('${A}', '${P2}', '${S2}'), ('${A}', '${P3}', '${S3}'), ('${A}', '${P4}', '${S4}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version)
      select '${A}', s, p::consent_purpose, true, 'school_attested', 'v1' from unnest(array['${S1}', '${S2}', '${S3}', '${S4}']::uuid[]) s cross join unnest(array['core_records', 'operational_communication']) p;
    insert into grading_schemes (school_id, version, scheme, made_by) values ('${A}', 1, '${JSON.stringify(SCHEME)}'::jsonb, '${PRINCIPAL}');
    -- Unit test and Half-yearly: published. Weekly test: marks entered, never published. Annual: published, then reopened.
    insert into exams (exam_id, school_id, name, term, session_id, exam_type, created_by, created_at) values
      ('${UNIT}', '${A}', 'Unit test 1', 'Term 1', '${SESSION}', 'unit', '${PRINCIPAL}', '2026-08-01 10:00+05:30'),
      ('${HALF}', '${A}', 'Half-yearly', 'Term 1', '${SESSION}', 'half_yearly', '${PRINCIPAL}', '2026-09-01 10:00+05:30'),
      ('${WEEKLY}', '${A}', 'Weekly test 4', null, '${SESSION}', 'weekly', '${PRINCIPAL}', '2026-10-01 10:00+05:30'),
      ('${ANNUAL}', '${A}', 'Annual', 'Term 2', '${SESSION}', 'annual', '${PRINCIPAL}', '2026-10-10 10:00+05:30');
    insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, unit_ids, components, paper_date, created_by)
      select gen_random_uuid(), '${A}', x.exam_id, '${C6A}', s.subject_id, '{}', '${comp}', x.day::date, '${PRINCIPAL}'
        from (values ('${UNIT}'::uuid, '2026-08-10'), ('${HALF}', '2026-10-05'), ('${WEEKLY}', '2026-10-06'), ('${ANNUAL}', '2026-10-12')) x(exam_id, day)
        cross join (values ('${MATH}'::uuid), ('${SCI}')) s(subject_id);
    insert into school_module_entitlements (school_id, module_id, enabled, source) select s, 'exams', true, 'plan' from unnest(array['${A}', '${B}']::uuid[]) s
      on conflict (school_id, module_id) do update set enabled = true;
  `);
  // Marks. Per exam: [Mathematics, Science] out of 50 for each child; S4 was absent throughout.
  const scores: Record<string, Record<string, [number, number] | null>> = {
    [UNIT]: { [S1]: [45, 40], [S2]: [30, 30], [S3]: [10, 10], [S4]: null },
    [HALF]: { [S1]: [48, 47], [S2]: [40, 40], [S3]: [20, 20], [S4]: null },
    [WEEKLY]: { [S1]: [10, 10], [S2]: [10, 10], [S3]: [10, 10], [S4]: null },
    [ANNUAL]: { [S1]: [50, 50], [S2]: [25, 25], [S3]: [5, 5], [S4]: null },
  };
  for (const [exam, byChild] of Object.entries(scores)) {
    for (const [student, got] of Object.entries(byChild)) {
      for (const [i, subject] of [MATH, SCI].entries()) {
        await q(
          `insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by)
           select '${A}', $1, $2, p.paper_id, 'marks', $3, $4, $5, $6, '${T_CLASS}' from exam_papers p where p.exam_id = $1 and p.subject_id = $2 and p.class_id = '${C6A}'`,
          [exam, subject, student, got ? 'score' : 'absent', got ? got[i] : null, got ? 50 : 0]
        );
      }
    }
  }
  await q(`update exam_papers set entered_at = now(), entered_by = '${T_CLASS}'`);
  for (const lang of TEMPLATE_LANGUAGES) {
    const def = TEMPLATE_REGISTRY.find((d) => d.name === 'exam_result_ready')!;
    await q(
      `insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status, approved_at, wording_reviewed, wording_reviewed_by, wording_reviewed_at, wording_reviewed_note)
       values (null, $1, $2, $3, $4, $5, 'utility', $6, 'approved', now(), true, gen_random_uuid(), now(), 'Read by a Hindi reader (made up for the test).')`,
      [def.name, def.version, lang, def.body[lang], [...def.variables], def.staleAfterMinutes]
    );
  }
  // The real path to a family: the principal makes a code for P1, the family spends it and matches its child to S1.
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'parent@example.org');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ('${CHILD}', '${ACCOUNT}', 'Aarav', 6, 'CBSE', 'en', 'en', 'IN-HR');
  `);
  const { issueConnectCode, redeemConnectCode } = await import('@/lib/school-link');
  const { withFamilyContext } = await import('@/lib/auth/db');
  const { setChildLinks } = await import('@/lib/family/school');
  const issued = await as(principal, (c) => issueConnectCode(c, { userId: PRINCIPAL, role: 'principal', schoolId: A }, P1));
  const made = await withFamilyContext(claims, (c) => redeemConnectCode(c, ACCOUNT, (issued as { code: string }).code));
  link = made!.linkId;
  await withFamilyContext(claims, (c) => setChildLinks(c, ACCOUNT, link, [S1], [{ studentId: S1, childId: CHILD }]));
}, 180_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

const exams = (r: Awaited<ReturnType<typeof progress>>) => {
  if (!r.ok) throw new Error(r.reason);
  return r.report.groups.map((g) => [g.type, g.exams.map((e) => e.name)]);
};

describe('the progress report: one child across the session, by exam type, from published classes only', () => {
  it('nothing is in it before a class is published', async () => {
    expect(exams(await progress(S1))).toEqual([]);
  });

  it('a child with a published Unit test and a published Half-yearly sees both, grouped by type, in the school’s order of types', async () => {
    expect(await publish(HALF)).toMatchObject({ ok: true });
    expect(await publish(UNIT)).toMatchObject({ ok: true });
    const r = await progress(S1);
    if (!r.ok) throw new Error(r.reason);
    expect(r.report.session).toEqual({ sessionId: SESSION, label: '2026-27' });
    expect(r.report.student).toMatchObject({ name: 'Aarav Kumar', className: '6-A' });
    expect(r.report.groups.map((g) => [g.type, g.name, g.exams.map((e) => e.name)])).toEqual([
      ['unit', { en: 'Unit test', hi: 'इकाई परीक्षा' }, ['Unit test 1']],
      ['half_yearly', { en: 'Half-yearly', hi: 'अर्धवार्षिक परीक्षा' }, ['Half-yearly']],
    ]);
    // Graded by the scheme kept with each publication: each subject's percent and grade, and the overall.
    expect(r.report.groups[0].exams[0]).toMatchObject({
      term: 'Term 1',
      day: '2026-08-10',
      subjects: [{ name: 'Mathematics', percent: 90, grade: 'A' }, { name: 'Science', percent: 80, grade: 'A' }],
      overall: { percent: 85, grade: 'A' },
    });
    expect(r.report.groups[1].exams[0].overall).toEqual({ percent: 95, grade: 'A' });
  });

  it('an exam not published for the class is absent: the weekly test (never published) and the annual (published, then reopened)', async () => {
    expect(await publish(ANNUAL)).toMatchObject({ ok: true });
    expect(exams(await progress(S1)).flat(2)).toContain('Annual');
    expect(await as(principal, (c) => reopenClass(c, actor(principal), ANNUAL, C6A, 'A mark was added up wrongly.'))).toMatchObject({ ok: true });
    const names = (exams(await progress(S1)) as [string, string[]][]).flatMap(([, n]) => n);
    expect(names).toEqual(['Unit test 1', 'Half-yearly']);
    expect(names).not.toContain('Weekly test 4');
    expect(names).not.toContain('Annual');
  });

  it('only the child’s own marks: a child absent throughout shows the exams with no percent, another class’s child has no report from this class', async () => {
    const r = await progress(S4);
    if (!r.ok) throw new Error(r.reason);
    expect(r.report.groups.map((g) => g.exams.map((e) => [e.name, e.overall.percent, e.overall.grade]))).toEqual([[['Unit test 1', null, null]], [['Half-yearly', null, null]]]);
    expect(exams(await progress(S5))).toEqual([]);
    expect(JSON.stringify((await progress(S1)) as unknown)).not.toMatch(/Bela|Chirag|Diya|rank|position/i);
  });

  it('uses the school’s own names for its types, and a type removed from the list reads as Other', async () => {
    await q(
      `insert into school_settings (school_id, module_id, schema_version, setting_values, revision, updated_by) values ($1, 'exams', 3, $2::jsonb, 1, $3)
       on conflict (school_id, module_id) do update set setting_values = excluded.setting_values, revision = school_settings.revision + 1`,
      [A, JSON.stringify({ exam_types: [{ key: 'unit', en: 'Class test', hi: 'कक्षा परीक्षा', hidden: false }, { key: 'other', en: 'Other', hi: 'अन्य', hidden: false }] }), PRINCIPAL]
    );
    const r = await progress(S1);
    if (!r.ok) throw new Error(r.reason);
    expect(r.report.groups.map((g) => [g.type, g.name.en, g.exams.map((e) => e.name)])).toEqual([
      ['unit', 'Class test', ['Unit test 1']],
      ['other', 'Other', ['Half-yearly']],
    ]);
    await q(`delete from school_settings where school_id = $1 and module_id = 'exams'`, [A]);
  });

  it('groups in the order of the list, an unknown type as Other (pure)', () => {
    const exam = (name: string, type: string) => ({ examId: name, name, term: null, day: null, publishedOn: '2026-10-01', subjects: [], overall: { percent: null, grade: null }, type });
    const got = groupByType([exam('B', 'annual'), exam('A', 'unit'), exam('C', 'gone')], DEFAULT_EXAM_TYPES);
    expect(got.map((g) => [g.type, g.exams.map((e) => e.name)])).toEqual([['unit', ['A']], ['annual', ['B']], ['other', ['C']]]);
  });

  it('who may read it: the office and the child’s class teacher; another teacher, the accountant and another school’s office cannot', async () => {
    expect(await progress(S1, admin)).toMatchObject({ ok: true });
    expect(await progress(S1, coordinator)).toMatchObject({ ok: true });
    expect(await progress(S1, tClass)).toMatchObject({ ok: true });
    expect(await progress(S1, tOther)).toEqual({ ok: false, reason: 'not_found' }); // the school's rules show another class's child to a teacher of other classes nowhere
    expect(await progress(S1, accountant)).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await progress(S1, bPrincipal)).toEqual({ ok: false, reason: 'not_found' });
    expect(await progress('not-an-id')).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('the Family app shows it for published classes whose outputs the office made, and only the child’s own', () => {
  it('published but not yet made: the family sees no progress report', async () => {
    expect(await family()).toEqual({ session: '2026-27', groups: [] });
  });

  it('publish and notify: nothing before the class is published, and a teacher, the coordinator and the accountant cannot', async () => {
    expect(await notify(WEEKLY)).toEqual({ ok: false, reason: 'not_published' });
    expect(await notify(UNIT, tClass)).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await notify(UNIT, tOther)).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await notify(UNIT, coordinator)).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await notify(UNIT, accountant)).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await notify(UNIT, bPrincipal)).toEqual({ ok: false, reason: 'not_found' });
    expect(await as(tClass, (c) => outputsState(c, actor(tClass), UNIT, C6A))).toBe('not_allowed');
    expect(await q(`select count(*)::int as n from exam_outputs`)).toEqual([{ n: 0 }]);
    expect(await jobs()).toBe(0);
  });

  it('the database says the same: a teacher, the coordinator or a parent cannot make or read the record, and nobody changes or removes it', async () => {
    const pub = (await q(`select publication_id from exam_publications where exam_id = $1 and class_id = $2 and reopened_at is null`, [UNIT, C6A]))[0].publication_id;
    const insert = (who: Who) => as(who, (c) => c.query(`insert into exam_outputs (school_id, publication_id, made_by) values ($1, $2, $3)`, [A, pub, who.user])).then(() => 'made', (e) => (/row-level security/.test(String(e.message)) ? 'refused' : String(e.message)));
    expect(await insert(tClass)).toBe('refused');
    expect(await insert(coordinator)).toBe('refused');
    expect(await insert(accountant)).toBe('refused');
    expect(await as(tClass, async (c) => (await c.query(`select 1 from exam_outputs`)).rows.length)).toBe(0);
    expect(await asGuardian((c) => (c as { query: (s: string) => Promise<{ rows: unknown[] }> }).query(`select 1 from exam_outputs`)).then((r) => r.rows.length, () => 0)).toBe(0);
    expect(await q(`select count(*)::int as n from exam_outputs`)).toEqual([{ n: 0 }]);
  });

  it('one action: makes the outputs and queues exactly one message per guardian through the outbox; a second press queues none', async () => {
    const first = await notify(UNIT);
    // Five guardians with a number and the school's consent for messages: S1 has two.
    expect(first).toEqual({ ok: true, version: 1, first: true, queued: 5, children: 4 });
    expect(await jobs()).toBe(5);
    const keys = (await q(`select dedupe_key from communication_log order by dedupe_key`)).map((r: { dedupe_key: string }) => r.dedupe_key);
    expect(keys).toHaveLength(5);
    expect(new Set(keys).size).toBe(5);
    for (const k of keys) expect(k).toMatch(new RegExp(`^exam-result:${UNIT}:${C6A}:1:`));
    const second = await notify(UNIT);
    expect(second).toEqual({ ok: true, version: 1, first: false, queued: 0, children: 0 });
    expect(await jobs()).toBe(5);
    expect(await q(`select count(*)::int as n from communication_log`)).toEqual([{ n: 5 }]);
    expect(await q(`select count(*)::int as n from exam_outputs`)).toEqual([{ n: 1 }]);
    expect(await as(principal, (c) => outputsState(c, actor(principal), UNIT, C6A))).toMatchObject({ version: 1, made: true });
    expect(await as(admin, (c) => outputsState(c, actor(admin), HALF, C6A))).toMatchObject({ version: 1, made: false, madeAt: null });
  });

  it('the audit row holds ids and counts only', async () => {
    const rows = await q(`select actor_user_id, after_state from audit_log where event_action = 'exam.outputs_made'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_user_id).toBe(PRINCIPAL);
    expect(rows[0].after_state).toEqual({ exam_id: UNIT, class_id: C6A, version: 1, children: 4, queued: 5 });
  });

  it('the push job counts a class as news when its outputs are made, after its publication', async () => {
    const { readSchoolNews } = await import('@/lib/school-link');
    const at = (await q(`select (x.published_at + interval '1 microsecond')::text as since from exam_publications x where x.exam_id = $1 and x.class_id = $2 and x.reopened_at is null`, [UNIT, C6A]))[0].since as string;
    const since = { homework: at, notices: at, results: at };
    const n = await readSchoolNews(claims, link, [S1], since);
    expect(n.results).toBe(1); // the Unit test's outputs were made after it was published; the Half-yearly (published before, no outputs yet) is not news
    const later = new Date(Date.now() + 3600_000).toISOString();
    expect((await readSchoolNews(claims, link, [S1], { ...since, results: later })).results).toBe(0);
  });

  it('now the family sees the Unit test, not the Half-yearly (published, not yet made), the weekly test or the reopened annual', async () => {
    const got = await family();
    expect(got?.groups.map((g) => [g.type, g.name.en, g.exams.map((e) => e.name)])).toEqual([['unit', 'Unit test', ['Unit test 1']]]);
    expect(got?.groups[0].exams[0]).toMatchObject({ overall: { percent: 85, grade: 'A' }, subjects: [{ name: 'Mathematics', percent: 90, grade: 'A' }, { name: 'Science', percent: 80, grade: 'A' }] });
    expect(JSON.stringify(got)).not.toMatch(/Bela|Chirag|Diya|Weekly|Annual|rank/);
    // Making the Half-yearly's too: both, grouped by type.
    expect(await notify(HALF)).toMatchObject({ ok: true, first: true, queued: 5 });
    const both = await family();
    expect(both?.groups.map((g) => [g.type, g.exams.map((e) => e.name)])).toEqual([['unit', ['Unit test 1']], ['half_yearly', ['Half-yearly']]]);
  });

  it('the kinds of exam are the school’s own words, in the family’s language too', async () => {
    await q(
      `insert into school_settings (school_id, module_id, schema_version, setting_values, revision, updated_by) values ($1, 'exams', 3, $2::jsonb, 1, $3)
       on conflict (school_id, module_id) do update set setting_values = excluded.setting_values, revision = school_settings.revision + 1`,
      [A, JSON.stringify({ exam_types: [{ key: 'unit', en: 'Class test', hi: 'कक्षा परीक्षा', hidden: false }, { key: 'half_yearly', en: 'Half-yearly', hi: 'अर्धवार्षिक', hidden: false }, { key: 'other', en: 'Other', hi: 'अन्य', hidden: false }] }), PRINCIPAL]
    );
    expect((await family())?.groups.map((g) => g.name)).toEqual([{ en: 'Class test', hi: 'कक्षा परीक्षा' }, { en: 'Half-yearly', hi: 'अर्धवार्षिक' }]);
    await q(`delete from school_settings where school_id = $1 and module_id = 'exams'`, [A]);
  });

  it('the family reads another child of the school as nothing: a classmate is not theirs', async () => {
    expect(await family(S2)).toBeNull();
  });

  it('a reopened class has a new publication: its outputs are made again, once', async () => {
    expect(await as(principal, (c) => reopenClass(c, actor(principal), UNIT, C6A, 'A mark was added up wrongly.'))).toMatchObject({ ok: true });
    expect(await as(principal, (c) => outputsState(c, actor(principal), UNIT, C6A))).toBe('not_published');
    expect((await family())?.groups.map((g) => g.exams.map((e) => e.name))).toEqual([['Half-yearly']]);
    expect(await publish(UNIT)).toMatchObject({ ok: true, version: 2 });
    expect(await as(principal, (c) => outputsState(c, actor(principal), UNIT, C6A))).toMatchObject({ version: 2, made: false });
    expect(await notify(UNIT)).toMatchObject({ ok: true, first: true, version: 2, queued: 5 });
    expect(await notify(UNIT)).toMatchObject({ ok: true, first: false, queued: 0 });
  });
});

describe('merit and participation certificates from a published result, by the school’s own rules (pure)', () => {
  const bands = SCHEME.bands;
  const kids = [
    { studentId: 'a', sat: true, grade: 'A', percent: 95 },
    { studentId: 'b', sat: true, grade: 'B', percent: 60 },
    { studentId: 'c', sat: true, grade: 'D', percent: 20 },
    { studentId: 'd', sat: false, grade: null, percent: null },
  ];
  it('reads the rules with their defaults: nothing until the school sets them', () => {
    expect(readRules({})).toEqual({ merit: { basis: 'off' }, participation: 'off' });
    expect(readRules({ merit_basis: 'grade', merit_grade: ' A ', participation_for: 'everyone' })).toEqual({ merit: { basis: 'grade', grade: 'A' }, participation: 'everyone' });
    expect(readRules({ merit_basis: 'percent', merit_percent: 250 })).toEqual({ merit: { basis: 'percent', percent: 100 }, participation: 'off' });
    expect(readRules({ merit_basis: 'weird', participation_for: 'weird' })).toEqual({ merit: { basis: 'off' }, participation: 'off' });
  });
  it('grade A or better: the matching children only; participation for every child who sat', () => {
    expect(recipientsOf({ merit: { basis: 'grade', grade: 'A' }, participation: 'everyone' }, bands, kids)).toEqual({ merit: ['a'], participation: ['a', 'b', 'c'], noSuchGrade: false });
    expect(recipientsOf({ merit: { basis: 'grade', grade: 'b' }, participation: 'others' }, bands, kids)).toEqual({ merit: ['a', 'b'], participation: ['c'], noSuchGrade: false });
    expect(recipientsOf({ merit: { basis: 'percent', percent: 60 }, participation: 'off' }, bands, kids)).toEqual({ merit: ['a', 'b'], participation: [], noSuchGrade: false });
  });
  it('a grade the kept scheme does not have gives nobody merit, and says so', () => {
    expect(recipientsOf({ merit: { basis: 'grade', grade: 'A+' }, participation: 'off' }, bands, kids)).toEqual({ merit: [], participation: [], noSuchGrade: true });
    expect(gradeFloor(bands, 'a')).toBe(75);
    expect(gradeFloor(bands, 'Z')).toBeNull();
  });
  it('prints the exam in the studio’s achievement layout, and never a mark, a grade or a percent', () => {
    const c = composeResultCertificate({ kind: 'merit', child: 'Aarav Kumar', className: '6-A', exam: 'Half-yearly', term: 'Term 1', session: '2026-27', school: 'School A', address: null });
    if (!c.ok) throw new Error(c.reason);
    expect(c.printed).toMatchObject({ kind: 'Merit', recipientName: 'Aarav Kumar', studentName: 'Aarav Kumar', className: '6-A', event: 'Half-yearly · Term 1', year: '2026-27', schoolName: 'School A' });
    expect(c.purpose).toBe('Half-yearly · Term 1');
    expect(JSON.stringify(c)).not.toMatch(/percent|grade|%|marks/i);
    expect(composeResultCertificate({ kind: 'participation', child: '', className: null, exam: 'x', term: null, session: null, school: 'S', address: null })).toEqual({ ok: false, reason: 'incomplete' });
  });
});

describe('the certificates, into the school’s register', () => {
  const preview = (examId: string, who: Who = principal) => as(who, (c) => resultCertificatesPreview(c, actor(who), examId, C6A));
  const make = (examId: string, who: Who = principal) => as(who, (c) => makeResultCertificates(c, actor(who), examId, C6A));
  const names = (p: Awaited<ReturnType<typeof preview>>, kind: 'merit' | 'participation', state: 'will' | 'made') => {
    if (typeof p === 'string') throw new Error(p);
    return p.children.filter((c) => c[kind] === state).map((c) => c.name);
  };

  it('with no rule set, nobody is given a certificate', async () => {
    const p = await preview(HALF);
    if (typeof p === 'string') throw new Error(p);
    expect(p.will).toEqual({ merit: 0, participation: 0 });
    expect(p.rules).toEqual({ merit: { basis: 'off' }, participation: 'off' });
    expect(await make(HALF)).toMatchObject({ ok: true, merit: 0, participation: 0, certificateIds: [] });
  });

  it('a “grade A” rule: merit for the matching children only, participation for every child who sat', async () => {
    await setDocuments({ merit_basis: 'grade', merit_grade: 'A', participation_for: 'everyone' });
    const p = await preview(HALF);
    // Half-yearly: Aarav 95 (A), Bela 80 (A), Chirag 40 (C); Diya was absent throughout.
    expect(names(p, 'merit', 'will')).toEqual(['Aarav Kumar', 'Bela Singh']);
    expect(names(p, 'participation', 'will')).toEqual(['Aarav Kumar', 'Bela Singh', 'Chirag Rao']);
    expect(await q(`select count(*)::int as n from certificates_issued`)).toEqual([{ n: 0 }]); // the preview made nothing
    const made = await make(HALF);
    expect(made).toMatchObject({ ok: true, merit: 2, participation: 3, skipped: 0 });
    const rows = await q(`select cert_type, number, student_id, purpose, clearance, signed_by from certificates_issued order by cert_type, seq`);
    expect(rows.map((r: { cert_type: string; number: string }) => [r.cert_type, r.number])).toEqual([['merit', 'MC/0001'], ['merit', 'MC/0002'], ['participation', 'PC/0001'], ['participation', 'PC/0002'], ['participation', 'PC/0003']]);
    expect(new Set(rows.map((r: { student_id: string }) => r.student_id))).toEqual(new Set([S1, S2, S3]));
    expect(rows.every((r: { purpose: string; clearance: string; signed_by: string }) => r.purpose === 'Half-yearly · Term 1' && r.clearance === 'not_required' && r.signed_by === PRINCIPAL)).toBe(true);
    expect(await q(`select count(*)::int as n from exam_certificates`)).toEqual([{ n: 5 }]);
  });

  it('a second press makes none; the preview says who already has one', async () => {
    expect(await make(HALF)).toMatchObject({ ok: true, merit: 0, participation: 0, certificateIds: [] });
    expect(await q(`select count(*)::int as n from certificates_issued`)).toEqual([{ n: 5 }]);
    const p = await preview(HALF);
    expect(names(p, 'merit', 'made')).toEqual(['Aarav Kumar', 'Bela Singh']);
    expect(names(p, 'merit', 'will')).toEqual([]);
    expect((await preview(HALF) as { made: unknown }).made).toEqual({ merit: 2, participation: 3 });
  });

  it('the audit rows hold ids and counts', async () => {
    const rows = await q(`select event_action, after_state from audit_log where event_action in ('exam.certificates_made') order by audit_id`);
    expect(rows).toEqual([{ event_action: 'exam.certificates_made', after_state: { exam_id: HALF, class_id: C6A, version: 1, merit: 2, participation: 3, skipped: 0 } }]);
    const each = await q(`select after_state from audit_log where event_action = 'certificate.issued' and (after_state ->> 'examId') = $1`, [HALF]);
    expect(each).toHaveLength(5);
    expect(JSON.stringify(each)).not.toMatch(/Aarav|Bela|Chirag|Half-yearly/);
  });

  it('the certificates are in the register as merit and participation, are drawn in the studio’s layout with the school’s number and no mark, and the public check page knows them', async () => {
    const reg = await as(principal, (c) => certificateRegister(c, actor(principal), { type: 'merit' }));
    expect(reg).toHaveLength(2);
    expect(reg![0]).toMatchObject({ cert_type: 'merit', clearance: 'not_required', signed_by: 'Priya Principal', purpose: 'Half-yearly · Term 1' });
    const ids = (await q(`select certificate_id from certificates_issued order by cert_type, seq`)).map((r: { certificate_id: string }) => r.certificate_id);
    const list = await as(principal, (c) => certificatesToPrint(c, actor(principal), ids));
    expect(list).toHaveLength(5);
    const merit = certificateSvg(list![0], {});
    expect(merit).toContain('OF MERIT');
    expect(merit).toContain('Aarav Kumar');
    expect(merit).toContain('Half-yearly');
    expect(merit).toContain('MC/0001');
    expect(merit).not.toMatch(/95|80|%|Grade/);
    expect(certificateSvg(list![2], {})).toContain('OF PARTICIPATION');
    const token = list![0].token;
    expect(await platform((c) => verifyCertificate(c, token))).toMatchObject({ state: 'valid', type: 'merit', number: 'MC/0001', schoolName: 'School A' });
  });

  it('who may: the principal and the school admin; not the teacher, the coordinator or the accountant; nothing for an unpublished class or another school', async () => {
    for (const who of [tClass, coordinator, accountant]) {
      expect(await preview(HALF, who), who.role).toBe('not_allowed');
      expect(await make(HALF, who), who.role).toEqual({ ok: false, reason: 'not_allowed' });
    }
    expect(await preview(WEEKLY)).toBe('not_published');
    expect(await make(WEEKLY)).toEqual({ ok: false, reason: 'not_published' });
    expect(await preview(HALF, bPrincipal)).toBe('not_found');
    expect(await preview(HALF, admin)).toMatchObject({ will: { merit: 0, participation: 0 } });
    const direct = (who: Who) => as(who, async (c) => (await c.query(`select 1 from exam_certificates`)).rows.length);
    expect(await direct(tClass)).toBe(0);
    expect(await direct(principal)).toBe(5);
  });

  it('by percent, and participation only for those without merit: a different publication, a different rule', async () => {
    await setDocuments({ merit_basis: 'percent', merit_percent: 80, participation_for: 'others' });
    const p = await preview(UNIT);
    // The Unit test was reopened and published again (version 2): Aarav 85, Bela 60, Chirag 20; Diya absent.
    expect(names(p, 'merit', 'will')).toEqual(['Aarav Kumar']);
    expect(names(p, 'participation', 'will')).toEqual(['Bela Singh', 'Chirag Rao']);
    expect(await make(UNIT, admin)).toMatchObject({ ok: true, merit: 1, participation: 2 });
    // Aarav's Unit-test merit certificate is a certificate of its own, not a duplicate of the Half-yearly's.
    expect(await q(`select count(*)::int as n from certificates_issued where student_id = $1 and cert_type = 'merit'`, [S1])).toEqual([{ n: 2 }]);
    const adminRows = await q(`select signed_by from certificates_issued where purpose like 'Unit test 1%'`);
    expect(adminRows.every((r: { signed_by: string | null }) => r.signed_by === null)).toBe(true); // the admin is not named a signatory: a line for the principal's hand
  });

  it('a grade the kept scheme does not have gives nobody a certificate, and the preview says so', async () => {
    await setDocuments({ merit_basis: 'grade', merit_grade: 'A+', participation_for: 'off' });
    const p = await preview(UNIT);
    if (typeof p === 'string') throw new Error(p);
    expect(p.noSuchGrade).toBe(true);
    expect(p.will).toEqual({ merit: 0, participation: 0 });
  });

  it('the rules live in the Documents settings, not the Exams block', async () => {
    const { settingsSchemaFor } = await import('@/lib/frameworks/settings-schemas');
    const docs = settingsSchemaFor('documents')!.fields.map((f) => f.key);
    expect(docs).toEqual(expect.arrayContaining(['merit_basis', 'merit_grade', 'merit_percent', 'participation_for']));
    const exams = settingsSchemaFor('exams')!.fields.map((f) => f.key);
    for (const k of ['merit_basis', 'merit_grade', 'merit_percent', 'participation_for']) expect(exams).not.toContain(k);
  });
});
