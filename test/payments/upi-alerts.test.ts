import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { renderEmail } from '@/lib/email/templates';
import { feesNightlyHandler } from '@/lib/fees/nightly';
import { createPaymentLink } from '@/lib/fees/family';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { reportUtr, verifyReport, workingDaysBetween } from '@/lib/payments/upi';
import { DAILY_EMAIL_CAP, notifyNewReport, reopenReport, runUpiAlerts } from '@/lib/payments/upi-alerts';

// Telling the verifiers, the reminders, reopening a "not found" and the
// test-school guard (docs/24 §3.3 step 6, §3.5, C175).

describe('working days: India dates, Sundays left out', () => {
  it('counts every day after the first up to the last, except Sundays', () => {
    expect(workingDaysBetween('2099-07-10', '2099-07-10')).toBe(0); // the same Friday
    expect(workingDaysBetween('2099-07-10', '2099-07-11')).toBe(1); // Friday to Saturday
    expect(workingDaysBetween('2099-07-11', '2099-07-12')).toBe(0); // Saturday to Sunday
    expect(workingDaysBetween('2099-07-11', '2099-07-13')).toBe(1); // Saturday to Monday
    expect(workingDaysBetween('2099-07-10', '2099-07-13')).toBe(2); // Friday to Monday
    expect(workingDaysBetween('2099-07-13', '2099-07-20')).toBe(6); // a whole week
    expect(workingDaysBetween('2099-07-13', '2099-07-10')).toBe(0);
  });
});

describe('the email', () => {
  it('says how many and how much, and why it waits on a person; never a child, a parent or a UTR', () => {
    const data = { schoolName: 'A <b>School</b>', count: '3', amount: '6,901.50', url: 'https://example.invalid/app/fees' };
    const first = renderEmail('upi_waiting', { ...data, kind: 'new' });
    expect(first.subject).toBe('3 UPI payments to verify (₹6,901.50)');
    expect(first.html).toContain('A &lt;b&gt;School&lt;/b&gt;');
    expect(first.html).not.toContain('<b>School</b>');
    expect(first.text).toContain('Nothing is confirmed by itself');
    expect(renderEmail('upi_waiting', { ...data, kind: 'reminder' }).subject).toMatch(/^Reminder: /);
    expect(renderEmail('upi_waiting', { ...data, kind: 'alert', count: '1' })).toMatchObject({ subject: 'Waiting two days: 1 UPI payment to verify (₹6,901.50)' });
    expect(Object.keys(data).sort()).toEqual(['amount', 'count', 'schoolName', 'url']);
  });
});

const A = 'a6000000-0000-4000-8000-000000000001';
const T = 'a6000000-0000-4000-8000-000000000002'; // a test school
const PRINCIPAL = 'a6000000-0000-4000-8000-0000000000a1';
const ACCOUNTANT = 'a6000000-0000-4000-8000-0000000000a2';
const ADMIN = 'a6000000-0000-4000-8000-0000000000a4';
const TEACHER = 'a6000000-0000-4000-8000-0000000000a3';
const sid = (n: number) => `a6000000-0000-4000-8000-0000005000${String(n).padStart(2, '0')}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = (who: Who, fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = (fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const queue = createPgJobQueue(platform);
const actor = (who: Who) => ({ schoolId: A, userId: who.user, role: who.role as never });
const setup = (notify: 'each' | 'digest') => db.pg.query(`insert into payment_methods (school_id, method, enabled, settings, updated_by) values ($1, 'direct_upi', true, $2, $3) on conflict (school_id, method) do update set settings = excluded.settings`, [A, JSON.stringify({ upiId: 'school.fees@okbank', payeeName: 'School A', bankName: 'An Example Bank', accountLast4: '4821', ifsc: 'EXMP0001234', verifiers: ['accountant', 'principal'], principalLimitMinor: 0, notify }), PRINCIPAL]);
let child = 0;
// A new child with one due, a link, and a UTR reported on the India date given (at noon there).
const report = async (utr: string, on: string, today = on) => {
  const student = sid(++child);
  await db.pg.query(`insert into students (student_id, school_id, admission_no, name) values ($1, $2, $3, $4)`, [student, A, `A-${child}`, `Child ${child}`]);
  await db.pg.exec(`alter table students disable trigger user; update students set status = 'active'; alter table students enable trigger user;`);
  await db.pg.query(`insert into fees_ledger (school_id, student_id, amount_minor, due_date) values ($1, $2, 230050, '2026-04-10')`, [A, student]);
  const link = (await as(accountant, (c) => createPaymentLink(c, actor(accountant), { studentId: student, amountMinor: null }))).link;
  const out = await platform((c) => reportUtr(c, link.token, utr, (schoolId, reportId) => notifyNewReport(c, queue, schoolId, reportId, today)));
  await db.pg.exec(`set session_replication_role = replica; update payment_reports set reported_at = '${on}T06:30:00Z' where utr = '${utr}'; set session_replication_role = origin;`);
  return { out, token: link.token as string };
};
const emails = async () => (await db.pg.query(`select payload->'data'->>'kind' as kind, payload->'data'->>'count' as count, payload->'to' as "to", idempotency_key as key, payload::text as raw from jobs where type = 'email.send' order by created_at, job_id`)).rows;
const rowOf = async (utr: string) => (await db.pg.query(`select status, notified_at is not null as told, reminded_at is not null as reminded, alerted_at is not null as alerted from payment_reports where utr = $1`, [utr])).rows[0];
const idOf = async (utr: string) => (await db.pg.query(`select report_id from payment_reports where utr = $1`, [utr])).rows[0].report_id as string;
const night = (today: string) => platform((c) => runUpiAlerts(c, queue, A, today));

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${T}', 'Test School', 'IN-DL', true);
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant'),
        ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Admin A'), ('${TEACHER}', '${A}', 'teacher@school-a.example', 'teacher', 'Teacher A');
      insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true), ('${ACCOUNTANT}', '${A}', 'accountant', true), ('${ADMIN}', '${A}', 'school_admin', true), ('${TEACHER}', '${A}', 'teacher', true);
    `);
    await setup('each');
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it('"each payment": the verifiers, and only they, are emailed through the job queue as the parent reports it', async () => {
    expect((await report('500000000001', '2099-07-10')).out).toEqual({ ok: true });
    const sent = await emails();
    expect(sent.map((e: { kind: string; count: string; to: string[] }) => [e.kind, e.count, [...e.to].sort()])).toEqual([['new', '1', ['accounts@school-a.example', 'principal@school-a.example']]]);
    expect(sent[0].raw).not.toMatch(/500000000001|Child 1/); // no UTR and no child in the email
    expect(await rowOf('500000000001')).toEqual({ status: 'reported', told: true, reminded: false, alerted: false });
  });

  it('a per-school daily cap: beyond it nothing more is sent that day, and the night’s digest carries the rest', async () => {
    await db.pg.exec(`set session_replication_role = replica; update payment_reports set notified_at = '2099-07-10T07:00:00Z' where utr = '500000000001'; set session_replication_role = origin;`);
    // Stand in for a day on which the cap is already reached.
    const told = (await db.pg.query(`select count(*)::int as n from payment_reports where school_id = $1 and (notified_at at time zone 'Asia/Kolkata')::date = '2099-07-10'`, [A])).rows[0].n;
    expect(told).toBe(1);
    expect(DAILY_EMAIL_CAP).toBe(20);
    const before = (await emails()).length;
    const student = sid(++child);
    await db.pg.query(`insert into students (student_id, school_id, admission_no, name) values ($1, $2, 'A-cap', 'Capped')`, [student, A]);
    await db.pg.exec(`alter table students disable trigger user; update students set status = 'active'; alter table students enable trigger user;`);
    await db.pg.query(`insert into fees_ledger (school_id, student_id, amount_minor, due_date) values ($1, $2, 100000, '2026-04-10')`, [A, student]);
    const link = (await as(accountant, (c) => createPaymentLink(c, actor(accountant), { studentId: student, amountMinor: null }))).link;
    // 20 already told today (made up by a query the cap check reads the same way).
    const capped = await platform(async (c) => {
      await reportUtr(c, link.token, '500000000002');
      const id = (await c.query(`select report_id from payment_reports where utr = '500000000002'`)).rows[0].report_id;
      const real = c.query.bind(c);
      const pretend = { query: (text: string, params?: unknown[]) => (/count\(\*\)::int as n from payment_reports/.test(text) ? Promise.resolve({ rows: [{ n: DAILY_EMAIL_CAP }] }) : real(text, params)) };
      return notifyNewReport(pretend as never, queue, A, id, '2099-07-10');
    });
    expect(capped).toBe('capped');
    expect((await emails()).length).toBe(before);
    expect((await rowOf('500000000002')).told).toBe(false);
    await db.pg.exec(`set session_replication_role = replica; update payment_reports set reported_at = '2099-07-10T06:30:00Z' where utr = '500000000002'; set session_replication_role = origin;`);
    expect(await night('2099-07-10')).toEqual({ digest: 1, reminded: 0, alerted: 0 });
    expect((await rowOf('500000000002')).told).toBe(true);
  });

  it('reminder to the verifiers after 1 working day, alert to the principal after 2; Sunday does not count; each once', async () => {
    // Both reports were made on Friday 10 July. Saturday is one working day later.
    const before = (await emails()).length;
    expect(await night('2099-07-11')).toEqual({ digest: 0, reminded: 2, alerted: 0 });
    expect(await night('2099-07-11')).toEqual({ digest: 0, reminded: 0, alerted: 0 }); // the same night again: nobody is told twice
    expect(await night('2099-07-12')).toEqual({ digest: 0, reminded: 0, alerted: 0 }); // Sunday: still one working day
    expect(await night('2099-07-13')).toEqual({ digest: 0, reminded: 0, alerted: 2 }); // Monday: two working days
    expect(await night('2099-07-14')).toEqual({ digest: 0, reminded: 0, alerted: 0 });
    const later = (await emails()).slice(before);
    expect(later.map((e: { kind: string; count: string; to: string[] }) => [e.kind, e.count, [...e.to].sort()])).toEqual([['reminder', '2', ['accounts@school-a.example', 'principal@school-a.example']], ['alert', '2', ['principal@school-a.example']]]);
    expect(await rowOf('500000000001')).toEqual({ status: 'reported', told: true, reminded: true, alerted: true });
  });

  it('NEVER confirmed by time passing: after every alert the reports still wait, and nothing is credited', async () => {
    await night('2099-12-31');
    expect((await db.pg.query(`select distinct status from payment_reports where school_id = $1`, [A])).rows).toEqual([{ status: 'reported' }]);
    expect((await db.pg.query(`select (select count(*)::int from receipts where school_id = $1) as receipts, (select count(*)::int from payment_evidence where school_id = $1) as evidence`, [A])).rows[0]).toEqual({ receipts: 0, evidence: 0 });
  });

  it('"daily digest": nothing at the moment of the report; one email at night for all that are new', async () => {
    await setup('digest');
    const before = (await emails()).length;
    await report('500000000003', '2099-08-03');
    await report('500000000004', '2099-08-03');
    expect((await emails()).length).toBe(before);
    expect(await night('2099-08-03')).toMatchObject({ digest: 2 });
    expect((await emails()).at(-1)).toMatchObject({ kind: 'digest', count: '2', key: `upi.digest:${A}:2099-08-03` });
    expect(await night('2099-08-03')).toMatchObject({ digest: 0 });
  });

  it('the nightly job runs it for every school with payments waiting', async () => {
    await report('500000000005', '2099-09-07');
    await feesNightlyHandler({ platform, queue, now: () => new Date('2099-09-07T19:00:00Z') })({ jobId: 'j', type: 'fees.nightly', payload: {}, attempts: 1, maxAttempts: 8, schoolId: null, idempotencyKey: 'k' });
    expect(await rowOf('500000000005')).toMatchObject({ status: 'reported', told: true, reminded: true }); // 8 September in India: one working day
  });

  it('REOPEN: the principal or the accountant puts a "not found" back, with a reason; the parent still cannot re-enter that UTR', async () => {
    const { token } = await report('500000000006', '2099-10-05');
    const id = await idOf('500000000006');
    expect(await as(accountant, (c) => verifyReport(c, actor(accountant), id, { action: 'not_found' }))).toEqual({ ok: true, state: 'not_found' });
    expect(await as({ role: 'school_admin', user: ADMIN }, (c) => reopenReport(c, actor({ role: 'school_admin', user: ADMIN }), id, 'Found it later'))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as({ role: 'teacher', user: TEACHER }, (c) => reopenReport(c, actor({ role: 'teacher', user: TEACHER }), id, 'x'))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(accountant, (c) => reopenReport(c, actor(accountant), id, '   '))).toEqual({ ok: false, reason: 'reason' });
    // The database itself: "not found" cannot go back to waiting without a named person and a reason.
    await expect(db.pg.query(`update payment_reports set status = 'reported', decided_by = null, decided_at = null where report_id = $1`, [id])).rejects.toThrow(/not decided again/);
    expect(await platform((c) => reportUtr(c, token, '500000000006'))).toEqual({ ok: false, reason: 'utr_used' }); // not by the parent
    expect(await as(accountant, (c) => reopenReport(c, actor(accountant), id, 'The credit showed in the bank the next morning'))).toEqual({ ok: true });
    expect((await db.pg.query(`select status, reopened_by, reopen_reason, decided_by from payment_reports where report_id = $1`, [id])).rows).toEqual([{ status: 'reported', reopened_by: ACCOUNTANT, reopen_reason: 'The credit showed in the bank the next morning', decided_by: null }]);
    expect((await db.pg.query(`select actor_user_id, after_state->>'reason' as reason from audit_log where school_id = $1 and event_action = 'fees.upi_reopened'`, [A])).rows).toEqual([{ actor_user_id: ACCOUNTANT, reason: 'The credit showed in the bank the next morning' }]);
    expect(await as(accountant, (c) => reopenReport(c, actor(accountant), id, 'again'))).toEqual({ ok: false, reason: 'not_reopenable' }); // it is waiting now
    // Reopening credits nothing: a person still has to find it in the bank.
    expect((await db.pg.query(`select count(*)::int as n from receipts where school_id = $1`, [A])).rows[0].n).toBe(0);
    expect(await as(principal, (c) => verifyReport(c, actor(principal), id, { action: 'found', amountSeenMinor: 230050, checked: true }))).toMatchObject({ ok: true, state: 'verified' });
    expect(await as(principal, (c) => reopenReport(c, actor(principal), id, 'undo'))).toEqual({ ok: false, reason: 'not_reopenable' }); // a verified payment is never reopened
  });

  it('a corrected UTR already waiting blocks the reopen: one waiting report per link', async () => {
    const { token } = await report('500000000007', '2099-10-06');
    const id = await idOf('500000000007');
    await as(accountant, (c) => verifyReport(c, actor(accountant), id, { action: 'not_found' }));
    expect(await platform((c) => reportUtr(c, token, '500000000008'))).toEqual({ ok: true });
    expect(await as(accountant, (c) => reopenReport(c, actor(accountant), id, 'Looking again'))).toEqual({ ok: false, reason: 'another_waiting' });
  });

  it('THE TEST-SCHOOL GUARD: a school holding test-mode evidence cannot be un-marked; one without can', async () => {
    await db.pg.query(`insert into payment_evidence (school_id, source, external_id, amount_minor, mode) values ($1, 'gateway_notice', 'guard:test', 100, 'test')`, [T]);
    await expect(db.pg.query(`update schools set is_test_fixture = false where school_id = $1`, [T])).rejects.toThrow(/holds test-mode payments and stays a test school/);
    await expect(platform((c) => c.query(`update schools set is_test_fixture = false where school_id = $1`, [T]))).rejects.toThrow(/stays a test school/);
    await db.pg.query(`update schools set name = 'Test School (renamed)' where school_id = $1`, [T]); // other changes are untouched
    expect((await db.pg.query(`select is_test_fixture from schools where school_id = $1`, [T])).rows[0].is_test_fixture).toBe(true);
    // A school with only live evidence, or none, may change either way.
    await db.pg.query(`update schools set is_test_fixture = true where school_id = $1`, [A]);
    await db.pg.query(`update schools set is_test_fixture = false where school_id = $1`, [A]);
    expect((await db.pg.query(`select is_test_fixture from schools where school_id = $1`, [A])).rows[0].is_test_fixture).toBe(false);
  });
});
