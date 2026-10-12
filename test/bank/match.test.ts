import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { bankLists, markNotAFee, matchByHand, matchStatementRows } from '@/lib/bank/match';
import { addAccount, importStatement } from '@/lib/bank/statements';
import { createPaymentLink } from '@/lib/fees/family';
import { takePayment } from '@/lib/fees/payments';
import { reportUtr, verifyReport } from '@/lib/payments/upi';
import { reopenReport } from '@/lib/payments/upi-alerts';

// Matching statement rows (docs/24 §3.4 path B, §3.5, §3.6, C177).
// EVERY STATEMENT HERE IS FICTIONAL: "An Example Bank" does not exist and no line is copied from a real statement.

const A = 'a8000000-0000-4000-8000-000000000001';
const PRINCIPAL = 'a8000000-0000-4000-8000-0000000000a1';
const ACCOUNTANT = 'a8000000-0000-4000-8000-0000000000a2';
const TEACHER = 'a8000000-0000-4000-8000-0000000000a3';
const sid = (n: number) => `a8000000-0000-4000-8000-0000005000${String(n).padStart(2, '0')}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const teacher: Who = { role: 'teacher', user: TEACHER };
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
const actor = (who: Who) => ({ schoolId: A, userId: who.user, role: who.role as never });
const one = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows[0];
const refused = async (run: () => Promise<unknown>) => run().then(() => 'allowed', (e: Error) => e.message);

let account = '';
let child = 0;
let line = 0;
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const dmy = (iso: string) => iso.split('-').reverse().join('/');
// A child owing ₹2,300.50, with a payment link. Returns the link and its reference code.
const family = async () => {
  const student = sid(++child);
  await db.pg.query(`insert into students (student_id, school_id, admission_no, name) values ($1, $2, $3, $4)`, [student, A, `A-${child}`, `Child ${child}`]);
  await db.pg.exec(`alter table students disable trigger user; update students set status = 'active'; alter table students enable trigger user;`);
  await db.pg.query(`insert into fees_ledger (school_id, student_id, amount_minor, due_date) values ($1, $2, 230050, '2026-04-10')`, [A, student]);
  const made = await as(accountant, (c) => createPaymentLink(c, actor(accountant), { studentId: student, amountMinor: null }));
  if (!made.ok) throw new Error(JSON.stringify(made));
  const link = made.link;
  const code = (await one(`select reference_code from payment_links where link_id = $1`, [link.linkId])).reference_code as string;
  return { student, linkId: link.linkId as string, token: link.token as string, code };
};
const paidFor = async (student: string) => Number((await one(`select coalesce(sum(p.amount_minor), 0) as n from payments p join fees_ledger l on l.fee_id = p.fee_id where l.student_id = $1`, [student])).n);
// A fictional statement of the lines given (narration, rupees), dated today, uploaded and matched.
const statement = async (lines: [string, string][], who: Who = accountant) => {
  const text = `FICTIONAL TEST STATEMENT - An Example Bank - not a real bank\nTxn Date,Description,Credit\n${lines.map(([n, amount]) => `${dmy(today)},${n} L${++line},"${amount}"`).join('\n')}\n`;
  const total = lines.reduce((t, [, a]) => t + Math.round(Number(a.replace(/,/g, '')) * 100), 0);
  return as(who, async (c) => {
    const kept = await importStatement(c, actor(who), { accountId: account, text, map: { headerRow: 1, date: 0, narration: 1, credit: 2 }, period: { from: today, to: today }, confirmed: { creditRows: lines.length, creditTotalMinor: total } });
    if (!kept.ok) throw new Error(JSON.stringify(kept));
    return matchStatementRows(c, actor(who));
  });
};
const rowOf = (needle: string) => one(`select b.row_id, b.match_status as s, b.evidence_id, v.source, v.rule, v.amount_minor::int as credited, v.decided_by, v.reason from bank_credit_rows b left join payment_evidence v on v.evidence_id = b.evidence_id where b.narration like '%' || $1 || '%'`, [needle]);
const report = (utr: string) => one(`select status, evidence_id, amount_seen_minor::int as seen from payment_reports where utr = $1`, [utr]);

describe('statement rows against payments, on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false);
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant'), ('${TEACHER}', '${A}', 'teacher@school-a.example', 'teacher', 'Teacher A');
      insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true), ('${ACCOUNTANT}', '${A}', 'accountant', true), ('${TEACHER}', '${A}', 'teacher', true);
    `);
    await db.pg.query(`insert into payment_methods (school_id, method, enabled, settings, updated_by) values ($1, 'direct_upi', true, $2, $3)`, [A, JSON.stringify({ upiId: 'school.fees@okbank', payeeName: 'School A', bankName: 'An Example Bank', accountLast4: '4821', ifsc: 'EXMP0001234', verifiers: ['accountant', 'principal'], principalLimitMinor: 0, notify: 'digest' }), PRINCIPAL]);
    account = (await as(principal, (c) => addAccount(c, actor(principal), { label: 'Fees account', bankName: 'An Example Bank', accountLast4: '4821', ifsc: '' }))).accountId;
  }, 120_000);
  afterAll(async () => db?.close?.());

  it('R1: the link’s own reference code on the row confirms the payment and issues the receipt', async () => {
    const f = await family();
    expect(await statement([[`UPI/CR/NCA-${f.code}/A PARENT`, '2,300.50']])).toEqual({ credited: 1, seen: 0, needsPerson: 0, left: 0 });
    expect(await rowOf(f.code)).toMatchObject({ s: 'matched', source: 'bank_statement_row', rule: 'R1', credited: 230050, decided_by: ACCOUNTANT });
    expect(await paidFor(f.student)).toBe(230050);
    expect(await one(`select status from payment_links where link_id = $1`, [f.linkId])).toEqual({ status: 'paid' });
    expect(await one(`select method, issued_by from receipts where payment_link_id = $1`, [f.linkId])).toEqual({ method: 'upi', issued_by: ACCOUNTANT });
  });

  it('R1 with another amount: what the bank shows is what is credited', async () => {
    const f = await family();
    expect(await statement([[`NCA${f.code} part`, '1,000.00']])).toMatchObject({ credited: 1 });
    expect(await paidFor(f.student)).toBe(100000);
  });

  it('R2: the UTR the parent entered, and the link’s amount', async () => {
    const f = await family();
    await platform((c) => reportUtr(c, f.token, '500000000001'));
    expect(await statement([['UPI/CR/500000000001/A PARENT', '2,300.50']])).toEqual({ credited: 1, seen: 0, needsPerson: 0, left: 0 });
    expect(await rowOf('500000000001')).toMatchObject({ s: 'matched', rule: 'R2', credited: 230050 });
    expect(await report('500000000001')).toMatchObject({ status: 'verified', seen: 230050 });
    expect(await paidFor(f.student)).toBe(230050);
    // The report is settled: "Found in bank" cannot credit it a second time.
    const id = (await one(`select report_id from payment_reports where utr = '500000000001'`)).report_id;
    expect(await as(principal, (c) => verifyReport(c, actor(principal), id, { action: 'found', amountSeenMinor: 230050, checked: true }))).toEqual({ ok: false, reason: 'already_decided' });
    expect(await paidFor(f.student)).toBe(230050);
  });

  it('the UTR with another amount is not R2: it waits for a person', async () => {
    const f = await family();
    await platform((c) => reportUtr(c, f.token, '500000000002'));
    expect(await statement([['UPI/CR/500000000002/A PARENT', '2,300.00']])).toEqual({ credited: 0, seen: 0, needsPerson: 1, left: 0 });
    expect(await rowOf('500000000002')).toMatchObject({ s: 'needs_person', evidence_id: null });
    expect(await paidFor(f.student)).toBe(0);
    expect(await report('500000000002')).toMatchObject({ status: 'reported' });
  });

  it('never by amount and date alone', async () => {
    const f = await family();
    expect(await statement([['UPI/CR/A PARENT WITH NO REFERENCE', '2,300.50']])).toEqual({ credited: 0, seen: 0, needsPerson: 0, left: 1 });
    expect(await paidFor(f.student)).toBe(0);
    expect(await rowOf('NO REFERENCE')).toMatchObject({ s: 'unmatched', evidence_id: null });
  });

  it('two candidates: the code says one family and the UTR another; nobody is credited', async () => {
    const f1 = await family();
    const f2 = await family();
    await platform((c) => reportUtr(c, f2.token, '500000000003'));
    expect(await statement([[`UPI/500000000003/NCA-${f1.code}`, '2,300.50']])).toMatchObject({ credited: 0, needsPerson: 1 });
    expect([await paidFor(f1.student), await paidFor(f2.student)]).toEqual([0, 0]);
    const listed = (await as(accountant, (c) => bankLists(c, A, 'accountant' as never))).rows.find((r: { utr: string }) => r.utr === '500000000003');
    expect(listed).toMatchObject({ needs_person: true, marked_not_found: false, candidate_link_id: f2.linkId });
  });

  it('a second credit carrying a paid link’s code is not credited by itself', async () => {
    const f = await family();
    expect(await statement([[`NCA-${f.code} first`, '2,300.50']])).toMatchObject({ credited: 1 });
    expect(await statement([[`NCA-${f.code} again`, '2,300.50']])).toMatchObject({ credited: 0, needsPerson: 1 });
    expect(await paidFor(f.student)).toBe(230050);
    // A person matches it: nothing more is owed, so the whole amount goes to the refund list.
    const row = await rowOf('again');
    const done = await as(principal, (c) => matchByHand(c, actor(principal), row.row_id, f.linkId, 'The parent paid twice; called and confirmed'));
    expect(done).toMatchObject({ ok: true, credit: { outcome: 'not_applied', unappliedMinor: 230050 } });
    expect(await rowOf('again')).toMatchObject({ s: 'matched', rule: 'manual', decided_by: PRINCIPAL, reason: 'The parent paid twice; called and confirmed' });
  });

  it('“Marked not found — but in the bank”: listed for a person, never credited by itself', async () => {
    const f = await family();
    await platform((c) => reportUtr(c, f.token, '500000000004'));
    const id = (await one(`select report_id from payment_reports where utr = '500000000004'`)).report_id;
    await as(accountant, (c) => verifyReport(c, actor(accountant), id, { action: 'not_found' }));
    expect(await statement([['UPI/CR/500000000004/A PARENT', '2,300.50']])).toMatchObject({ credited: 0, seen: 0, needsPerson: 1 });
    expect(await paidFor(f.student)).toBe(0);
    const listed = (await as(accountant, (c) => bankLists(c, A, 'accountant' as never))).rows.find((r: { utr: string }) => r.utr === '500000000004');
    expect(listed).toMatchObject({ needs_person: true, marked_not_found: true, candidate_link_id: f.linkId, candidate: expect.stringContaining('Child') });
    // "Check again" does not change its mind.
    expect(await as(accountant, (c) => matchStatementRows(c, actor(accountant)))).toMatchObject({ credited: 0 });
    // A person confirms, with a reason.
    const row = await rowOf('500000000004');
    expect(await as(accountant, (c) => matchByHand(c, actor(accountant), row.row_id, f.linkId, ' '))).toEqual({ ok: false, reason: 'reason' });
    expect(await as(teacher, (c) => matchByHand(c, actor(teacher), row.row_id, f.linkId, 'x'))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(accountant, (c) => matchByHand(c, actor(accountant), row.row_id, f.linkId, 'I had looked at the wrong account'))).toMatchObject({ ok: true, credit: { outcome: 'applied' } });
    expect(await paidFor(f.student)).toBe(230050);
    expect(await report('500000000004')).toMatchObject({ status: 'verified', seen: 230050 });
    // Settled: it cannot be reopened and confirmed again, and the row is not used twice.
    expect(await as(principal, (c) => reopenReport(c, actor(principal), id, 'again'))).toEqual({ ok: false, reason: 'not_reopenable' });
    expect(await as(accountant, (c) => matchByHand(c, actor(accountant), row.row_id, f.linkId, 'again'))).toEqual({ ok: false, reason: 'already_decided' });
    expect(await paidFor(f.student)).toBe(230050);
    const audit = (await db.pg.query(`select after_state from audit_log where event_action = 'bank.row_matched_by_hand' and target_id = $1`, [row.row_id])).rows;
    expect(audit).toHaveLength(1);
  });

  it('path B checks path A: a confirmation the statement bears out is seen; one it does not is red for the principal', async () => {
    const seen = await family();
    const unseen = await family();
    for (const [f, utr] of [[seen, '500000000005'], [unseen, '500000000006']] as const) {
      await platform((c) => reportUtr(c, f.token, utr));
      const id = (await one(`select report_id from payment_reports where utr = $1`, [utr])).report_id;
      await as(accountant, (c) => verifyReport(c, actor(accountant), id, { action: 'found', amountSeenMinor: 230050, checked: true }));
    }
    // The statements so far end today: they do not yet cover the day after, so nothing is red.
    expect((await as(principal, (c) => bankLists(c, A, 'principal' as never))).missing).toEqual([]);
    expect(await statement([['UPI/CR/500000000005/A PARENT', '2,300.50']])).toMatchObject({ credited: 0, seen: 1, needsPerson: 0 });
    expect(await rowOf('500000000005')).toMatchObject({ s: 'matched', source: 'school_confirmed', rule: 'A' });
    expect(await paidFor(seen.student)).toBe(230050); // seen, not credited again
    // A statement that runs past the day arrives.
    await db.pg.exec(`set session_replication_role = replica; update bank_statement_imports set period_to = period_to + 2 where school_id = '${A}'; set session_replication_role = origin;`);
    const red = (await as(principal, (c) => bankLists(c, A, 'principal' as never))).missing;
    expect(red).toEqual([expect.objectContaining({ utr: '500000000006', amount_minor: 230050, confirmed_by: 'Anil Accountant', payer: expect.stringContaining('Child') })]);
    expect((await as(accountant, (c) => bankLists(c, A, 'accountant' as never))).missing).toEqual([]);
    // A confirmed amount the bank does not agree with waits for a person.
    expect(await statement([['UPI/CR/500000000006/A PARENT', '2,000.00']])).toMatchObject({ seen: 0, needsPerson: 1 });
    // The person cannot credit it a second time, to this family or to another: the row is tied to the confirmation.
    const row = await rowOf('500000000006');
    expect(await as(principal, (c) => matchByHand(c, actor(principal), row.row_id, seen.linkId, 'try another family'))).toEqual({ ok: false, reason: 'reported_for_another' });
    expect(await as(principal, (c) => matchByHand(c, actor(principal), row.row_id, unseen.linkId, 'The bank shows 2,000; the receipt is being corrected'))).toEqual({ ok: true });
    expect(await rowOf('500000000006')).toMatchObject({ s: 'matched', source: 'school_confirmed', rule: 'A' });
    expect(await paidFor(unseen.student)).toBe(230050);
    expect((await as(principal, (c) => bankLists(c, A, 'principal' as never))).missing).toEqual([]);
  });

  it('counter UPI and cheques: seen by the UTR or cheque number typed and the amount; unseen after N days are listed', async () => {
    const pay = async (method: 'upi' | 'cheque', reference: string, amountMinor: number) => {
      const f = await family();
      const taken = await as(accountant, (c) => takePayment(c, actor(accountant), { studentId: f.student, scope: 'student', amountMinor, method, reference, allocations: null }));
      if (!taken.ok) throw new Error(JSON.stringify(taken));
      return taken.receiptNo;
    };
    const upi = await pay('upi', '600000000001', 50000);
    const cheque = await pay('cheque', 'Chq 004512 An Example Bank', 70000);
    const lateCheque = await pay('cheque', '004513', 80000);
    const sameAmount = await pay('upi', '600000000009', 90000);
    expect(await statement([['UPI/CR/600000000001/DESK', '500.00'], ['CHQ DEP 004512', '700.00'], ['UPI/CR/600000000008/SOMEONE', '900.00']])).toMatchObject({ credited: 0, seen: 2, needsPerson: 0 });
    expect(await rowOf('600000000001')).toMatchObject({ s: 'matched', source: 'counter' });
    expect(await rowOf('CHQ DEP 004512')).toMatchObject({ s: 'matched', source: 'counter' });
    expect(await rowOf('600000000008')).toMatchObject({ s: 'unmatched' }); // the same amount as a counter receipt, another UTR
    // Not yet N days: nothing listed. Four days on, the two the bank has not shown are.
    expect((await as(accountant, (c) => bankLists(c, A, 'accountant' as never))).counterUnseen).toEqual([]);
    await db.pg.exec(`alter table receipts disable trigger user; update receipts set issued_at = issued_at - interval '4 days' where school_id = '${A}' and payment_link_id is null; alter table receipts enable trigger user;`);
    const lists = await as(accountant, (c) => bankLists(c, A, 'accountant' as never));
    expect(lists.unseenAfterDays).toBe(3);
    expect(lists.counterUnseen.map((r: { receipt_no: string }) => r.receipt_no).sort()).toEqual([lateCheque, sameAmount].sort());
    expect(lists.counterUnseen.map((r: { receipt_no: string }) => r.receipt_no)).not.toContain(upi);
    expect(lists.counterUnseen.map((r: { receipt_no: string }) => r.receipt_no)).not.toContain(cheque);
    // The school's own number of days.
    await db.pg.query(`insert into school_settings (school_id, module_id, setting_values, schema_version, updated_by) values ($1, 'fees', '{"bank_unseen_days": 10}', 5, $2) on conflict (school_id, module_id) do update set setting_values = excluded.setting_values`, [A, PRINCIPAL]);
    expect((await as(accountant, (c) => bankLists(c, A, 'accountant' as never))).counterUnseen).toEqual([]);
  });

  it('“not a fee” needs a reason and a finance role, and is final', async () => {
    const row = await rowOf('NO REFERENCE');
    expect(await as(accountant, (c) => markNotAFee(c, actor(accountant), row.row_id, ''))).toEqual({ ok: false, reason: 'reason' });
    expect(await as(teacher, (c) => markNotAFee(c, actor(teacher), row.row_id, 'A donation'))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(accountant, (c) => markNotAFee(c, actor(accountant), row.row_id, 'A donation'))).toEqual({ ok: true });
    expect(await rowOf('NO REFERENCE')).toMatchObject({ s: 'not_a_fee', evidence_id: null });
    expect(await as(accountant, (c) => markNotAFee(c, actor(accountant), row.row_id, 'again'))).toEqual({ ok: false, reason: 'already_decided' });
    expect(await as(teacher, (c) => matchStatementRows(c, actor(teacher)))).toEqual({ notAllowed: true });
  });

  it('the database: a credit “from the bank” without its bank row cannot be committed, and a row is used once', async () => {
    const f = await family();
    const insert = `insert into payment_evidence (school_id, source, external_id, amount_minor, link_id, rule, decided_by, reason) values ($1, 'bank_statement_row', $2, 230050, $3, 'manual', $4, 'no row behind this')`;
    expect(await refused(() => as(principal, (c) => c.query(insert, [A, 'made-up-1', f.linkId, PRINCIPAL])))).toMatch(/needs its bank row/);
    expect(await one(`select count(*)::int as n from payment_evidence where external_id = 'made-up-1'`)).toEqual({ n: 0 });
    // A row of another amount does not stand behind it either.
    const spare = await rowOf('600000000008');
    expect(await refused(() => as(principal, async (c) => {
      const made = await c.query(`${insert} returning evidence_id`, [A, 'made-up-2', f.linkId, PRINCIPAL]);
      await c.query(`update bank_credit_rows set match_status = 'matched', evidence_id = $2 where row_id = $1`, [spare.row_id, made.rows[0].evidence_id]);
    }))).toMatch(/needs its bank row/);
    // A matched row cannot be pointed at other evidence, and two rows cannot share one.
    const used = await rowOf('500000000001');
    const otherEvidence = (await rowOf('600000000001')).evidence_id;
    expect(await refused(() => as(principal, (c) => c.query(`update bank_credit_rows set evidence_id = $2 where row_id = $1`, [used.row_id, otherEvidence])))).toMatch(/used at most once|one_evidence/);
    expect(await refused(() => as(principal, (c) => c.query(`update bank_credit_rows set match_status = 'matched', evidence_id = $2 where row_id = $1`, [spare.row_id, used.evidence_id])))).toMatch(/one_evidence/);
    // The whole school still reconciles.
    const { reconcile } = await import('@/lib/fees/payments');
    expect((await as(principal, (c) => reconcile(c, A))).problems).toEqual([]);
  });
});
