import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { NO_PERSON, schoolJobContextStatements, type SchoolJob } from '@/lib/auth/db';
import { WEEKLY_CHECK_UP_JOB, latestCheckUp, recordCheckUp, runCheckUp, summarise, weekStart } from '@/lib/auditor';
import type { SchoolEntitlements } from '@/lib/contracts/entitlements';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { auditorWeeklyHandler, type CheckOutcome } from '@/lib/jobs/school-checks';
import type { AsSchool } from '@/lib/jobs/school-context';
import type { ClaimedJob } from '@/lib/jobs/types';
import { indiaDate } from '@/lib/time/india';
import { loadMyDay, providersFor, TODAY_PROVIDERS } from '@/lib/today/cards';

// The School Health Auditor each week (C210). The acceptance test, its auditor half: "each week the School Health
// Auditor records the school's check-up the same way [as the office would see it]; the principal and school admin
// see this week's check-up on My Day." Proven on the whole schema: the weekly job runs in the session the job runner
// opens (the very statements of src/lib/auth/db.ts, as the app's database role), its check-up is compared with a
// principal's own, and My Day is read as each role. Every name is made up.

const u = (n: number) => `a9000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, ADMIN, TARA, ACCOUNTANT, COORDINATOR, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15), u(21)];
const [C5A, C6B, CB] = [u(51), u(52), u(53)];
const [ASHA, BELA, JAYA, ZOYA] = [u(101), u(102), u(103), u(201)];
const G_ASHA = u(301);

const TODAY = indiaDate();
const day = (back: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string; job?: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user], ['app.current_job', who.job ?? '']]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// The job's own session, with the statements of withSchoolJobContext.
const asSchool: AsSchool = (schoolId: string, job: SchoolJob, fn) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    for (const s of schoolJobContextStatements(schoolId, job)) await tx.query(s.sql, s.params);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const auditor = (who: Who) => ({ schoolId: who.school ?? A, userId: who.user, role: who.role as never });

const outcomes: CheckOutcome[] = [];
const weekly = auditorWeeklyHandler({ asSchool, onDone: (_s, o) => outcomes.push(o) });
const job = (schoolId: string): ClaimedJob => ({ jobId: u(900), type: WEEKLY_CHECK_UP_JOB, payload: { week: weekStart(TODAY) }, attempts: 1, maxAttempts: 5, schoolId, idempotencyKey: `${WEEKLY_CHECK_UP_JOB}:${schoolId}:${weekStart(TODAY)}` });

type Run = { run_date: string; rule_version: number; results: { id: string; state: string; count: number | null }[]; passed: number; applicable: number; recorded_by: string | null; recorded_by_job: string | null; recorded_at: Date };
const runs = async (school = A): Promise<Run[]> =>
  (await db.pg.query(`select run_date::text as run_date, rule_version, results, passed, applicable, recorded_by, recorded_by_job, recorded_at from school_health_runs where school_id = $1 order by run_date`, [school])).rows;
const audits = async (school = A) => (await db.pg.query(`select actor_user_id, actor_role, after_state from audit_log where school_id = $1 and event_action = 'school_health.checked' order by occurred_at`, [school])).rows;
const clearRuns = (school = A) => db.pg.exec(`set session_replication_role = replica; delete from school_health_runs where school_id = '${school}'; delete from audit_log where school_id = '${school}' and event_action = 'school_health.checked'; set session_replication_role = origin;`);
// A day's row put in as it would have been written that day (the owner of the database, past the trigger).
const putRun = (school: string, date: string, results: { id: string; state: string; count: number | null; href: string | null }[], by: string | null, byJob: string | null = null) =>
  db.pg.query(
    `set session_replication_role = replica; insert into school_health_runs (school_id, run_date, rule_version, results, passed, applicable, recorded_by, recorded_by_job) values ($1, $2, 1, $3::jsonb, $4, $5, $6, $7); set session_replication_role = origin;`.split('; ')[1],
    [school, date, JSON.stringify(results), results.filter((r) => r.state === 'passes').length, results.filter((r) => r.state !== 'not_set_up').length, by, byJob]
  );
const putPast = async (school: string, date: string, results: Parameters<typeof putRun>[2], by: string | null, byJob: string | null = null) => {
  await db.pg.exec(`set session_replication_role = replica`);
  try {
    await putRun(school, date, results, by, byJob);
  } finally {
    await db.pg.exec(`set session_replication_role = origin`);
  }
};
const ALL_PASS = [{ id: 'class_teacher', state: 'passes', count: null, href: null }, { id: 'consent', state: 'passes', count: null, href: null }, { id: 'message_budget', state: 'not_set_up', count: null, href: '/app/communication' }];
const TWO_NEED = [{ id: 'class_teacher', state: 'needs_attention', count: 1, href: '/app/help/ticket/new' }, { id: 'consent', state: 'needs_attention', count: 2, href: '/app/students' }, { id: 'leave_waiting', state: 'passes', count: null, href: null }];

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    set session_replication_role = replica;
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal@a.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'admin@a.example', 'school_admin', 'Asif Admin', true),
      ('${TARA}', '${A}', 'tara@a.example', 'teacher', 'Tara Teacher', true), ('${ACCOUNTANT}', '${A}', 'accounts@a.example', 'accountant', 'Anil Accountant', true),
      ('${COORDINATOR}', '${A}', 'coordinator@a.example', 'academic_coordinator', 'Chitra Coordinator', true), ('${B_PRINCIPAL}', '${B}', 'principal@b.example', 'principal', 'Bela Principal', true);
    insert into school_module_entitlements (school_id, module_id, enabled, source)
      select s, m, true, 'plan' from unnest(array['${A}', '${B}']::uuid[]) s,
        unnest(array['students', 'parents', 'attendance', 'timetable', 'fees', 'communication', 'complaints', 'staff', 'school-auditor', 'setup']) m
      on conflict (school_id, module_id) do update set enabled = true;
    insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5A}', '${A}', '5-A', '${TARA}'), ('${C6B}', '${A}', '6-B', null), ('${CB}', '${B}', '5-A', null);
    insert into students (student_id, school_id, admission_no, name, status, class_id) values
      ('${ASHA}', '${A}', 'A-1', 'Asha', 'active', '${C5A}'), ('${BELA}', '${A}', 'A-2', 'Bela', 'active', '${C5A}'), ('${JAYA}', '${A}', 'A-3', 'Jaya', 'pending_consent', '${C6B}'),
      ('${ZOYA}', '${B}', 'B-1', 'Zoya', 'active', '${CB}');
    insert into parents (parent_id, school_id, name, phone) values ('${G_ASHA}', '${A}', 'Anita Sharma', '12345');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${G_ASHA}', '${ASHA}');
    -- A leave request that has waited five days: the check counts it, whoever reads.
    insert into staff_leave (school_id, user_id, from_date, to_date, kind, reason, asked_at, recorded_by) values ('${A}', '${TARA}', '${day(-3)}', '${day(-3)}', 'casual', 'A family wedding.', now() - interval '5 days', '${TARA}');
    set session_replication_role = origin;
  `);
}, 120_000);
afterAll(async () => db?.stop());

describe('the weekly check-up is the office’s check-up, kept as the day’s record', () => {
  it('records this week’s check-up with exactly what a principal’s own check-up finds, in the weekly check-up’s name', async () => {
    // The principal's own check-up on the same rows (not kept), for comparison.
    const ents = await as(principal, (c) => loadEntitlements(c, A));
    const theirs = await as(principal, (c) => runCheckUp(c, auditor(principal), ents, { today: TODAY }));
    // Several checks need attention here: 6-B has no class teacher, Bela has no guardian, Asha's guardian's number
    // cannot receive WhatsApp, Jaya waits for consent, and Tara's leave has waited five days.
    expect(theirs.results.filter((r) => r.state === 'needs_attention').map((r) => [r.id, r.count])).toEqual(
      expect.arrayContaining([['class_teacher', 1], ['student_guardian', 1], ['guardian_phone', 1], ['consent', 1], ['leave_waiting', 1]])
    );
    const before = { runs: await runs(B), audits: await audits(B) };

    outcomes.length = 0;
    await weekly(job(A));
    expect(outcomes).toEqual(['done']);
    const [kept] = await runs();
    expect(kept).toMatchObject({ run_date: TODAY, rule_version: 1, recorded_by: null, recorded_by_job: WEEKLY_CHECK_UP_JOB, passed: theirs.passed, applicable: theirs.applicable });
    // The same checks, states, counts and addresses: the job ran every one of them as the principal would. None was
    // left "could not be checked" for want of a person.
    expect(kept.results).toEqual(theirs.results.map((r) => ({ id: r.id, state: r.state, count: r.count, href: r.href, ...(r.off ? { off: true } : {}) })));
    expect(kept.results.some((r) => r.state === 'could_not_check')).toBe(false);
    // On the record as the weekly check-up's, by nobody.
    expect(await audits()).toEqual([{ actor_user_id: null, actor_role: null, after_state: { date: TODAY, ruleVersion: 1, passed: theirs.passed, applicable: theirs.applicable, by: WEEKLY_CHECK_UP_JOB } }]);
    // School B: nothing written, nothing changed.
    expect({ runs: await runs(B), audits: await audits(B) }).toEqual(before);
    // The screen says who recorded it.
    const latest = await as(principal, (c) => latestCheckUp(c, auditor(principal)));
    expect(latest).toMatchObject({ date: TODAY, recordedBy: null, byWeeklyCheckUp: true, passed: theirs.passed });
  });

  it('once a week: a second try finds this week’s check-up and leaves it as it is', async () => {
    const first = await runs();
    outcomes.length = 0;
    await weekly(job(A));
    expect(outcomes).toEqual(['already']);
    expect(await runs()).toEqual(first);
    expect((await audits()).length).toBe(1);
  });

  it('a person’s "Check again" the same day takes the day’s row over in their own name', async () => {
    const ents = await as(admin, (c) => loadEntitlements(c, A));
    await as(admin, async (c) => recordCheckUp(c, auditor(admin), await runCheckUp(c, auditor(admin), ents)));
    const [row] = await runs();
    expect(row).toMatchObject({ run_date: TODAY, recorded_by: ADMIN, recorded_by_job: null });
    expect(await as(principal, (c) => latestCheckUp(c, auditor(principal)))).toMatchObject({ recordedBy: 'Asif Admin' });
    expect((await as(principal, (c) => latestCheckUp(c, auditor(principal))))?.byWeeklyCheckUp).toBeUndefined();
    // And with a person's check-up already there today, the weekly job leaves it alone.
    outcomes.length = 0;
    await weekly(job(A));
    expect(outcomes).toEqual(['already']);
    expect((await runs())[0]).toMatchObject({ recorded_by: ADMIN, recorded_by_job: null });
  });

  it('a past day’s row never changes: the job adds this week’s and leaves last week’s as it was', async () => {
    await clearRuns();
    await putPast(A, day(8), TWO_NEED, PRINCIPAL);
    await putPast(A, day(15), ALL_PASS, null, WEEKLY_CHECK_UP_JOB);
    const past = await runs();
    outcomes.length = 0;
    await weekly(job(A));
    expect(outcomes).toEqual(['done']);
    const after = await runs();
    expect(after.slice(0, 2)).toEqual(past);
    expect(after.map((r) => [r.run_date, r.recorded_by_job])).toEqual([[day(15), WEEKLY_CHECK_UP_JOB], [day(8), null], [TODAY, WEEKLY_CHECK_UP_JOB]]);
    // Not even the job's own session may rewrite a past day, or today's.
    await expect(asSchool(A, WEEKLY_CHECK_UP_JOB, (c) => c.query(`update school_health_runs set passed = passed where school_id = $1 and run_date = $2`, [A, day(15)]))).rejects.toThrow(/past day|row-level security/);
    await expect(asSchool(A, WEEKLY_CHECK_UP_JOB, (c) => c.query(`update school_health_runs set passed = passed where school_id = $1 and run_date = $2`, [A, TODAY]))).rejects.toThrow(/row-level security/);
    expect(await runs()).toEqual(after);
  });

  it('a school whose auditor was switched off, or that became read-only, after the job was queued is left as it is', async () => {
    await clearRuns();
    outcomes.length = 0;
    await db.pg.exec(`update school_module_entitlements set enabled = false where school_id = '${A}' and module_id = 'school-auditor'`);
    await weekly(job(A));
    await db.pg.exec(`update school_module_entitlements set enabled = true where school_id = '${A}' and module_id = 'school-auditor'; insert into school_entitlements (school_id, plan, access_mode) values ('${A}', 'standard', 'read_only') on conflict (school_id) do update set access_mode = 'read_only'`);
    await weekly(job(A));
    await db.pg.exec(`update school_entitlements set access_mode = 'full' where school_id = '${A}'`);
    expect(outcomes).toEqual(['off', 'off']);
    expect(await runs()).toEqual([]);
  });
});

describe('a check-up with no person is written only by the weekly check-up, in its own transaction (the database’s rule)', () => {
  const PUT = (by: string | null, byJob: string | null) => [
    `insert into school_health_runs (school_id, run_date, rule_version, results, passed, applicable, recorded_by, recorded_by_job) values ($1, (now() at time zone 'Asia/Kolkata')::date, 1, '[]', 0, 0, $2, $3)`,
    [A, by, byJob],
  ] as const;
  const refused = /row-level security|violates|permission denied/;
  // One statement and its values, as a client's query takes them.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = (c: any, [sql, params]: readonly [string, readonly unknown[]]) => c.query(sql, [...params]);

  it('the app’s role with no job setting cannot record a check-up with no person, nor under another job, nor outside the office', async () => {
    await clearRuns();
    await expect(as(principal, (c) => q(c, PUT(null, WEEKLY_CHECK_UP_JOB)))).rejects.toThrow(refused);
    await expect(as({ ...principal, job: 'early_warning.nightly' }, (c) => q(c, PUT(null, WEEKLY_CHECK_UP_JOB)))).rejects.toThrow(refused);
    await expect(as({ role: 'accountant', user: ACCOUNTANT, job: WEEKLY_CHECK_UP_JOB }, (c) => q(c, PUT(null, WEEKLY_CHECK_UP_JOB)))).rejects.toThrow(refused);
    await expect(as({ role: 'academic_coordinator', user: COORDINATOR, job: WEEKLY_CHECK_UP_JOB }, (c) => q(c, PUT(null, WEEKLY_CHECK_UP_JOB)))).rejects.toThrow(refused);
    await expect(as({ ...principal, job: WEEKLY_CHECK_UP_JOB }, (c) => q(c, PUT(null, null)))).rejects.toThrow(refused);
    await expect(as(principal, (c) => q(c, PUT(PRINCIPAL, WEEKLY_CHECK_UP_JOB)))).rejects.toThrow(refused);
    // The job's own session cannot record in a person's name, nor under the nightly check's name.
    await expect(asSchool(A, WEEKLY_CHECK_UP_JOB, (c) => q(c, PUT(PRINCIPAL, null)))).rejects.toThrow(refused);
    await expect(asSchool(A, 'early_warning.nightly', (c) => q(c, PUT(null, WEEKLY_CHECK_UP_JOB)))).rejects.toThrow(refused);
    expect(await runs()).toEqual([]);
    // A person may not put their name to the weekly check-up's row, nor the weekly check-up's name to theirs.
    await asSchool(A, WEEKLY_CHECK_UP_JOB, (c) => q(c, PUT(null, WEEKLY_CHECK_UP_JOB)));
    await expect(as(principal, (c) => c.query(`update school_health_runs set recorded_by = $2 where school_id = $1`, [A, PRINCIPAL]))).rejects.toThrow(refused);
    expect((await runs()).map((r) => [r.recorded_by, r.recorded_by_job])).toEqual([[null, WEEKLY_CHECK_UP_JOB]]);
    await clearRuns();
  });

  it('the platform role holds no right on check-ups, and cannot queue a check-up job from a school', async () => {
    await expect(platform((c) => c.query(`select count(*) from school_health_runs`))).rejects.toThrow(/permission denied/);
    await expect(as(principal, (c) => c.query(`insert into jobs (type, payload, idempotency_key, school_id) values ('auditor.weekly', '{}', 'x-weekly', $1)`, [A]))).rejects.toThrow(refused);
  });
});

describe('My Day: the principal and the school admin see this week’s check-up', () => {
  const ENTS = async (): Promise<SchoolEntitlements> => as(principal, (c) => loadEntitlements(c, A));
  const mine = TODAY_PROVIDERS.filter((p) => p.type === 'checkup-attention' || p.type === 'checkup-not-run');
  const cards = async (who: Who) => {
    const ents = await ENTS();
    return (await as(who, (c) => loadMyDay(c, { schoolId: who.school ?? A, userId: who.user, role: who.role as never }, ents, { providers: mine }))).cards;
  };

  it('only the office has the cards, and only with the auditor on', async () => {
    const ents = await ENTS();
    for (const role of ['principal', 'school_admin'] as const) expect(providersFor(role, ents).map((p) => p.type), role).toEqual(expect.arrayContaining(['checkup-attention', 'checkup-not-run']));
    for (const role of ['teacher', 'accountant', 'academic_coordinator'] as const) expect(providersFor(role, ents).map((p) => p.type).filter((t) => t.startsWith('checkup')), role).toEqual([]);
    expect(providersFor('principal', { ...ents, modules: { ...ents.modules, 'school-auditor': { enabled: false, source: 'plan' } } }).map((p) => p.type).filter((t) => t.startsWith('checkup'))).toEqual([]);
  });

  it('no check-up this week (last week’s does not count): a prompt to run one, for the principal and the school admin', async () => {
    await clearRuns();
    await putPast(A, weekStart(TODAY) === TODAY ? day(1) : day(7 + ((Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${weekStart(TODAY)}T00:00:00Z`)) / 86_400_000)), TWO_NEED, PRINCIPAL);
    for (const who of [principal, admin]) expect(await cards(who), who.role).toEqual([{ id: 'checkup-not-run', type: 'checkup-not-run', moduleId: 'school-auditor', state: 'todo', count: 0, href: '/app/school-auditor' }]);
    // Asked about school A from school B's session, there is nothing to read and no card.
    const entsA = await ENTS();
    expect((await as({ role: 'principal', user: B_PRINCIPAL, school: B }, (c) => loadMyDay(c, { schoolId: A, userId: B_PRINCIPAL, role: 'principal' }, entsA, { providers: mine }))).cards).toEqual([]);
  });

  it('after the weekly check-up: the number of checks that need attention, as the check-up itself counts them', async () => {
    await weekly(job(A));
    const [, kept] = await runs();
    const attention = summarise(kept.results as never).attention;
    expect(attention).toBeGreaterThan(1);
    for (const who of [principal, admin]) expect(await cards(who), who.role).toEqual([{ id: 'checkup-attention', type: 'checkup-attention', moduleId: 'school-auditor', state: 'todo', count: attention, href: '/app/school-auditor' }]);
  });

  it('a check-up earlier this week counts; with none needing attention the card says the week’s result, as done', async () => {
    await clearRuns();
    await putPast(A, weekStart(TODAY), ALL_PASS, PRINCIPAL);
    expect(await cards(admin)).toEqual([{ id: 'checkup-attention', type: 'checkup-attention', moduleId: 'school-auditor', state: 'done', count: 2, total: 2, href: '/app/school-auditor' }]);
    // The latest of the week is the one shown.
    if (weekStart(TODAY) !== TODAY) {
      await putPast(A, TODAY, TWO_NEED, ADMIN);
      expect(await cards(principal)).toMatchObject([{ type: 'checkup-attention', state: 'todo', count: 2 }]);
    }
    await clearRuns();
  });

  it('a check that could not be run is never shown as a pass: with one, the week is not "done"', async () => {
    await clearRuns();
    await putPast(A, TODAY, [{ id: 'class_teacher', state: 'passes', count: null, href: null }, { id: 'consent', state: 'could_not_check', count: null, href: null }], PRINCIPAL);
    for (const who of [principal, admin]) expect(await cards(who), who.role).toEqual([]);
    // With one needing attention as well, the card counts the one that needs attention, as the page does.
    await clearRuns();
    await putPast(A, TODAY, [{ id: 'class_teacher', state: 'needs_attention', count: 1, href: '/app/help/ticket/new' }, { id: 'consent', state: 'could_not_check', count: null, href: null }], PRINCIPAL);
    expect(await cards(principal)).toMatchObject([{ type: 'checkup-attention', state: 'todo', count: 1 }]);
    await clearRuns();
  });

  it('a school whose records cannot be changed gets no prompt to run a check-up it could not keep', async () => {
    await clearRuns();
    for (const [mode, ends] of [['read_only', null], ['grace', `now() - interval '1 hour'`]] as const) {
      await db.pg.exec(`insert into school_entitlements (school_id, plan, access_mode, grace_ends_at) values ('${A}', 'standard', '${mode}', ${ends ?? 'null'})
        on conflict (school_id) do update set access_mode = excluded.access_mode, grace_ends_at = excluded.grace_ends_at`);
      for (const who of [principal, admin]) expect(await cards(who), `${mode} ${who.role}`).toEqual([]);
    }
    // In a grace period that has not ended, the school is in full use: the prompt is there.
    await db.pg.exec(`update school_entitlements set access_mode = 'grace', grace_ends_at = now() + interval '3 days' where school_id = '${A}'`);
    expect(await cards(admin)).toMatchObject([{ type: 'checkup-not-run', state: 'todo' }]);
    await db.pg.exec(`update school_entitlements set access_mode = 'full', grace_ends_at = null where school_id = '${A}'`);
    expect(await cards(principal)).toMatchObject([{ type: 'checkup-not-run', state: 'todo' }]);
  });
});
