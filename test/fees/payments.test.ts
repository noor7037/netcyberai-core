import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { allocateOldestFirst, getReceipt, openDues, reconcile, reverseReceipt, takePayment, type TakeInput } from '@/lib/fees/payments';

// Payments, receipts and reversals (docs/23 6c, C160). The acceptance test
// of the slice is the last word of P3's "done when": it reconciles to the
// rupee. Every balance below is worked out by hand in the comments.

describe('where money goes when nobody chooses', () => {
  it('the oldest due first, each filled before the next, in whole paise', () => {
    const dues = [{ fee_id: 'a', balance_minor: 150050 }, { fee_id: 'b', balance_minor: 80000 }, { fee_id: 'c', balance_minor: 165000 }];
    expect(allocateOldestFirst(100000, dues)).toEqual([{ feeId: 'a', amountMinor: 100000 }]);
    expect(allocateOldestFirst(200000, dues)).toEqual([{ feeId: 'a', amountMinor: 150050 }, { feeId: 'b', amountMinor: 49950 }]);
    expect(allocateOldestFirst(395050, dues)).toEqual([{ feeId: 'a', amountMinor: 150050 }, { feeId: 'b', amountMinor: 80000 }, { feeId: 'c', amountMinor: 165000 }]);
    expect(allocateOldestFirst(0, dues)).toEqual([]);
  });
});

const A = 'af000000-0000-4000-8000-000000000001';
const B = 'af000000-0000-4000-8000-000000000002';
const PRINCIPAL = 'af000000-0000-4000-8000-0000000000a1';
const ACCOUNTANT = 'af000000-0000-4000-8000-0000000000a2';
const TEACHER = 'af000000-0000-4000-8000-0000000000a3';
const PRINCIPAL_B = 'af000000-0000-4000-8000-0000000000b1';
const C5 = 'af000000-0000-4000-8000-0000000000c1';
const FAMILY = 'af000000-0000-4000-8000-0000000000d1';
const sid = (n: number) => `af000000-0000-4000-8000-0000005000${String(n).padStart(2, '0')}`;
const fid = (n: number) => `af000000-0000-4000-8000-0000006000${String(n).padStart(2, '0')}`;
const S = { asha: sid(1), bilal: sid(2), chitra: sid(3) };
// Asha: April 1,500.50, May 1,500.50, June 1,500.50. Bilal (Asha's brother): April 800. Chitra: April 2,000.
const F = { ashaApr: fid(1), ashaMay: fid(2), ashaJun: fid(3), bilalApr: fid(4), chitraApr: fid(5) };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };
const teacher: Who = { role: 'teacher', user: TEACHER, school: A };
const principalB: Who = { role: 'principal', user: PRINCIPAL_B, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    await tx.query(`select set_config('app.current_tenant_id', $1, true)`, [who.school]);
    await tx.query(`select set_config('app.current_role', $1, true)`, [who.role]);
    await tx.query(`select set_config('app.current_user_id', $1, true)`, [who.user]);
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
const take = (who: Who, studentId: string, amountMinor: number, more: Partial<TakeInput> = {}) => as(who, (c) => takePayment(c, actor(who), { studentId, scope: 'student', amountMinor, method: 'cash', reference: null, allocations: null, ...more }));
const balances = async () => Object.fromEntries((await db.pg.query(`select l.fee_id, (l.amount_minor - coalesce((select sum(p.amount_minor) from payments p where p.fee_id = l.fee_id), 0))::int as balance, l.status::text as status from fees_ledger l where l.school_id = $1`, [A])).rows.map((r: { fee_id: string; balance: number; status: string }) => [Object.entries(F).find(([, v]) => v === r.fee_id)![0], [r.balance, r.status]]));
const receipts: Record<string, string> = {};

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${ACCOUNTANT}', '${A}', 'acc@a.invalid', 'accountant', 'Accountant A'),
        ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Teacher A'), ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', 'principal', 'Principal B');
      insert into classes (class_id, school_id, name) values ('${C5}', '${A}', '5-A');
      insert into families (family_id, school_id, family_code, created_by) values ('${FAMILY}', '${A}', 'FAM-1', '${PRINCIPAL}');
      insert into students (student_id, school_id, admission_no, name, class_id, family_id) values
        ('${S.asha}', '${A}', 'A-1', 'Asha', '${C5}', '${FAMILY}'), ('${S.bilal}', '${A}', 'A-2', 'Bilal', '${C5}', '${FAMILY}'), ('${S.chitra}', '${A}', 'A-3', 'Chitra', '${C5}', null);
      alter table students disable trigger user;
      update students set status = 'active';
      alter table students enable trigger user;
      insert into fees_ledger (fee_id, school_id, student_id, amount_minor, due_date) values
        ('${F.ashaApr}', '${A}', '${S.asha}', 150050, '2026-04-10'), ('${F.ashaMay}', '${A}', '${S.asha}', 150050, '2026-05-10'), ('${F.ashaJun}', '${A}', '${S.asha}', 150050, '2026-06-10'),
        ('${F.bilalApr}', '${A}', '${S.bilal}', 80000, '2026-04-10'), ('${F.chitraApr}', '${A}', '${S.chitra}', 200000, '2026-04-10');
    `);
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it('a payment goes to the oldest due first; a part payment leaves the right balance; one numbered receipt covers it', async () => {
    // Asha pays ₹2,000: April in full (1,500.50), ₹499.50 on May.
    const r = await take(accountant, S.asha, 200000);
    expect(r).toMatchObject({ ok: true, replayed: false, payments: [{ feeId: F.ashaApr, amountMinor: 150050 }, { feeId: F.ashaMay, amountMinor: 49950 }] });
    if (!r.ok) throw new Error('unreachable');
    receipts.first = r.receiptId;
    expect(r.receiptNo).toMatch(/^RCP-\d{4}-00001$/);
    expect(await balances()).toMatchObject({ ashaApr: [0, 'paid'], ashaMay: [100100, 'partial'], ashaJun: [150050, expect.any(String)] });
    const receipt = await as(accountant, (c) => getReceipt(c, A, r.receiptId));
    expect(receipt).toMatchObject({ receipt_no: r.receiptNo, total_minor: 200000, method: 'cash', allocation: 'oldest_first', student_name: 'Asha', issued_by_name: 'Accountant A', reversed_at: null });
    expect(receipt!.lines.map((l) => l.amount_minor)).toEqual([150050, 49950]);
  });

  it('the same press of the button arriving twice is one receipt and one credit', async () => {
    const clientRef = 'af100000-0000-4000-8000-000000000001';
    const first = await take(accountant, S.chitra, 50000, { clientRef });
    const again = await take(accountant, S.chitra, 50000, { clientRef });
    if (!first.ok || !again.ok) throw new Error('unreachable');
    expect(again).toMatchObject({ replayed: true, receiptId: first.receiptId, receiptNo: first.receiptNo });
    expect((await db.pg.query(`select count(*)::int as n from receipts where school_id = $1 and student_id = $2`, [A, S.chitra])).rows[0].n).toBe(1);
    expect((await balances()).chitraApr).toEqual([150000, 'partial']); // 2,000 − 500, credited once
    receipts.chitra = first.receiptId;
  });

  it('the office may pick the dues; the choice is recorded and audited', async () => {
    // Asha pays ₹1,500.50 and asks for it to go to June, not to the older May balance.
    const r = await take(principal, S.asha, 150050, { method: 'upi', reference: 'UPI 4411', allocations: [{ feeId: F.ashaJun, amountMinor: 150050 }] });
    expect(r).toMatchObject({ ok: true, payments: [{ feeId: F.ashaJun, amountMinor: 150050 }] });
    if (!r.ok) throw new Error('unreachable');
    receipts.chosen = r.receiptId;
    expect(await balances()).toMatchObject({ ashaMay: [100100, 'partial'], ashaJun: [0, 'paid'] });
    expect((await db.pg.query(`select actor_user_id, after_state->>'allocation' as allocation from audit_log where school_id = $1 and event_action = 'fees.payment_taken' and target_id = $2`, [A, r.receiptId])).rows).toEqual([{ actor_user_id: PRINCIPAL, allocation: 'chosen' }]);
    // A chosen split must be this payer's own open dues, within each balance, and add up to the amount.
    for (const allocations of [[{ feeId: F.chitraApr, amountMinor: 1000 }], [{ feeId: F.ashaMay, amountMinor: 100101 }], [{ feeId: F.ashaMay, amountMinor: 500 }, { feeId: F.ashaMay, amountMinor: 500 }], [{ feeId: F.ashaMay, amountMinor: 999 }]]) {
      expect(await take(principal, S.asha, 1000, { allocations })).toEqual({ ok: false, reason: 'bad_allocation' });
    }
  });

  it('a family pays for its children together: oldest first across them', async () => {
    // Open in the family: Bilal April 800 (due 10 April), Asha May 1,001 (due 10 May). ₹1,000 → Bilal 800, Asha 200.
    expect((await as(accountant, (c) => openDues(c, A, S.asha, 'family'))).map((d) => [d.student_name, d.balance_minor])).toEqual([['Bilal', 80000], ['Asha', 100100]]);
    expect((await as(accountant, (c) => openDues(c, A, S.asha, 'student'))).map((d) => d.student_name)).toEqual(['Asha']);
    const r = await take(accountant, S.asha, 100000, { scope: 'family', method: 'cheque', reference: 'Cheque 000123' });
    expect(r).toMatchObject({ ok: true, payments: [{ feeId: F.bilalApr, amountMinor: 80000 }, { feeId: F.ashaMay, amountMinor: 20000 }] });
    if (!r.ok) throw new Error('unreachable');
    receipts.family = r.receiptId;
    expect((await as(accountant, (c) => getReceipt(c, A, r.receiptId)))).toMatchObject({ family_code: 'FAM-1', reference: 'Cheque 000123' });
    expect(await balances()).toMatchObject({ bilalApr: [0, 'paid'], ashaMay: [80100, 'partial'] });
    // Chitra is not of that family: a family payment never touches her dues.
    expect((await balances()).chitraApr).toEqual([150000, 'partial']);
  });

  it('more than is owed is refused, by the app and by the database itself', async () => {
    expect(await take(accountant, S.asha, 80101)).toEqual({ ok: false, reason: 'more_than_owed' });
    expect(await take(accountant, S.bilal, 1)).toEqual({ ok: false, reason: 'nothing_owed' });
    for (const amount of [0, -100, 10.5]) expect(await take(accountant, S.asha, amount)).toEqual({ ok: false, reason: 'amount' });
    await expect(db.pg.query(`insert into payments (school_id, fee_id, amount_minor, method) values ($1, $2, 80101, 'cash')`, [A, F.ashaMay])).rejects.toThrow(/more than what is still owed/);
    await expect(db.pg.query(`insert into payments (school_id, fee_id, amount_minor, method) values ($1, $2, 1, 'cash')`, [A, F.ashaApr])).rejects.toThrow(/more than what is still owed/);
    await expect(db.pg.query(`insert into payments (school_id, fee_id, amount_minor, method) values ($1, $2, -5, 'cash')`, [A, F.ashaMay])).rejects.toThrow(/payments_amount_sign/);
  });

  it('a wrong receipt is reversed with a reason: opposite rows are added, nothing is edited or deleted, and its number is never used again', async () => {
    const before = (await db.pg.query(`select count(*)::int as n from payments where school_id = $1`, [A])).rows[0].n;
    // The accountant cannot reverse; a reason is needed.
    expect(await as(accountant, (c) => reverseReceipt(c, actor(accountant), receipts.first, 'x'))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principal, (c) => reverseReceipt(c, actor(principal), receipts.first, '  '))).toEqual({ ok: false, reason: 'reason' });
    // The first receipt (₹2,000: April 1,500.50 + May 499.50) was entered for the wrong child.
    expect(await as(principal, (c) => reverseReceipt(c, actor(principal), receipts.first, 'Entered against the wrong student'))).toEqual({ ok: true, reversed: 2 });
    expect(await as(principal, (c) => reverseReceipt(c, actor(principal), receipts.first, 'again'))).toEqual({ ok: false, reason: 'already_reversed' });
    expect((await db.pg.query(`select count(*)::int as n from payments where school_id = $1`, [A])).rows[0].n).toBe(before + 2);
    // April is owed in full again; May owes 1,500.50 − 200 (the family cheque) = 1,300.50.
    expect(await balances()).toMatchObject({ ashaApr: [150050, expect.stringMatching(/pending|overdue/)], ashaMay: [130050, 'partial'] });
    expect(await as(principal, (c) => getReceipt(c, A, receipts.first))).toMatchObject({ reversal_reason: 'Entered against the wrong student', reversed_at: expect.anything() });
    // The next receipt takes the next number; the reversed number is not reused.
    const next = await take(accountant, S.asha, 150050);
    if (!next.ok) throw new Error('unreachable');
    const numbers = (await db.pg.query(`select receipt_no from receipts where school_id = $1 order by issued_at`, [A])).rows.map((r: { receipt_no: string }) => r.receipt_no);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(next.receiptNo.endsWith('00005')).toBe(true);
    // The database refuses to edit or delete a payment or a receipt, and a second reversal of one payment.
    for (const sql of [`update payments set amount_minor = 1`, `delete from payments`, `delete from receipts`]) await expect(as(principal, (c) => c.query(sql)), sql).rejects.toThrow(/permission denied/);
    await expect(as(principal, (c) => c.query(`update receipts set total_minor = 1 where receipt_id = $1`, [receipts.chosen]))).rejects.toThrow(/not changed after it is issued/);
    await expect(as(principal, (c) => c.query(`update receipts set reversal_reason = 'other' where receipt_id = $1`, [receipts.first]))).rejects.toThrow(/reversed receipt is not changed again/);
    const one = (await db.pg.query(`select payment_id, fee_id, amount_minor from payments where receipt_id = $1 and reverses_payment_id is null limit 1`, [receipts.first])).rows[0];
    await expect(db.pg.query(`insert into payments (school_id, fee_id, amount_minor, method, reverses_payment_id) values ($1, $2, $3, 'adjustment', $4)`, [A, one.fee_id, -Number(one.amount_minor), one.payment_id])).rejects.toThrow(/payments_one_reversal_per_payment|exact opposite/);
    const live = (await db.pg.query(`select payment_id, fee_id from payments where receipt_id = $1 and reverses_payment_id is null limit 1`, [receipts.chosen])).rows[0];
    await expect(db.pg.query(`insert into payments (school_id, fee_id, amount_minor, method, reverses_payment_id) values ($1, $2, -1, 'adjustment', $3)`, [A, live.fee_id, live.payment_id])).rejects.toThrow(/exact opposite/);
  });

  it('it reconciles to the rupee: every balance matches the hand count and the school total equals the sum of the balances', async () => {
    // By hand, after everything above:
    //   Asha April   1,500.50  paid 1,500.50 (the last receipt)                         → 0
    //   Asha May     1,500.50  paid 200 (family cheque); the 499.50 was reversed        → 1,300.50
    //   Asha June    1,500.50  paid 1,500.50 (chosen)                                   → 0
    //   Bilal April    800.00  paid 800 (family cheque)                                 → 0
    //   Chitra April 2,000.00  paid 500                                                 → 1,500.00
    //   Net 7,301.50; paid 4,501.00; still owed 2,800.50.
    expect(await balances()).toEqual({ ashaApr: [0, 'paid'], ashaMay: [130050, 'partial'], ashaJun: [0, 'paid'], bilalApr: [0, 'paid'], chitraApr: [150000, 'partial'] });
    const r = await as(accountant, (c) => reconcile(c, A));
    expect(r).toEqual({ dues: 5, grossMinor: 730150, concessionMinor: 0, netMinor: 730150, paidMinor: 450100, balanceMinor: 280050, problems: [] });
    // The same total three ways: net − paid, the sum of the balances, and the sum of the live receipts.
    const sumBalances = Object.values(await balances()).reduce((s, [b]) => s + (b as number), 0);
    const liveReceipts = Number((await db.pg.query(`select coalesce(sum(total_minor), 0) as t from receipts where school_id = $1 and reversed_at is null`, [A])).rows[0].t);
    expect(sumBalances).toBe(r.balanceMinor);
    expect(liveReceipts).toBe(r.paidMinor);
    // A fault is reported, never hidden: a payment slipped past the rules shows up as a problem.
    await db.pg.query(`alter table payments disable trigger payments_guard`);
    await db.pg.query(`insert into payments (school_id, fee_id, amount_minor, method) values ($1, $2, 5, 'cash')`, [A, F.ashaApr]);
    await db.pg.query(`alter table payments enable trigger payments_guard`);
    expect((await as(accountant, (c) => reconcile(c, A))).problems).toEqual([{ kind: 'due_paid_out_of_range', id: F.ashaApr }]);
  });

  it('a teacher takes no payment and sees no receipt; another school sees none of this school’s', async () => {
    expect(await take(teacher, S.chitra, 100)).toEqual({ ok: false, reason: 'not_allowed' });
    for (const who of [teacher, principalB]) expect(await as(who, (c) => c.query(`select 1 from receipts`).then((r: { rows: unknown[] }) => r.rows))).toEqual([]);
    await expect(as(teacher, (c) => c.query(`insert into receipts (school_id, receipt_no, student_id, total_minor, method, issued_by) values ($1, 'X-1', $2, 100, 'cash', $3)`, [A, S.chitra, TEACHER]))).rejects.toThrow(/row-level security/);
    await expect(as(accountant, (c) => c.query(`insert into receipts (school_id, receipt_no, student_id, total_minor, method, issued_by) values ($1, 'X-2', $2, 100, 'cash', $3)`, [A, S.chitra, PRINCIPAL]))).rejects.toThrow(/row-level security/);
    expect(await take(principalB, S.chitra, 100)).toEqual({ ok: false, reason: 'unknown_student' });
    expect((await db.pg.query(`select grantee from information_schema.role_table_grants where table_name = 'receipts' and grantee in ('anon', 'authenticated', 'PUBLIC')`)).rows).toEqual([]);
  });
});
