import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { NO_PERSON, schoolJobContextStatements, type SchoolJob } from '@/lib/auth/db';
import { lastCheck, listFlags, runCheck } from '@/lib/early-warning/early-warning';
import { NIGHTLY_CHECK_JOB } from '@/lib/early-warning/rules';
import { earlyWarningNightlyHandler, type CheckOutcome } from '@/lib/jobs/school-checks';
import type { AsSchool } from '@/lib/jobs/school-context';
import { PermanentJobError, type ClaimedJob } from '@/lib/jobs/types';
import { indiaDate } from '@/lib/time/india';

// Early Warning each night (C210). The acceptance test, its Early Warning half: "Each night the Early Warning check
// runs for every school with the module on, as the office would see it, and opens or closes flags marked as the
// nightly check's." Proven on the whole schema: the nightly job runs in the session the job runner opens (the very
// statements of src/lib/auth/db.ts, as the app's database role), and what it does is compared with a principal's own
// "Check now" on the same rows. Every name is made up.

const u = (n: number) => `e8000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, ADMIN, TARA, ACCOUNTANT, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(21)];
const [C5A, CB] = [u(51), u(52)];
// School A: Asha is away on 3 of 10 days (a reason), Bela is in school every day (none), Chirag is away on 4 of 10.
// School B: Zoya is away every day and has an open flag of B's own.
const [ASHA, BELA, CHIRAG, ZOYA] = [u(101), u(102), u(103), u(201)];

const TODAY = indiaDate();
const NOON = new Date(`${TODAY}T12:00:00+05:30`);
const at = (minutes: number) => new Date(NOON.getTime() + minutes * 60_000);
const day = (back: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string; job?: string };
// A person's own session, as withTenantContext sets it (and, for the tests of the rules, with a job's name added).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user], ['app.current_job', who.job ?? '']]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// The job's own session: the statements the job runner's helper runs (withSchoolJobContext), here on the test
// database.
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
const actor = (who: Who) => ({ schoolId: who.school ?? A, userId: who.user, role: who.role as never });

const job = (schoolId: string | null, payload: Record<string, unknown> = { date: TODAY }): ClaimedJob => ({ jobId: u(900), type: NIGHTLY_CHECK_JOB, payload, attempts: 1, maxAttempts: 5, schoolId, idempotencyKey: `${NIGHTLY_CHECK_JOB}:${schoolId}:${TODAY}` });
const outcomes: CheckOutcome[] = [];
const nightly = (minutes: number) => earlyWarningNightlyHandler({ asSchool, now: () => at(minutes), onDone: (_s, o) => outcomes.push(o) });
const runNightly = (schoolId: string, minutes: number) => nightly(minutes)(job(schoolId));

type Row = { name: string; reasons: string[]; evidence: unknown; class_id: string; opened_by: string | null; opened_by_job: string | null; closed: boolean; closed_reason: string | null; closed_by: string | null; closed_by_job: string | null; detected_at: Date };
// The rows as they are, read by the owner of the database (no role, no policy).
const stored = async (school = A): Promise<Row[]> =>
  (await db.pg.query(
    `select s.name, f.reasons, f.evidence, f.class_id, f.opened_by, f.opened_by_job, f.resolved_at is not null as closed, f.closed_reason, f.closed_by, f.closed_by_job, f.detected_at
       from early_warning_flags f join students s on s.student_id = f.student_id where f.school_id = $1 order by s.name, f.detected_at`,
    [school]
  )).rows;
const what = (rows: Row[]) => rows.map((r) => ({ name: r.name, reasons: r.reasons, evidence: r.evidence, class_id: r.class_id, closed: r.closed }));
const audits = async (school = A) => (await db.pg.query(`select actor_user_id, actor_role, after_state from audit_log where school_id = $1 and event_action = 'early_warning.checked' order by occurred_at`, [school])).rows;
const marks = (student: string, cls: string, school: string, days: string) =>
  [...days].map((m, i) => `('${school}', '${student}', '${cls}', '${day(1 + i)}', '${m === 'P' ? 'present' : 'absent'}', '${school === A ? TARA : B_PRINCIPAL}')`);
const clearA = () =>
  db.pg.exec(`set session_replication_role = replica;
    delete from early_warning_actions where school_id = '${A}'; delete from early_warning_flags where school_id = '${A}';
    delete from audit_log where school_id = '${A}' and event_action like 'early_warning.%';
    delete from attendance where school_id = '${A}';
    insert into attendance (school_id, student_id, class_id, date, status, marked_by) values ${[...marks(ASHA, C5A, A, 'AAAPPPPPPP'), ...marks(BELA, C5A, A, 'PPPPPPPPPP'), ...marks(CHIRAG, C5A, A, 'AAAAPPPPPP')].join(', ')};
    update school_entitlements set access_mode = 'full', grace_ends_at = null where school_id = '${A}';
    update school_module_entitlements set enabled = true where school_id = '${A}' and module_id = 'early-warning';
    set session_replication_role = origin;`);
// School B as it stands: what the nightly job for A must never change.
const schoolB = async () => ({
  flags: await stored(B),
  audit: (await db.pg.query(`select count(*)::int as n from audit_log where school_id = $1`, [B])).rows[0].n,
});

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    set session_replication_role = replica;
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal@a.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'admin@a.example', 'school_admin', 'Asif Admin', true),
      ('${TARA}', '${A}', 'tara@a.example', 'teacher', 'Tara Teacher', true), ('${ACCOUNTANT}', '${A}', 'accounts@a.example', 'accountant', 'Anil Accountant', true),
      ('${B_PRINCIPAL}', '${B}', 'principal@b.example', 'principal', 'Bela Principal', true);
    insert into school_entitlements (school_id, plan, access_mode) values ('${A}', 'standard', 'full'), ('${B}', 'standard', 'full') on conflict (school_id) do nothing;
    insert into school_module_entitlements (school_id, module_id, enabled, source) values
      ('${A}', 'early-warning', true, 'plan'), ('${A}', 'recovery', true, 'plan'), ('${A}', 'setup', true, 'plan'), ('${B}', 'early-warning', true, 'plan'), ('${B}', 'recovery', true, 'plan')
      on conflict (school_id, module_id) do update set enabled = excluded.enabled;
    insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5A}', '${A}', '5-A', '${TARA}'), ('${CB}', '${B}', '5-A', '${B_PRINCIPAL}');
    insert into students (student_id, school_id, admission_no, name, status, class_id) values
      ('${ASHA}', '${A}', 'A-1', 'Asha', 'active', '${C5A}'), ('${BELA}', '${A}', 'A-2', 'Bela', 'active', '${C5A}'), ('${CHIRAG}', '${A}', 'A-3', 'Chirag', 'active', '${C5A}'),
      ('${ZOYA}', '${B}', 'B-1', 'Zoya', 'active', '${CB}');
    insert into attendance (school_id, student_id, class_id, date, status, marked_by) values ${marks(ZOYA, CB, B, 'AAAAAAAAAA').join(', ')};
    insert into early_warning_flags (school_id, student_id, class_id, reasons, evidence, rule_version, opened_by, detected_at, checked_at)
      values ('${B}', '${ZOYA}', '${CB}', '{needs_help}', '{"needs_help": {"open": []}}', 1, '${B_PRINCIPAL}', now() - interval '3 days', now() - interval '3 days');
    set session_replication_role = origin;
  `);
  await clearA();
}, 120_000);
afterAll(async () => db?.stop());

describe('the nightly check is "Check now", run as the office sees it', () => {
  it('opens exactly the flags a principal’s "Check now" opens, with the same reasons and evidence, marked as the nightly check’s', async () => {
    // The principal's own check on these rows, kept for comparison and then taken away again.
    const byHand = await as(principal, (c) => runCheck(c, actor(principal), at(0)));
    expect(byHand).toMatchObject({ ok: true, students: 3, opened: 2, closed: 0, open: 2 });
    const theirs = await stored();
    expect(theirs.map((f) => [f.name, f.reasons, f.opened_by])).toEqual([['Asha', ['attendance'], PRINCIPAL], ['Chirag', ['attendance'], PRINCIPAL]]);
    const theirAudit = (await audits())[0].after_state;
    await clearA();

    const before = await schoolB();
    outcomes.length = 0;
    await runNightly(A, 0);
    expect(outcomes).toEqual(['done']);
    const ours = await stored();
    // Exactly as "Check now" would: the same children, reasons, evidence and classes.
    expect(what(ours)).toEqual(what(theirs));
    // Marked as the nightly check's, with no person.
    for (const f of ours) expect(f, f.name).toMatchObject({ opened_by: null, opened_by_job: NIGHTLY_CHECK_JOB, closed: false, closed_by: null, closed_by_job: null });
    // The check is on the record as the nightly check's, by nobody, with the same numbers as the principal's.
    const [audit] = await audits();
    expect(audit).toMatchObject({ actor_user_id: null, actor_role: null, after_state: { by: NIGHTLY_CHECK_JOB, date: TODAY } });
    for (const k of ['students', 'attendanceUsed', 'opened', 'changed', 'kept', 'closed', 'open', 'settings', 'ruleVersion']) expect(audit.after_state[k], k).toEqual(theirAudit[k]);
    // School B: not one row changed, and nothing written on its record.
    expect(await schoolB()).toEqual(before);
  });

  it('the screen says so: the flags were opened by the nightly check, and the last check was the nightly one', async () => {
    const screen = await as(principal, (c) => listFlags(c, actor(principal), at(5)));
    expect(screen.open.map((f) => [f.student_name, f.opened_by, f.opened_by_nightly])).toEqual([['Asha', null, true], ['Chirag', null, true]]);
    const last = await as(principal, (c) => lastCheck(c, A));
    expect(last).toMatchObject({ by: null, nightly: true, students: 3, opened: 2, open: 2 });
  });

  it('reads school A only: in the job’s own session another school’s rows are not there to read', async () => {
    const seen = await asSchool(A, NIGHTLY_CHECK_JOB, async (c) => ({
      flags: (await c.query(`select count(*)::int as n from early_warning_flags where school_id = $1`, [B])).rows[0].n,
      students: (await c.query(`select count(*)::int as n from students where school_id = $1`, [B])).rows[0].n,
      attendance: (await c.query(`select count(*)::int as n from attendance where school_id = $1`, [B])).rows[0].n,
      own: (await c.query(`select count(*)::int as n from students where school_id = $1`, [A])).rows[0].n,
      // The session is the principal's, with no person.
      who: (await c.query(`select current_user as role, current_setting('app.current_role', true) as app_role, current_setting('app.current_user_id', true) as person, current_setting('app.current_job', true) as job`)).rows[0],
    }));
    expect(seen).toEqual({ flags: 0, students: 0, attendance: 0, own: 3, who: { role: 'app_user', app_role: 'principal', person: NO_PERSON, job: NIGHTLY_CHECK_JOB } });
  });

  it('a second run the same night changes nothing; when a reason clears, the nightly check closes the flag in its own name', async () => {
    const first = await stored();
    await runNightly(A, 10);
    expect(what(await stored())).toEqual(what(first));
    expect((await audits()).at(-1).after_state).toMatchObject({ opened: 0, changed: 0, kept: 2, closed: 0, open: 2, by: NIGHTLY_CHECK_JOB });

    // Asha's absences turn out to have been marked wrongly: she was in school every day.
    await db.pg.exec(`update attendance set status = 'present' where school_id = '${A}' and student_id = '${ASHA}'`);
    const before = await schoolB();
    await runNightly(A, 20);
    const rows = await stored();
    expect(rows.find((f) => f.name === 'Asha')).toMatchObject({ closed: true, closed_reason: 'signals_cleared', closed_by: null, closed_by_job: NIGHTLY_CHECK_JOB, opened_by_job: NIGHTLY_CHECK_JOB });
    expect(rows.find((f) => f.name === 'Chirag')).toMatchObject({ closed: false, closed_by: null, closed_by_job: null });
    const screen = await as(principal, (c) => listFlags(c, actor(principal), at(25)));
    expect(screen.closed.map((f) => [f.student_name, f.closed_by_nightly, f.closed_reason])).toEqual([['Asha', true, 'signals_cleared']]);
    expect(await schoolB()).toEqual(before);

    // A person's "Check now" afterwards works on the nightly check's flags as on any other: Chirag's stays open,
    // brought up to date in the person's session, and still says the nightly check opened it.
    expect(await as(principal, (c) => runCheck(c, actor(principal), at(30)))).toMatchObject({ ok: true, opened: 0, closed: 0, open: 1 });
    expect((await stored()).find((f) => f.name === 'Chirag')).toMatchObject({ opened_by: null, opened_by_job: NIGHTLY_CHECK_JOB, closed: false });
  });

  it('a school that switched the module off, or became read-only, after the job was queued is left as it is', async () => {
    await clearA();
    outcomes.length = 0;
    await db.pg.exec(`update school_module_entitlements set enabled = false where school_id = '${A}' and module_id = 'early-warning'`);
    await runNightly(A, 0);
    await db.pg.exec(`update school_module_entitlements set enabled = true where school_id = '${A}' and module_id = 'early-warning'; update school_entitlements set access_mode = 'read_only' where school_id = '${A}'`);
    await runNightly(A, 0);
    // A grace period that has ended is read-only, as loadEntitlements reads it.
    await db.pg.exec(`update school_entitlements set access_mode = 'grace', grace_ends_at = now() - interval '1 minute' where school_id = '${A}'`);
    await runNightly(A, 0);
    expect(outcomes).toEqual(['off', 'off', 'off']);
    expect(await stored()).toEqual([]);
    expect(await audits()).toEqual([]);
    // In grace that has not ended, the school is checked.
    await db.pg.exec(`update school_entitlements set grace_ends_at = now() + interval '3 days' where school_id = '${A}'`);
    await runNightly(A, 0);
    expect(outcomes.at(-1)).toBe('done');
    expect((await stored()).length).toBe(2);
    await clearA();
  });

  it('a job with no school, or a bad day, gives up at once; a day that has not begun in India is tried again later', async () => {
    await expect(nightly(0)(job(null))).rejects.toBeInstanceOf(PermanentJobError);
    await expect(nightly(0)(job(A, { date: 'yesterday' }))).rejects.toBeInstanceOf(PermanentJobError);
    const tomorrow = new Date(Date.parse(`${TODAY}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const later = nightly(0)(job(A, { date: tomorrow }));
    await expect(later).rejects.toThrow(/has not begun/);
    await expect(later).rejects.not.toBeInstanceOf(PermanentJobError);
    // The helper takes a real school id and one of the two jobs only.
    expect(() => schoolJobContextStatements('not-a-school', NIGHTLY_CHECK_JOB)).toThrow();
    expect(() => schoolJobContextStatements(NO_PERSON, NIGHTLY_CHECK_JOB)).toThrow();
    expect(() => schoolJobContextStatements(A, 'fees.nightly' as SchoolJob)).toThrow();
    expect(await stored()).toEqual([]);
  });
});

describe('a flag with no person is written only by the nightly check, in its own transaction (the database’s rule)', () => {
  const PUT = (by: string | null, byJob: string | null) => [
    `insert into early_warning_flags (school_id, student_id, class_id, reasons, evidence, rule_version, opened_by, opened_by_job) values ($1, $2, $3, '{needs_help}', '{"needs_help": {"open": []}}', 1, $4, $5) returning flag_id`,
    [A, BELA, C5A, by, byJob],
  ] as const;
  const refused = /row-level security|violates|permission denied/;
  // One statement and its values, as a client's query takes them.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = (c: any, [sql, params]: readonly [string, readonly unknown[]]) => c.query(sql, [...params]);

  it('the app’s role with no job setting cannot open a flag with no person, nor with another job’s name, nor as a teacher', async () => {
    await clearA();
    await expect(as(principal, (c) => q(c, PUT(null, NIGHTLY_CHECK_JOB)))).rejects.toThrow(refused);
    await expect(as({ ...principal, job: 'auditor.weekly' }, (c) => q(c, PUT(null, NIGHTLY_CHECK_JOB)))).rejects.toThrow(refused);
    await expect(as({ role: 'teacher', user: TARA, job: NIGHTLY_CHECK_JOB }, (c) => q(c, PUT(null, NIGHTLY_CHECK_JOB)))).rejects.toThrow(refused);
    await expect(as({ role: 'accountant', user: ACCOUNTANT, job: NIGHTLY_CHECK_JOB }, (c) => q(c, PUT(null, NIGHTLY_CHECK_JOB)))).rejects.toThrow(refused);
    // With no person and no job: the database's own check.
    await expect(as({ ...principal, job: NIGHTLY_CHECK_JOB }, (c) => q(c, PUT(null, null)))).rejects.toThrow(refused);
    // The job's own session cannot put a flag in a person's name, nor in both.
    await expect(asSchool(A, NIGHTLY_CHECK_JOB, (c) => q(c, PUT(PRINCIPAL, null)))).rejects.toThrow(refused);
    await expect(asSchool(A, NIGHTLY_CHECK_JOB, (c) => q(c, PUT(PRINCIPAL, NIGHTLY_CHECK_JOB)))).rejects.toThrow(refused);
    // Nor under a name that is not the nightly check's, though it sets it for itself.
    await expect(asSchool(A, 'auditor.weekly', (c) => q(c, PUT(null, NIGHTLY_CHECK_JOB)))).rejects.toThrow(refused);
    expect(await stored()).toEqual([]);
    // The job's own session can.
    await asSchool(A, NIGHTLY_CHECK_JOB, (c) => q(c, PUT(null, NIGHTLY_CHECK_JOB)));
    expect((await stored()).map((f) => [f.name, f.opened_by, f.opened_by_job])).toEqual([['Bela', null, NIGHTLY_CHECK_JOB]]);
  });

  it('closing in the nightly check’s name is the nightly check’s alone; it writes no step, and who opened a flag never changes', async () => {
    const flagId = (await db.pg.query(`select flag_id from early_warning_flags where school_id = $1 and resolved_at is null`, [A])).rows[0].flag_id;
    const CLOSE = (by: string | null, byJob: string | null) => [`update early_warning_flags set resolved_at = now(), closed_reason = 'signals_cleared', closed_by = $2, closed_by_job = $3 where flag_id = $1`, [flagId, by, byJob]] as const;
    await expect(as(principal, (c) => q(c, CLOSE(null, NIGHTLY_CHECK_JOB)))).rejects.toThrow(refused);
    await expect(asSchool(A, NIGHTLY_CHECK_JOB, (c) => q(c, CLOSE(PRINCIPAL, null)))).rejects.toThrow(refused);
    await expect(as(principal, (c) => q(c, CLOSE(PRINCIPAL, NIGHTLY_CHECK_JOB)))).rejects.toThrow(refused);
    // A person may not take a flag the nightly check opened into their own name.
    await expect(as(principal, (c) => c.query(`update early_warning_flags set opened_by = $2, opened_by_job = null where flag_id = $1`, [flagId, PRINCIPAL]))).rejects.toThrow(/never changed|violates/);
    // What a person did about a flag is a person's: the job's session adds no step.
    await expect(asSchool(A, NIGHTLY_CHECK_JOB, (c) => c.query(`insert into early_warning_actions (school_id, flag_id, kind, by_user) values ($1, $2, 'extra_help', $3)`, [A, flagId, NO_PERSON]))).rejects.toThrow(refused);
    expect((await stored()).map((f) => f.closed)).toEqual([false]);
    // The principal closes it in their own name, and the nightly check in its own.
    await as(principal, (c) => q(c, CLOSE(PRINCIPAL, null)));
    expect((await stored())[0]).toMatchObject({ closed: true, closed_by: PRINCIPAL, closed_by_job: null });
    await clearA();
  });

  it('the platform role holds no right on the flags', async () => {
    await expect(platform((c) => c.query(`select count(*) from early_warning_flags`))).rejects.toThrow(/permission denied/);
    await expect(platform((c) => c.query(`update early_warning_flags set closed_by_job = 'early_warning.nightly'`))).rejects.toThrow(/permission denied/);
  });

  it('rows already there stay as they were: every flag before this slice has its person', async () => {
    expect((await db.pg.query(`select count(*)::int as n from early_warning_flags where opened_by is null and opened_by_job is null`)).rows[0].n).toBe(0);
    expect((await stored(B)).map((f) => [f.opened_by, f.opened_by_job])).toEqual([[B_PRINCIPAL, null]]);
  });
});
