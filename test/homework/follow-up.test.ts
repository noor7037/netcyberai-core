import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { HOMEWORK_FOLLOW_UP_JOB, homeworkFollowUpForSchool, homeworkFollowUpHandler, previousSchoolDay, subjectsPhrase } from '@/lib/homework/follow-up';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { productionHandlers } from '@/lib/jobs/handlers';
import type { ClaimedJob } from '@/lib/jobs/types';
import { DEFAULT_CALENDAR } from '@/lib/payments/upi';
import { TEMPLATE_REGISTRY, definitionProblem, metaShapeProblem, variablesIn } from '@/lib/whatsapp/templates';
import { templateExample } from '@/lib/whatsapp/template-examples';

// Homework follow-up on WhatsApp (C544). Every name and number is made up; nothing leaves the process.

describe('the words and the day', () => {
  it('the template names the school first, uses exactly its variables in English and Hindi, is in Meta’s shape, and has an example of each value', () => {
    const d = TEMPLATE_REGISTRY.find((t) => t.name === 'homework_follow_up')!;
    expect(d).toMatchObject({ version: 1, category: 'utility', purpose: 'operational_communication' });
    expect(definitionProblem(d)).toBeNull();
    for (const lang of ['en', 'hi'] as const) {
      expect(variablesIn(d.body[lang]).sort()).toEqual(['child', 'date', 'school', 'subjects']);
      expect(metaShapeProblem(d.body[lang])).toBeNull();
      for (const v of d.variables) expect(templateExample(d.name, v, lang), `${lang} ${v}`).not.toBeNull();
    }
    // No mark, no surname, nothing of another child: the only values are these four.
    expect([...d.variables].sort()).toEqual(['child', 'date', 'school', 'subjects']);
    // The acknowledgements too: whole, in both languages.
    for (const name of ['reply_received', 'reply_received_class', 'answer_recorded', 'help_follow_up']) expect(definitionProblem(TEMPLATE_REGISTRY.find((t) => t.name === name)!), name).toBeNull();
  });
  it('the subjects: at most three by name, then how many more, in the message’s language', () => {
    expect(subjectsPhrase(['Maths'], 'en')).toBe('Maths');
    expect(subjectsPhrase(['Hindi', 'Maths'], 'en')).toBe('Hindi and Maths');
    expect(subjectsPhrase(['Art', 'Hindi', 'Maths'], 'en')).toBe('Art, Hindi and Maths');
    expect(subjectsPhrase(['Art', 'Hindi', 'Maths', 'Music', 'Science'], 'en')).toBe('Art, Hindi, Maths and 2 more');
    expect(subjectsPhrase(['Hindi', 'Maths'], 'hi')).toBe('Hindi और Maths');
    expect(subjectsPhrase(['Art', 'Hindi', 'Maths', 'Music'], 'hi')).toBe('Art, Hindi, Maths और 1 अन्य');
    expect(subjectsPhrase(['Maths\n\tand  more'], 'en')).toBe('Maths and more'); // one line: Meta refuses new lines in a value
  });
  it('the school day before: the school’s own working days and holidays', () => {
    expect(new Date('2026-11-23T00:00:00Z').getUTCDay()).toBe(1); // a Monday
    expect(previousSchoolDay(DEFAULT_CALENDAR, '2026-11-23')).toBe('2026-11-21'); // Saturday, a working day by default
    expect(previousSchoolDay({ weekdays: new Set([1, 2, 3, 4, 5]), holidays: new Set() }, '2026-11-23')).toBe('2026-11-20');
    expect(previousSchoolDay({ weekdays: DEFAULT_CALENDAR.weekdays, holidays: new Set(['2026-11-21', '2026-11-20']) }, '2026-11-23')).toBe('2026-11-19');
    expect(previousSchoolDay({ weekdays: new Set(), holidays: new Set() }, '2026-11-23')).toBeNull();
  });
  it('the job is wired to the runner', () => {
    expect(Object.keys(productionHandlers())).toContain(HOMEWORK_FOLLOW_UP_JOB);
  });
});

const A = 'c5440000-0000-4000-8000-000000000001';
const B = 'c5440000-0000-4000-8000-000000000002';
const TEST = 'c5440000-0000-4000-8000-000000000003';
const OFF = 'c5440000-0000-4000-8000-000000000004';
const u = (n: number) => `c5440000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const TODAY = '2026-11-23'; // Monday
const PREV = '2026-11-21'; // Saturday: the school day before
const EARLIER = '2026-11-20';
// Teachers, classes, subjects: one each per school; A has six subjects.
const T: Record<string, string> = { [A]: u(1), [B]: u(2), [TEST]: u(3), [OFF]: u(4) };
const C: Record<string, string> = { [A]: u(11), [B]: u(12), [TEST]: u(13), [OFF]: u(14) };
const SUB = { art: u(21), hindi: u(22), maths: u(23), music: u(24), science: u(25), english: u(26), bMaths: u(27), tMaths: u(28), offMaths: u(29) };
const RAHUL = u(31);
const PRIYA = u(32);
const KABIR = u(33);
const MEERA = u(34);
const DEV = u(35); // school B
const ESHA = u(36); // the test school
const OMAR = u(37); // a school with Homework off
const G1 = u(41); // Rahul's guardian         +919100000001
const G2 = u(42); // Rahul's guardian, STOP    +919100000002
const G3 = u(43); // Rahul's guardian row with G1's number, written another way
const G4 = u(44); // Priya's guardian, prefers Hindi
const G5 = u(45); // Kabir's guardian: no consent
const G6 = u(46); // Meera's guardian
const GB = u(47); // Dev's guardian in school B, with G1's very number
const GT = u(48); // Esha's guardian in the test school
const GO = u(49); // Omar's guardian

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const queue = createPgJobQueue(platform);
const job = (date = TODAY): ClaimedJob => ({ jobId: 'j', type: HOMEWORK_FOLLOW_UP_JOB, payload: { date }, attempts: 1, maxAttempts: 4, schoolId: null, idempotencyKey: `${HOMEWORK_FOLLOW_UP_JOB}:${date}` });
const run = (date = TODAY) => homeworkFollowUpHandler({ platform, queue, now: () => new Date(`${date}T02:15:00Z`) })(job(date));
const log = async () =>
  (await db.pg.query(
    `select l.school_id, l.student_id, l.parent_id, l.to_phone, l.status::text as status, l.reason, l.purpose, l.language, l.template_params as p, l.dedupe_key
       from communication_log l where l.template_name = 'homework_follow_up' order by l.school_id, l.student_id, l.parent_id`
  )).rows;

let hw = 0;
// One homework set for a class, due on a day, with each child's mark: true, false, or no row at all (unmarked).
const homework = async (school: string, subject: string, due: string, marks: Record<string, boolean | null>) => {
  const h = u(60 + ++hw);
  const t = u(80 + hw);
  await db.pg.query(`insert into homework (homework_id, school_id, subject_id, title, due_date, created_by) values ($1, $2, $3, 'Exercise', $4, $5)`, [h, school, subject, due, T[school]]);
  await db.pg.query(`insert into homework_targets (target_id, school_id, homework_id, class_id, title, due_date) values ($1, $2, $3, $4, 'Exercise', $5)`, [t, school, h, C[school], due]);
  for (const [student, done] of Object.entries(marks)) {
    if (done === null) continue;
    await db.pg.query(`insert into homework_status (school_id, target_id, class_id, student_id, done, checked_by) values ($1, $2, $3, $4, $5, $6)`, [school, t, C[school], student, done, T[school]]);
  }
};

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    const d = TEMPLATE_REGISTRY.find((t) => t.name === 'homework_follow_up')!;
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values
        ('${A}', 'School A', 'IN-HR', false, false, true, 100000, '00:00', '00:00'), ('${B}', 'School B', 'IN-HR', false, false, true, 100000, '00:00', '00:00'),
        ('${TEST}', 'Test School', 'IN-HR', true, false, true, 100000, '00:00', '00:00'), ('${OFF}', 'School Off', 'IN-HR', false, false, true, 100000, '00:00', '00:00');
      insert into users (user_id, school_id, email, role, display_name) values
        ('${T[A]}', '${A}', 't@a.example', 'teacher', 'Teacher A'), ('${T[B]}', '${B}', 't@b.example', 'teacher', 'Teacher B'),
        ('${T[TEST]}', '${TEST}', 't@test.example', 'teacher', 'Teacher T'), ('${T[OFF]}', '${OFF}', 't@off.example', 'teacher', 'Teacher O');
      insert into classes (class_id, school_id, name, class_teacher_id) values
        ('${C[A]}', '${A}', '5-A', '${T[A]}'), ('${C[B]}', '${B}', '5-A', '${T[B]}'), ('${C[TEST]}', '${TEST}', '5-A', '${T[TEST]}'), ('${C[OFF]}', '${OFF}', '5-A', '${T[OFF]}');
      insert into subjects (subject_id, school_id, name) values
        ('${SUB.art}', '${A}', 'Art'), ('${SUB.hindi}', '${A}', 'Hindi'), ('${SUB.maths}', '${A}', 'Maths'), ('${SUB.music}', '${A}', 'Music'), ('${SUB.science}', '${A}', 'Science'), ('${SUB.english}', '${A}', 'English'),
        ('${SUB.bMaths}', '${B}', 'Maths'), ('${SUB.tMaths}', '${TEST}', 'Maths'), ('${SUB.offMaths}', '${OFF}', 'Maths');
      insert into students (student_id, school_id, admission_no, name, status, class_id) values
        ('${RAHUL}', '${A}', 'A-1', 'Rahul Sharma', 'active', '${C[A]}'), ('${PRIYA}', '${A}', 'A-2', 'Priya Verma', 'active', '${C[A]}'), ('${KABIR}', '${A}', 'A-3', 'Kabir Khan', 'active', '${C[A]}'),
        ('${MEERA}', '${A}', 'A-4', 'Meera Iyer', 'active', '${C[A]}'), ('${DEV}', '${B}', 'B-1', 'Dev Patel', 'active', '${C[B]}'), ('${ESHA}', '${TEST}', 'T-1', 'Esha Rao', 'active', '${C[TEST]}'),
        ('${OMAR}', '${OFF}', 'O-1', 'Omar Ali', 'active', '${C[OFF]}');
      insert into parents (parent_id, school_id, name, phone) values
        ('${G1}', '${A}', 'Guardian One', '+919100000001'), ('${G2}', '${A}', 'Guardian Two', '+919100000002'), ('${G3}', '${A}', 'Guardian Three', '09100000001'),
        ('${G4}', '${A}', 'Guardian Four', '+919100000004'), ('${G5}', '${A}', 'Guardian Five', '+919100000005'), ('${G6}', '${A}', 'Guardian Six', '+919100000006'),
        ('${GB}', '${B}', 'Guardian B', '+91 91000 00001'), ('${GT}', '${TEST}', 'Guardian T', '+919100000008'), ('${GO}', '${OFF}', 'Guardian O', '+919100000009');
      update parents set preferred_language = 'hi' where parent_id = '${G4}';
      insert into parent_student_map (school_id, parent_id, student_id) values
        ('${A}', '${G1}', '${RAHUL}'), ('${A}', '${G2}', '${RAHUL}'), ('${A}', '${G3}', '${RAHUL}'), ('${A}', '${G4}', '${PRIYA}'), ('${A}', '${G5}', '${KABIR}'), ('${A}', '${G6}', '${MEERA}'),
        ('${B}', '${GB}', '${DEV}'), ('${TEST}', '${GT}', '${ESHA}'), ('${OFF}', '${GO}', '${OMAR}');
      insert into whatsapp_opt_outs (school_id, phone, stopped_at) values ('${A}', '+919100000002', now() - interval '3 days');
      insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'homework', true, 'plan'), ('${B}', 'homework', true, 'plan'), ('${TEST}', 'homework', true, 'plan'), ('${OFF}', 'homework', false, 'plan')
        on conflict (school_id, module_id) do update set enabled = excluded.enabled;
    `);
    await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status) values (null, $1, $2, 'en', $3, $4, 'utility', $5, 'approved')`, [d.name, d.version, d.body.en, [...d.variables], d.staleAfterMinutes]);
    // Consent for the purpose, for every child but Kabir.
    for (const [school, student] of [[A, RAHUL], [A, PRIYA], [A, MEERA], [B, DEV], [TEST, ESHA], [OFF, OMAR]]) await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1'`, [school, student]);
    // School A, due on the school day before: Rahul did not do Maths or Hindi, did English, and nobody marked his Science.
    await homework(A, SUB.maths, PREV, { [RAHUL]: false, [PRIYA]: false, [KABIR]: false, [MEERA]: true });
    await homework(A, SUB.hindi, PREV, { [RAHUL]: false, [PRIYA]: false, [MEERA]: true });
    await homework(A, SUB.english, PREV, { [RAHUL]: true, [MEERA]: true });
    await homework(A, SUB.science, PREV, { [RAHUL]: null, [PRIYA]: false });
    await homework(A, SUB.art, PREV, { [PRIYA]: false });
    await homework(A, SUB.music, PREV, { [PRIYA]: false });
    // Not done, but due two days before: not this morning's.
    await homework(A, SUB.art, EARLIER, { [RAHUL]: false });
    await homework(B, SUB.bMaths, PREV, { [DEV]: false });
    await homework(TEST, SUB.tMaths, PREV, { [ESHA]: false });
    await homework(OFF, SUB.offMaths, PREV, { [OMAR]: false });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('each morning: one message per child and guardian for homework due the school day before and marked not done, through the gate, which decides', async () => {
    await run();
    const rows = await log();
    const key = (student: string, parent: string) => `homework_follow_up:${student}:${parent}:${PREV}`;
    expect(rows).toEqual([
      // School A. Rahul: Hindi and Maths (English was done, Science unmarked, Art due earlier); once to G1's number,
      // although two guardian rows hold it; G2 said STOP and is held. Priya: five subjects, three by name. Kabir: no consent.
      { school_id: A, student_id: RAHUL, parent_id: G1, to_phone: '+919100000001', status: 'queued', reason: null, purpose: 'operational_communication', language: 'en', p: { child: 'Rahul', subjects: 'Hindi and Maths', date: '21-11-2026' }, dedupe_key: key(RAHUL, G1) },
      { school_id: A, student_id: RAHUL, parent_id: G2, to_phone: '+919100000002', status: 'blocked_consent', reason: 'this number asked to stop WhatsApp messages from the school', purpose: 'operational_communication', language: null, p: null, dedupe_key: key(RAHUL, G2) },
      { school_id: A, student_id: PRIYA, parent_id: G4, to_phone: '+919100000004', status: 'queued', reason: null, purpose: 'operational_communication', language: 'en', p: { child: 'Priya', subjects: 'Art, Hindi, Maths and 2 more', date: '21-11-2026' }, dedupe_key: key(PRIYA, G4) },
      { school_id: A, student_id: KABIR, parent_id: G5, to_phone: '+919100000005', status: 'blocked_consent', reason: 'consent for purpose "operational_communication" is not currently granted', purpose: 'operational_communication', language: null, p: null, dedupe_key: key(KABIR, G5) },
      // School B: its own child, to its own guardian, though the number is G1's too.
      { school_id: B, student_id: DEV, parent_id: GB, to_phone: '+919100000001', status: 'queued', reason: null, purpose: 'operational_communication', language: 'en', p: { child: 'Dev', subjects: 'Maths', date: '21-11-2026' }, dedupe_key: key(DEV, GB) },
      // The test school: as the gate does for any message of a test school (the stand-in only, when it is sent).
      { school_id: TEST, student_id: ESHA, parent_id: GT, to_phone: '+919100000008', status: 'queued', reason: null, purpose: 'operational_communication', language: 'en', p: { child: 'Esha', subjects: 'Maths', date: '21-11-2026' }, dedupe_key: key(ESHA, GT) },
    ]);
    // Nothing for Meera (all done), nothing for the school with Homework off, nothing for another school's guardian.
    expect(rows.some((r: { student_id: string }) => r.student_id === MEERA || r.student_id === OMAR)).toBe(false);
    for (const r of rows) expect((await db.pg.query(`select school_id from parents where parent_id = $1`, [r.parent_id])).rows[0].school_id).toBe(r.school_id);
    // No surname anywhere in what is sent.
    expect(JSON.stringify(rows)).not.toMatch(/Sharma|Verma|Khan|Patel|Rao/);
  });

  it('a second run, or a retry, sends nothing twice', async () => {
    const before = await log();
    const jobs = (await db.pg.query(`select count(*)::int as n from jobs where type = 'whatsapp.send'`)).rows[0].n;
    await run();
    expect(await log()).toEqual(before);
    expect((await db.pg.query(`select count(*)::int as n from jobs where type = 'whatsapp.send'`)).rows[0].n).toBe(jobs);
  });

  it('a school in pilot without sending approved: held by the gate, and nothing goes', async () => {
    await db.pg.query(`update schools set is_pilot = true, pilot_allow_outbound = false where school_id = $1`, [B]);
    await homework(B, SUB.bMaths, '2026-11-23', { [DEV]: false });
    expect(await platform((c) => homeworkFollowUpForSchool(c, queue, B, '2026-11-24'))).toEqual({ day: '2026-11-23', children: 1, queued: 0, held: 1, withoutNumber: 0 });
    expect((await log()).filter((r: { dedupe_key: string }) => r.dedupe_key.endsWith(':2026-11-23')).map((r: { status: string }) => r.status)).toEqual(['blocked_pilot']);
  });

  it('Hindi once its wording is reviewed (C190), the subjects joined in Hindi; English until then', async () => {
    const d = TEMPLATE_REGISTRY.find((t) => t.name === 'homework_follow_up')!;
    await db.pg.query(
      `insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status, wording_reviewed, wording_reviewed_by, wording_reviewed_at, wording_reviewed_note)
       values (null, $1, $2, 'hi', $3, $4, 'utility', $5, 'approved', true, $6, now(), 'Read by a reader of Hindi')`,
      [d.name, d.version, d.body.hi, [...d.variables], d.staleAfterMinutes, T[A]]
    );
    await homework(A, SUB.maths, '2026-11-23', { [PRIYA]: false });
    await homework(A, SUB.hindi, '2026-11-23', { [PRIYA]: false });
    await platform((c) => homeworkFollowUpForSchool(c, queue, A, '2026-11-24'));
    const priya = (await log()).find((r: { dedupe_key: string }) => r.dedupe_key === `homework_follow_up:${PRIYA}:${G4}:2026-11-23`);
    expect(priya).toMatchObject({ status: 'queued', language: 'hi', p: { child: 'Priya', subjects: 'Hindi और Maths', date: '23-11-2026' } });
  });

  it('a bad date is refused; a day still to come is not run', async () => {
    await expect(homeworkFollowUpHandler({ platform, queue, now: () => new Date(`${TODAY}T02:15:00Z`) })({ ...job(), payload: { date: 'soon' } })).rejects.toThrow(/bad date/);
    await expect(homeworkFollowUpHandler({ platform, queue, now: () => new Date(`${TODAY}T02:15:00Z`) })(job('2026-11-25'))).rejects.toThrow(/not begun/);
  });

  it('the database queues the morning job only once the deployed runner can run it, once a day', async () => {
    await db.pg.query(`update platform_settings set value = '[]'::jsonb where key = 'jobs.handlers'`);
    await db.pg.query(`select public.homework_follow_up_enqueue()`);
    expect((await db.pg.query(`select count(*)::int as n from jobs where type = $1`, [HOMEWORK_FOLLOW_UP_JOB])).rows[0].n).toBe(0);
    await db.pg.query(`update platform_settings set value = $1::jsonb where key = 'jobs.handlers'`, [JSON.stringify([HOMEWORK_FOLLOW_UP_JOB])]);
    await db.pg.query(`select public.homework_follow_up_enqueue()`);
    await db.pg.query(`select public.homework_follow_up_enqueue()`);
    expect((await db.pg.query(`select count(*)::int as n from jobs where type = $1`, [HOMEWORK_FOLLOW_UP_JOB])).rows[0].n).toBe(1);
    // No role of the app may call it; the scheduler runs it as its owner.
    for (const role of ['app_user', 'nca_super']) expect((await db.pg.query(`select has_function_privilege($1, 'public.homework_follow_up_enqueue()', 'EXECUTE') as may`, [role])).rows[0].may).toBe(false);
  });
});
