import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { createPaymentLink } from '@/lib/fees/family';
import { decideConcession } from '@/lib/fees/concessions';
import { closeFollowUp, followUpList, recordFollowUp, recordRefund, refundList } from '@/lib/fees/recovery';
import { creditEvidence } from '@/lib/payments/apply';
import { indiaDate } from '@/lib/time/india';

// Fee recovery: the follow-up list, a promise to pay, hardship, and the refund list (docs/23 6g, C178).

const A = 'a9000000-0000-4000-8000-000000000001';
const B = 'a9000000-0000-4000-8000-000000000002';
const PRINCIPAL = 'a9000000-0000-4000-8000-0000000000a1';
const ACCOUNTANT = 'a9000000-0000-4000-8000-0000000000a2';
const TEACHER = 'a9000000-0000-4000-8000-0000000000a3';
const B_PRINCIPAL = 'a9000000-0000-4000-8000-0000000000b1';
const FAMILY = 'a9000000-0000-4000-8000-00000000f001';
const sid = (n: number) => `a9000000-0000-4000-8000-0000005000${String(n).padStart(2, '0')}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const teacher: Who = { role: 'teacher', user: TEACHER };
const other: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = (who: Who, fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school ?? A, userId: who.user, role: who.role as never });
const refused = async (run: () => Promise<unknown>) => run().then(() => 'allowed', (e: Error) => e.message);
const today = indiaDate();
const ahead = (days: number) => indiaDate(new Date(Date.now() + days * 86400_000));
const list = () => as(accountant, (c) => followUpList(c, A));

describe('fee recovery, on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${B}', 'School B', 'IN-DL', false);
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant'),
        ('${TEACHER}', '${A}', 'teacher@school-a.example', 'teacher', 'Teacher A'), ('${B_PRINCIPAL}', '${B}', 'principal@school-b.example', 'principal', 'Principal B');
      insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true), ('${ACCOUNTANT}', '${A}', 'accountant', true), ('${TEACHER}', '${A}', 'teacher', true), ('${B_PRINCIPAL}', '${B}', 'principal', true);
      insert into families (family_id, school_id, family_code, created_by) values ('${FAMILY}', '${A}', 'FAM-1', '${PRINCIPAL}');
      insert into students (student_id, school_id, admission_no, name, family_id) values ('${sid(1)}', '${A}', 'A-1', 'Asha', '${FAMILY}'), ('${sid(2)}', '${A}', 'A-2', 'Bina', '${FAMILY}'), ('${sid(3)}', '${A}', 'A-3', 'Chetan', null), ('${sid(4)}', '${A}', 'A-4', 'Deepa', null);
      alter table students disable trigger user; update students set status = 'active'; alter table students enable trigger user;
      insert into fees_ledger (school_id, student_id, amount_minor, due_date) values
        ('${A}', '${sid(1)}', 100000, current_date - 40), ('${A}', '${sid(2)}', 50000, current_date - 10),
        ('${A}', '${sid(3)}', 70000, current_date - 20),
        ('${A}', '${sid(4)}', 90000, current_date + 20);
    `);
  }, 120_000);
  afterAll(async () => db?.close?.());

  it('the list: one line a family, what is past its date, the oldest first; a fee not yet due is not on it', async () => {
    const rows = await list();
    expect(rows.map((r: { payer: string }) => r.payer)).toEqual(['FAM-1 · Asha', 'Chetan']);
    expect(rows[0]).toMatchObject({ children: 2, overdue_minor: 150000, days_overdue: 40, last_kind: null, promise_id: null, hardship_id: null });
    expect(rows[1]).toMatchObject({ children: 1, overdue_minor: 70000, days_overdue: 20 });
    expect(await as(teacher, (c) => followUpList(c, A))).toEqual([]); // the database shows a teacher no fee data, whatever asks
    expect(await as(other, (c) => followUpList(c, B))).toEqual([]);
  });

  it('a call is a note with a name and a date; a teacher cannot write one', async () => {
    expect(await as(teacher, (c) => recordFollowUp(c, actor(teacher), { kind: 'call', studentId: sid(3), note: 'x' }))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(accountant, (c) => recordFollowUp(c, actor(accountant), { kind: 'call', studentId: sid(3), note: '  ' }))).toEqual({ ok: false, reason: 'note' });
    expect(await as(accountant, (c) => recordFollowUp(c, actor(accountant), { kind: 'call', studentId: sid(3), note: 'Spoke to the father; will come on Monday' }))).toMatchObject({ ok: true });
    expect((await list())[1]).toMatchObject({ last_kind: 'call', last_note: 'Spoke to the father; will come on Monday', last_by: 'Anil Accountant', last_on: today, promise_id: null });
  });

  it('a promise to pay: a date from today, one open per family, and it shows when the date has passed', async () => {
    const promise = (studentId: string, promiseDate: string) => as(accountant, (c) => recordFollowUp(c, actor(accountant), { kind: 'promise', studentId, note: 'Will pay after salary', promiseDate }));
    expect(await promise(sid(1), ahead(-1))).toEqual({ ok: false, reason: 'date' });
    expect(await promise(sid(1), ahead(120))).toEqual({ ok: false, reason: 'date' });
    expect(await promise(sid(1), 'soon')).toEqual({ ok: false, reason: 'date' });
    const made = await promise(sid(1), ahead(5));
    expect(made.ok).toBe(true);
    // The sister is the same family: the promise is the family's.
    expect(await promise(sid(2), ahead(6))).toEqual({ ok: false, reason: 'already_open' });
    expect((await list())[0]).toMatchObject({ promise_date: ahead(5), promise_passed: false, last_kind: 'promise' });
    await db.pg.exec(`alter table fee_followups disable trigger user; update fee_followups set promise_date = current_date - 2 where kind = 'promise'; alter table fee_followups enable trigger user;`);
    expect((await list())[0]).toMatchObject({ promise_passed: true });
    // Closed with a note; then a new one may be made.
    expect(await as(accountant, (c) => closeFollowUp(c, actor(accountant), made.followupId, ''))).toEqual({ ok: false, reason: 'note' });
    expect(await as(accountant, (c) => closeFollowUp(c, actor(accountant), made.followupId, 'Did not pay; called again'))).toMatchObject({ ok: true });
    expect(await as(accountant, (c) => closeFollowUp(c, actor(accountant), made.followupId, 'again'))).toEqual({ ok: false, reason: 'not_found' });
    expect((await list())[0]).toMatchObject({ promise_id: null });
    expect((await promise(sid(2), ahead(6))).ok).toBe(true);
  });

  it('hardship: a concession is proposed for each child who owes, and nothing is conceded until another person approves', async () => {
    const hardship = (percentOff: number) => as(accountant, (c) => recordFollowUp(c, actor(accountant), { kind: 'hardship', studentId: sid(1), note: 'The father lost his job in March', percentOff }));
    expect(await hardship(0)).toEqual({ ok: false, reason: 'percent' });
    expect(await hardship(101)).toEqual({ ok: false, reason: 'percent' });
    const made = await hardship(50);
    expect(made).toMatchObject({ ok: true, proposed: 2 });
    expect(await hardship(50)).toEqual({ ok: false, reason: 'already_open' });
    const requests = (await db.pg.query(`select concession_id, student_id, kind, status, percent_off::float as percent, proposed_by, reason from fee_concessions where school_id = $1 order by student_id`, [A])).rows;
    expect(requests).toEqual([sid(1), sid(2)].map((student_id) => expect.objectContaining({ student_id, kind: 'hardship', status: 'proposed', percent: 50, proposed_by: ACCOUNTANT, reason: 'The father lost his job in March' })));
    // Nothing is conceded: the dues are what they were.
    expect((await list())[0]).toMatchObject({ overdue_minor: 150000, hardship_id: made.followupId });
    // The person who asked cannot approve it; the principal can.
    expect(await as(accountant, (c) => decideConcession(c, actor(accountant), requests[0].concession_id, 'approve', today))).toMatchObject({ ok: false });
    expect(await as(principal, (c) => decideConcession(c, actor(principal), requests[0].concession_id, 'approve', today))).toMatchObject({ ok: true });
    const audit = (await db.pg.query(`select after_state from audit_log where event_action = 'fees.followup_hardship'`)).rows;
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0].after_state)).not.toContain('lost his job'); // the family's words stay in the follow-up
  });

  it('the database: a follow-up is never edited, a closed one stays closed, and nobody writes one in another name', async () => {
    expect(await refused(() => as(accountant, (c) => c.query(`update fee_followups set note = 'changed' where kind = 'hardship'`)))).toMatch(/never edited/);
    expect(await refused(() => as(accountant, (c) => c.query(`update fee_followups set status = 'open', closed_by = null, closed_at = null where kind = 'promise' and status = 'closed'`)))).toMatch(/stays closed/);
    expect(await refused(() => as(accountant, (c) => c.query(`delete from fee_followups`)))).toMatch(/permission denied/);
    expect(await refused(() => as(accountant, (c) => c.query(`insert into fee_followups (school_id, student_id, kind, note, status, created_by) values ($1, $2, 'call', 'x', 'closed', $3)`, [A, sid(3), PRINCIPAL])))).toMatch(/row-level security/);
    expect((await as(teacher, (c) => c.query(`select 1 from fee_followups`))).rows).toHaveLength(0);
    expect((await as(other, (c) => c.query(`select 1 from fee_followups`))).rows).toHaveLength(0);
  });

  it('the refund list: money that could not be applied; given back by hand, recorded once, in full, by the office', async () => {
    // Chetan owes ₹700 and ₹1,000 arrives on his link: ₹300 cannot be applied.
    const link = (await as(accountant, (c) => createPaymentLink(c, actor(accountant), { studentId: sid(3), amountMinor: null }))).link;
    await as(principal, async (c) => {
      const row = (await c.query(`select link_id, school_id, family_id, student_id, status, amount_minor from payment_links where link_id = $1 for update`, [link.linkId])).rows[0];
      return creditEvidence(c, { source: 'school_confirmed', externalId: `${A}:700000000001`, amountMinor: 100000, link: row, rule: 'A', decidedBy: PRINCIPAL, via: 'school', receipt: { method: 'upi', gateway: null, gatewayPaymentId: null, issuedBy: PRINCIPAL, reference: 'UTR 700000000001' } });
    });
    const owed = await as(accountant, (c) => refundList(c, A));
    expect(owed).toEqual([expect.objectContaining({ payer: 'Chetan', amount_minor: 30000, refunded_on: null, receipt_no: expect.any(String) })]);
    expect((await list()).map((r: { payer: string }) => r.payer)).toEqual(['FAM-1 · Asha']); // Chetan owes nothing now
    const id = owed[0].evidence_id as string;
    expect(await as(accountant, (c) => recordRefund(c, actor(accountant), id, 'NEFT ref 123', today))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principal, (c) => recordRefund(c, actor(principal), id, '', today))).toEqual({ ok: false, reason: 'how' });
    expect(await as(principal, (c) => recordRefund(c, actor(principal), id, 'NEFT ref 123', ahead(2)))).toEqual({ ok: false, reason: 'date' });
    expect(await as(other, (c) => recordRefund(c, actor(other), id, 'NEFT ref 123', today))).toEqual({ ok: false, reason: 'not_found' });
    expect(await as(principal, (c) => recordRefund(c, actor(principal), id, 'NEFT ref 123 to the father', today))).toEqual({ ok: true });
    expect(await as(principal, (c) => recordRefund(c, actor(principal), id, 'again', today))).toEqual({ ok: false, reason: 'already_recorded' });
    expect(await as(accountant, (c) => refundList(c, A))).toEqual([expect.objectContaining({ refunded_on: today, how: 'NEFT ref 123 to the father', recorded_by: 'Priya Principal' })]);
    // The database: never a part, never more, never changed.
    await db.pg.exec(`set session_replication_role = replica; delete from fee_refunds; set session_replication_role = origin;`);
    expect(await refused(() => as(principal, (c) => c.query(`insert into fee_refunds (school_id, evidence_id, amount_minor, how, refunded_on, recorded_by) values ($1, $2, 10000, 'part', current_date, $3)`, [A, id, PRINCIPAL])))).toMatch(/whole amount/);
    expect(await as(principal, (c) => recordRefund(c, actor(principal), id, 'NEFT ref 123 to the father', today))).toEqual({ ok: true });
    expect(await refused(() => as(principal, (c) => c.query(`update fee_refunds set how = 'x'`)))).toMatch(/permission denied/);
    expect(await refused(() => as(principal, (c) => c.query(`delete from fee_refunds`)))).toMatch(/permission denied/);
  });
});
