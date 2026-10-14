import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { saveSettings } from '@/lib/frameworks/settings-store';
import { feesNightlyHandler, lastNightlyRun, lateFeeRule } from '@/lib/fees/nightly';
import { loadFeesSummary } from '@/lib/fees/overdue';
import { openDues, reconcile, takePayment } from '@/lib/fees/payments';

// The nightly fee job (docs/23 6d, C163) on the whole real schema: overdue
// by India's date and the balance, safe to run twice, a late fee only where
// a school has set one. The job's clock is given, so midnight in India is
// exact. The dues are dated far ahead so the real date never decides.

const A = 'b1000000-0000-4000-8000-000000000001';
const B = 'b1000000-0000-4000-8000-000000000002';
const PRINCIPAL = 'b1000000-0000-4000-8000-0000000000a1';
const ACCOUNTANT = 'b1000000-0000-4000-8000-0000000000a2';
const TEACHER = 'b1000000-0000-4000-8000-0000000000a3';
const PRINCIPAL_B = 'b1000000-0000-4000-8000-0000000000b1';
const C5 = 'b1000000-0000-4000-8000-0000000000c1';
const sid = (n: number) => `b1000000-0000-4000-8000-0000005000${String(n).padStart(2, '0')}`;
const fid = (n: number) => `b1000000-0000-4000-8000-0000006000${String(n).padStart(2, '0')}`;
const S = { asha: sid(1), bilal: sid(2), chitra: sid(3), other: sid(9) };
// All due on 10 July 2099 unless said: Asha 1,000 (400 paid), Bilal 2,000 (unpaid), Chitra 1,500 (paid in full).
// Asha 500 due 20 July 2099. Bilal 700 due long ago (January 2026). School B: 999 due 10 July 2099.
const F = { ashaPart: fid(1), bilalUnpaid: fid(2), chitraPaid: fid(3), ashaLater: fid(4), bilalOld: fid(5), other: fid(6) };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };
const teacher: Who = { role: 'teacher', user: TEACHER, school: A };
const principalB: Who = { role: 'principal', user: PRINCIPAL_B, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = (who: Who, fn: (client: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    await tx.query(`select set_config('app.current_tenant_id', $1, true)`, [who.school]);
    await tx.query(`select set_config('app.current_role', $1, true)`, [who.role]);
    await tx.query(`select set_config('app.current_user_id', $1, true)`, [who.user]);
    return fn(tx);
  });
// The job runs as the platform role, each school in its own transaction.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = (fn: (client: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
const job = (payload: Record<string, unknown> = {}) => ({ jobId: 'j', type: 'fees.nightly', payload, attempts: 1, maxAttempts: 8, schoolId: null, idempotencyKey: 'k' });
const nightAt = (utc: string) => feesNightlyHandler({ platform, now: () => new Date(utc) })(job());
const statuses = async () => Object.fromEntries((await db.pg.query(`select fee_id, status::text as status from fees_ledger where late_fee_for is null`)).rows.map((r: { fee_id: string; status: string }) => [Object.entries(F).find(([, id]) => id === r.fee_id)?.[0], r.status]));
const runs = async (school: string) => (await db.pg.query(`select run_date::text as d, marked_overdue as marked, late_fees_raised as late, late_fee_minor::int as late_minor, problems, balance_minor::int as balance from fee_status_runs where school_id = $1 order by run_date`, [school])).rows;
const pay = (studentId: string, feeId: string, amountMinor: number) => as(accountant, (c) => takePayment(c, actor(accountant), { studentId, scope: 'student', amountMinor, method: 'cash', reference: null, allocations: [{ feeId, amountMinor }] }));

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${ACCOUNTANT}', '${A}', 'acc@a.invalid', 'accountant', 'Accountant A'),
      ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Teacher A'), ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', 'principal', 'Principal B');
    insert into classes (class_id, school_id, name) values ('${C5}', '${A}', '5-A');
    insert into students (student_id, school_id, admission_no, name, class_id) values ('${S.asha}', '${A}', 'A-1', 'Asha', '${C5}'), ('${S.bilal}', '${A}', 'A-2', 'Bilal', '${C5}'), ('${S.chitra}', '${A}', 'A-3', 'Chitra', '${C5}');
    insert into students (student_id, school_id, admission_no, name) values ('${S.other}', '${B}', 'B-1', 'Other');
    alter table students disable trigger user;
    update students set status = 'active';
    alter table students enable trigger user;
    insert into fees_ledger (fee_id, school_id, student_id, amount_minor, due_date) values
      ('${F.ashaPart}', '${A}', '${S.asha}', 100000, '2099-07-10'), ('${F.bilalUnpaid}', '${A}', '${S.bilal}', 200000, '2099-07-10'), ('${F.chitraPaid}', '${A}', '${S.chitra}', 150000, '2099-07-10'),
      ('${F.ashaLater}', '${A}', '${S.asha}', 50000, '2099-07-20'), ('${F.bilalOld}', '${A}', '${S.bilal}', 70000, '2026-01-10'), ('${F.other}', '${B}', '${S.other}', 99900, '2099-07-10');
  `);
  expect(await pay(S.asha, F.ashaPart, 40000)).toMatchObject({ ok: true });
  expect(await pay(S.chitra, F.chitraPaid, 150000)).toMatchObject({ ok: true });
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('one rule for a due’s status', () => {
  it('waived, paid, overdue on any balance past the date, part paid, pending', async () => {
    const rule = async (amount: number, paid: number, due: string) => (await db.pg.query(`select fee_status_for($1, $2, $3::date, '2099-07-11'::date)::text as s`, [amount, paid, due])).rows[0].s;
    expect(await rule(0, 0, '2099-07-01')).toBe('waived');
    expect(await rule(100000, 100000, '2099-07-01')).toBe('paid');
    expect(await rule(100000, 0, '2099-07-10')).toBe('overdue'); // due yesterday
    expect(await rule(100000, 40000, '2099-07-10')).toBe('overdue'); // part paid and past its date
    expect(await rule(100000, 0, '2099-07-11')).toBe('pending'); // due today: not overdue until the day is over
    expect(await rule(100000, 40000, '2099-07-11')).toBe('partial');
  });

  it('a payment sets the status by the same rule, by India’s date: part paid past its date is overdue', async () => {
    expect(await statuses()).toEqual({ ashaPart: 'partial', bilalUnpaid: 'pending', chitraPaid: 'paid', ashaLater: 'pending', bilalOld: 'pending', other: 'pending' });
    // A part payment on the fee that fell due in January: overdue at once, on what is left.
    expect(await pay(S.bilal, F.bilalOld, 10000)).toMatchObject({ ok: true });
    expect((await statuses()).bilalOld).toBe('overdue');
  });
});

describe('the nightly job', () => {
  it('a fee due on the 10th is not overdue at 23:59 on the 10th in India, and is at 00:01 on the 11th', async () => {
    await nightAt('2099-07-10T18:29:00Z'); // 23:59 on 10 July in India
    expect(await statuses()).toMatchObject({ ashaPart: 'partial', bilalUnpaid: 'pending', ashaLater: 'pending', other: 'pending' });
    expect(await runs(A)).toEqual([{ d: '2099-07-10', marked: 0, late: 0, late_minor: 0, problems: 0, balance: 60000 + 200000 + 50000 + 60000 }]);
    await nightAt('2099-07-10T18:31:00Z'); // 00:01 on 11 July in India
    expect(await statuses()).toEqual({ ashaPart: 'overdue', bilalUnpaid: 'overdue', chitraPaid: 'paid', ashaLater: 'pending', bilalOld: 'overdue', other: 'overdue' });
    expect((await runs(A))[1]).toEqual({ d: '2099-07-11', marked: 2, late: 0, late_minor: 0, problems: 0, balance: 370000 });
    expect(await runs(B)).toMatchObject([{ d: '2099-07-10', marked: 0 }, { d: '2099-07-11', marked: 1, balance: 99900 }]);
  });

  it('a fee of 1,000 with 400 paid, past its date, counts 600 overdue: the screens read the balance', async () => {
    const f = await as(principal, (c) => loadFeesSummary(c, A));
    // Asha 600 left of 1,000; Bilal 2,000; Bilal's old fee 600 left of 700.
    expect(f).toMatchObject({ overdueCount: 3, overdueMinor: 60000 + 200000 + 60000, pendingMinor: 50000, collectedMinor: 40000 + 150000 + 10000 });
    expect((await as(accountant, (c) => openDues(c, A, S.asha, 'student'))).map((d: { balance_minor: number; overdue: boolean }) => [d.balance_minor, d.overdue])).toEqual([[60000, true], [50000, false]]);
  });

  it('run twice for the same night, it changes nothing the second time', async () => {
    const before = [await statuses(), await runs(A), await runs(B), (await db.pg.query(`select count(*)::int as n from fees_ledger`)).rows[0].n, (await db.pg.query(`select count(*)::int as n from audit_log where event_action = 'fees.nightly_run'`)).rows[0].n];
    await nightAt('2099-07-10T18:31:00Z');
    await nightAt('2099-07-10T23:00:00Z'); // later the same India day
    expect([await statuses(), await runs(A), await runs(B), (await db.pg.query(`select count(*)::int as n from fees_ledger`)).rows[0].n, (await db.pg.query(`select count(*)::int as n from audit_log where event_action = 'fees.nightly_run'`)).rows[0].n]).toEqual(before);
    expect(before[4]).toBe(2); // one audit row per school and night that changed something; the quiet night wrote none
  });

  it('a job queued for a day that has not begun is refused; one that waited runs for today', async () => {
    await expect(feesNightlyHandler({ platform, now: () => new Date('2099-07-10T18:31:00Z') })(job({ date: '2099-07-12' }))).rejects.toThrow(/not begun/);
    await expect(feesNightlyHandler({ platform, now: () => new Date('2099-07-10T18:31:00Z') })(job({ date: 'tomorrow' }))).rejects.toThrow(/bad date/);
    await feesNightlyHandler({ platform, now: () => new Date('2099-07-10T18:31:00Z') })(job({ date: '2099-07-09' }));
    expect((await runs(A)).map((r: { d: string }) => r.d)).toEqual(['2099-07-10', '2099-07-11']);
  });
});

describe('the late fee', () => {
  it('is off unless the school switches it on: an amount alone charges nothing, and no night so far raised one', async () => {
    expect(await as(accountant, (c) => lateFeeRule(c, A))).toEqual({ feeMinor: 0, graceDays: 0, since: null });
    expect((await db.pg.query(`select count(*)::int as n from fees_ledger where late_fee_for is not null`)).rows[0].n).toBe(0);
  });

  it('once set, each overdue fee past the days of grace gets one late-fee line, a new due; never the past, never twice', async () => {
    const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'fees')!;
    expect(await as(principal, (c) => saveSettings(c, actor(principal), schema, { moduleId: 'fees', baseRevision: 0, set: { late_fee_enabled: true, late_fee_rupees: 50, late_fee_grace_days: 5 } }))).toMatchObject({ ok: true });
    const rule = await as(accountant, (c) => lateFeeRule(c, A));
    expect(rule).toMatchObject({ feeMinor: 5000, graceDays: 5 });
    expect(rule.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await nightAt('2099-07-14T19:00:00Z'); // 15 July in India: the fifth day of grace, nothing yet
    expect((await runs(A)).at(-1)).toMatchObject({ d: '2099-07-15', late: 0 });
    await nightAt('2099-07-15T19:00:00Z'); // 16 July: grace is over for the fees due on the 10th
    expect((await runs(A)).at(-1)).toEqual({ d: '2099-07-16', marked: 0, late: 2, late_minor: 10000, problems: 0, balance: 370000 + 10000 });
    const late = (await db.pg.query(`select late_fee_for, student_id, gross_minor::int as gross, concession_minor::int as concession, amount_minor::int as net, due_date::text as due, status::text as status, head_id from fees_ledger where late_fee_for is not null order by student_id`)).rows;
    // Asha's part-paid fee and Bilal's unpaid one. Not Chitra's (paid), not the fee not yet due,
    // not Bilal's January fee (it fell due before the school set a late fee), not school B (no late fee set).
    expect(late).toEqual([
      { late_fee_for: F.ashaPart, student_id: S.asha, gross: 5000, concession: 0, net: 5000, due: '2099-07-16', status: 'pending', head_id: null },
      { late_fee_for: F.bilalUnpaid, student_id: S.bilal, gross: 5000, concession: 0, net: 5000, due: '2099-07-16', status: 'pending', head_id: null },
    ]);
    // The fees themselves are untouched.
    expect((await db.pg.query(`select amount_minor::int as n from fees_ledger where fee_id = any($1::uuid[]) order by amount_minor`, [[F.ashaPart, F.bilalUnpaid]])).rows).toEqual([{ n: 100000 }, { n: 200000 }]);

    await nightAt('2099-07-16T19:00:00Z'); // 17 July: the late fees are themselves past due now, and are never fined
    expect((await runs(A)).at(-1)).toMatchObject({ d: '2099-07-17', marked: 2, late: 0, problems: 0 });
    expect((await db.pg.query(`select count(*)::int as n from fees_ledger where late_fee_for is not null`)).rows[0].n).toBe(2);
    await expect(db.pg.query(`insert into fees_ledger (school_id, student_id, amount_minor, due_date, late_fee_for) values ($1, $2, 5000, '2099-07-18', $3)`, [A, S.asha, F.ashaPart])).rejects.toThrow(/fees_ledger_one_late_fee_per_due/);
  });

  it('a late fee is paid at the counter like any due, and the books still add up', async () => {
    const dues = await as(accountant, (c) => openDues(c, A, S.bilal, 'student'));
    const lateDue = dues.find((d: { is_late_fee: boolean }) => d.is_late_fee);
    expect(dues.map((d: { is_late_fee: boolean; balance_minor: number }) => [d.is_late_fee, d.balance_minor])).toEqual([[false, 60000], [false, 200000], [true, 5000]]);
    expect(await pay(S.bilal, lateDue.fee_id, 5000)).toMatchObject({ ok: true });
    const books = await as(accountant, (c) => reconcile(c, A));
    expect(books.problems).toEqual([]);
    expect(books.balanceMinor).toBe(60000 + 200000 + 50000 + 60000 + 5000);
    expect(await as(accountant, (c) => lastNightlyRun(c, A))).toMatchObject({ runDate: '2099-07-17', markedOverdue: 2, problems: 0 });
  });
});

describe('who may do what', () => {
  it('the fee desk reads its own school’s nightly results and writes none; a teacher and another school read none', async () => {
    expect((await as(accountant, (c) => c.query(`select 1 from fee_status_runs`))).rows.length).toBe(5);
    expect((await as(teacher, (c) => c.query(`select 1 from fee_status_runs`))).rows).toEqual([]);
    expect((await as(principalB, (c) => c.query(`select distinct school_id from fee_status_runs`))).rows).toEqual([{ school_id: B }]);
    await expect(as(principal, (c) => c.query(`insert into fee_status_runs (school_id, run_date, marked_overdue, late_fees_raised, late_fee_minor, problems, balance_minor) values ($1, '2099-08-01', 0, 0, 0, 0, 0)`, [A]))).rejects.toThrow(/permission denied/);
    await expect(as(principal, (c) => c.query(`delete from fee_status_runs`))).rejects.toThrow(/permission denied/);
  });

  it('the clock queues one job a night, and only the database’s own scheduler may call it', async () => {
    await db.pg.query(`select fees_nightly_enqueue()`);
    await db.pg.query(`select fees_nightly_enqueue()`);
    const queued = (await db.pg.query(`select type, status, school_id, payload->>'date' as date, idempotency_key from jobs where type = 'fees.nightly'`)).rows;
    expect(queued).toEqual([{ type: 'fees.nightly', status: 'pending', school_id: null, date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), idempotency_key: expect.stringMatching(/^fees\.nightly:\d{4}-\d{2}-\d{2}$/) }]);
    await expect(as(principal, (c) => c.query(`select fees_nightly_enqueue()`))).rejects.toThrow(/permission denied/);
  });
});
