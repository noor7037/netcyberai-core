import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { decideConcession, listConcessions, proposeConcession, setRteTag } from '@/lib/fees/concessions';
import { duesFor, duesThatDoNotAddUp, lineAmounts, percentOfMinor, periodKeyFor, periodKeysIn, raiseDues } from '@/lib/fees/dues';
import { getReceipt, openDues, takePayment } from '@/lib/fees/payments';
import { addHead, addStructureVersion, listHeads, setHeadRteCovered } from '@/lib/fees/structures';

// Raising dues, concessions and the RTE tag (docs/23 6b, C159): the
// arithmetic with no database, then the whole real schema as app_user.

describe('the arithmetic', () => {
  it('a percentage is rounded half up to the paisa, once, in whole numbers', () => {
    // 12.5% of ₹1,500.50 (150050 paise) is 18756.25 → 18756. 33.33% of ₹100.01 (10001) is 3333.3333 → 3333.
    expect(percentOfMinor(150050, 12.5)).toBe(18756);
    expect(percentOfMinor(10001, 33.33)).toBe(3333);
    // Exactly half a paisa goes up: 50% of 1 paisa is 0.5 → 1; 2.5% of 20 paise is 0.5 → 1.
    expect(percentOfMinor(1, 50)).toBe(1);
    expect(percentOfMinor(20, 2.5)).toBe(1);
    expect(percentOfMinor(150000, 100)).toBe(150000);
    expect(percentOfMinor(0, 50)).toBe(0);
  });

  it('gross − concession = net on every line; concessions together never take more than the gross', () => {
    const c = (kind: string, percentOff: number | null, amountOffMinor: number | null) => ({ concessionId: kind, kind, percentOff, amountOffMinor });
    expect(lineAmounts(150000, [], false)).toEqual({ grossMinor: 150000, concessionMinor: 0, netMinor: 150000, detail: [] });
    // 10% sibling (15000) then a ₹200 scholarship (20000): 35000 off, 115000 to pay.
    expect(lineAmounts(150000, [c('scholarship', null, 20000), c('sibling', 10, null)], false)).toEqual({ grossMinor: 150000, concessionMinor: 35000, netMinor: 115000, detail: [{ kind: 'sibling', minor: 15000, concessionId: 'sibling' }, { kind: 'scholarship', minor: 20000, concessionId: 'scholarship' }] });
    // Two 60% concessions cannot take 120%: the second takes what is left.
    expect(lineAmounts(100000, [c('staff_ward', 60, null), c('hardship', 60, null)], false)).toMatchObject({ concessionMinor: 100000, netMinor: 0, detail: [{ kind: 'staff_ward', minor: 60000 }, { kind: 'hardship', minor: 40000 }] });
    // RTE takes the whole head; nothing is left for another concession to take.
    expect(lineAmounts(150000, [c('sibling', 10, null)], true)).toEqual({ grossMinor: 150000, concessionMinor: 150000, netMinor: 0, detail: [{ kind: 'rte', minor: 150000, concessionId: null }] });
    for (const [gross, list] of [[150050, [c('a', 12.5, null), c('b', 33.33, null), c('c', null, 999)]], [1, [c('a', 50, null), c('b', 50, null)]]] as const) {
      const a = lineAmounts(gross, list, false);
      expect(a.grossMinor - a.concessionMinor).toBe(a.netMinor);
      expect(a.detail.reduce((t, d) => t + d.minor, 0)).toBe(a.concessionMinor);
      expect(a.netMinor).toBeGreaterThanOrEqual(0);
    }
  });

  it('which period of a head falls due in a month, counted from the session’s first month', () => {
    const s = { label: '2026-27', start_date: '2026-04-01', end_date: '2027-03-31' };
    expect(['2026-04', '2026-05', '2026-07', '2026-10', '2027-03'].map((m) => periodKeyFor('monthly', m, s))).toEqual(['2026-04', '2026-05', '2026-07', '2026-10', '2027-03']);
    expect(['2026-04', '2026-05', '2026-07', '2026-10', '2027-01'].map((m) => periodKeyFor('quarterly', m, s))).toEqual(['2026-27-Q1', null, '2026-27-Q2', '2026-27-Q3', '2026-27-Q4']);
    expect(['2026-04', '2026-10', '2026-07'].map((m) => periodKeyFor('half_yearly', m, s))).toEqual(['2026-27-H1', '2026-27-H2', null]);
    expect(['2026-04', '2026-05'].map((m) => periodKeyFor('annual', m, s))).toEqual(['2026-27', null]);
    expect(['2026-04', '2026-05'].map((m) => periodKeyFor('one_time', m, s))).toEqual(['once', null]);
    expect(['2026-03', '2027-04', '2026-13', 'April'].map((m) => periodKeyFor('monthly', m, s))).toEqual([null, null, null, null]);
    expect(periodKeysIn('2026-10', s)).toEqual(['2026-10', '2026-27-Q3', '2026-27-H2']);
  });
});

const A = 'ae000000-0000-4000-8000-000000000001';
const B = 'ae000000-0000-4000-8000-000000000002';
const PRINCIPAL = 'ae000000-0000-4000-8000-0000000000a1';
const ACCOUNTANT = 'ae000000-0000-4000-8000-0000000000a2';
const TEACHER = 'ae000000-0000-4000-8000-0000000000a3';
const ADMIN = 'ae000000-0000-4000-8000-0000000000a4';
const PRINCIPAL_B = 'ae000000-0000-4000-8000-0000000000b1';
const C5 = 'ae000000-0000-4000-8000-0000000000c1';
const C6 = 'ae000000-0000-4000-8000-0000000000c2';
const SESSION = 'ae000000-0000-4000-8000-0000000000e1';
const sid = (n: number) => `ae000000-0000-4000-8000-0000005000${String(n).padStart(2, '0')}`;
const S = { asha: sid(1), bilal: sid(2), chitra: sid(3), left: sid(4), waiting: sid(6), gita: sid(7) };
const TODAY = '2026-07-05';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const admin: Who = { role: 'school_admin', user: ADMIN, school: A };
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const q = (who: Who, fn: (client: any) => Promise<any>): Promise<any> => as(who, fn);
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
let tuition = '';
let transport = '';
let admission = '';
const raise = (who: Who, month: string, dueDate = `${month}-10`) => as(who, (c) => raiseDues(c, actor(who), { classId: C5, sessionId: SESSION, month, dueDate }));
const lines = async (month: string) => (await db.pg.query(`select st.name, h.name as head, l.period_key, l.gross_minor::int as gross, l.concession_minor::int as concession, l.amount_minor::int as net, l.status::text as status, l.concession_detail as detail from fees_ledger l join students st using (student_id) join fee_heads h using (head_id) where l.school_id = $1 and (l.period_key = $2 or (l.period_key = 'once' and $2 = '2026-04')) order by st.name, h.name`, [A, month])).rows;
const propose = (who: Who, studentId: string, more: object) => as(who, (c) => proposeConcession(c, actor(who), { studentId, headId: null, kind: 'sibling', percentOff: 10, amountOffMinor: null, reason: 'Second child of the family', validFrom: '2026-04-01', validTo: null, ...more }));

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${ADMIN}', '${A}', 'ad@a.invalid', 'school_admin', 'Admin A'), ('${ACCOUNTANT}', '${A}', 'acc@a.invalid', 'accountant', 'Accountant A'),
        ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Teacher A'), ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', 'principal', 'Principal B');
      insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5}', '${A}', '5-A', '${TEACHER}');
      insert into students (student_id, school_id, admission_no, name, class_id) values
        ('${S.asha}', '${A}', 'A-1', 'Asha', '${C5}'), ('${S.bilal}', '${A}', 'A-2', 'Bilal', '${C5}'), ('${S.chitra}', '${A}', 'A-3', 'Chitra', '${C5}');
      insert into students (student_id, school_id, admission_no, name, class_id, status) values ('${S.left}', '${A}', 'A-4', 'Left', '${C5}', 'transferred');
      insert into students (student_id, school_id, admission_no, name, class_id, status) values ('${sid(5)}', '${A}', 'A-5', 'Inactive', '${C5}', 'inactive');
      insert into classes (class_id, school_id, name) values ('${C6}', '${A}', '6-A');
      insert into students (student_id, school_id, admission_no, name, class_id) values ('${S.waiting}', '${A}', 'A-6', 'Waiting', '${C6}'), ('${S.gita}', '${A}', 'A-7', 'Gita', '${C6}');
      alter table students disable trigger user;
      update students set status = 'active' where student_id in ('${S.asha}', '${S.bilal}', '${S.chitra}', '${S.gita}');
      alter table students enable trigger user;
    `);
    const head = async (name: string, isMandatory: boolean) => {
      const r = await as(accountant, (c) => addHead(c, actor(accountant), { name, isMandatory }));
      if (!r.ok) throw new Error('head');
      return r.head.head_id;
    };
    tuition = await head('Tuition', true);
    transport = await head('Transport', false);
    admission = await head('Admission', true);
    // April: tuition 1,500.50 a month, transport 800 a month, admission 5,000 once. From July tuition is 1,650.
    await as(accountant, (c) => addStructureVersion(c, actor(accountant), { classId: C5, sessionId: SESSION, effectiveFrom: '2026-04-01', items: [{ headId: tuition, amountMinor: 150050, frequency: 'monthly' }, { headId: transport, amountMinor: 80000, frequency: 'monthly' }, { headId: admission, amountMinor: 500000, frequency: 'one_time' }] }));
    await as(accountant, (c) => addStructureVersion(c, actor(accountant), { classId: C5, sessionId: SESSION, effectiveFrom: '2026-07-01', items: [{ headId: tuition, amountMinor: 165000, frequency: 'monthly' }, { headId: transport, amountMinor: 80000, frequency: 'monthly' }, { headId: admission, amountMinor: 500000, frequency: 'one_time' }] }));
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it('raising a month makes one line per student and head due, from the structure in force; raising it twice makes no second line', async () => {
    const first = await raise(accountant, '2026-04');
    // 3 students × (tuition + transport + admission) = 9 lines; gross 3 × (1,500.50 + 800 + 5,000) = 21,901.50
    expect(first).toEqual({ ok: true, raised: 9, alreadyThere: 0, students: 3, grossMinor: 2190150, concessionMinor: 0, netMinor: 2190150 });
    expect(await raise(principal, '2026-04')).toMatchObject({ ok: true, raised: 0, alreadyThere: 9 });
    expect((await lines('2026-04')).map((l: { name: string; head: string; period_key: string; net: number; status: string }) => [l.name, l.head, l.period_key, l.net, l.status]).slice(0, 3)).toEqual([['Asha', 'Admission', 'once', 500000, 'pending'], ['Asha', 'Transport', '2026-04', 80000, 'pending'], ['Asha', 'Tuition', '2026-04', 150050, 'pending']]);
    // May: the one-time head is not due again. A student who has left has no line.
    expect(await raise(accountant, '2026-05')).toMatchObject({ raised: 6, grossMinor: 3 * (150050 + 80000) });
    expect((await db.pg.query(`select 1 from fees_ledger where student_id = any($1::uuid[])`, [[S.left, sid(5)]])).rows).toEqual([]); // left the school; inactive
    // Whoever raises, the result is the same.
    expect(await raise(principal, '2026-05')).toMatchObject({ raised: 0, alreadyThere: 6, students: 3 });
    expect((await db.pg.query(`select event_action, after_state->>'lines' as lines from audit_log where school_id = $1 and event_action = 'fees.dues_raised' order by audit_id`, [A])).rows).toEqual([{ event_action: 'fees.dues_raised', lines: '9' }, { event_action: 'fees.dues_raised', lines: '6' }]);
  });

  it('an unapproved concession changes nothing; approved, it applies to dues raised afterwards and never to those already raised', async () => {
    const proposed = await propose(accountant, S.bilal, {});
    expect(proposed).toMatchObject({ ok: true });
    if (!proposed.ok) throw new Error('unreachable');
    expect(await raise(accountant, '2026-06')).toMatchObject({ raised: 6, concessionMinor: 0 });
    // The accountant cannot approve; nor can the person who proposed it approve their own.
    expect(await as(accountant, (c) => decideConcession(c, actor(accountant), proposed.concessionId, 'approve', TODAY))).toEqual({ ok: false, reason: 'not_allowed' });
    const own = await propose(principal, S.chitra, { kind: 'scholarship', percentOff: null, amountOffMinor: 20000, headId: tuition, reason: 'Merit scholarship' });
    if (!own.ok) throw new Error('unreachable');
    expect(await as(principal, (c) => decideConcession(c, actor(principal), own.concessionId, 'approve', TODAY))).toEqual({ ok: false, reason: 'own_proposal' });
    expect(await as(admin, (c) => decideConcession(c, actor(admin), own.concessionId, 'approve', TODAY))).toMatchObject({ ok: true });
    expect(await as(principal, (c) => decideConcession(c, actor(principal), proposed.concessionId, 'approve', TODAY))).toMatchObject({ ok: true });

    // July, from the new structure (tuition 1,650): Bilal 10% off every head; Chitra ₹200 off tuition only.
    const july = await raise(accountant, '2026-07');
    // By hand: gross 3 × (1,650 + 800) = 7,350. Bilal: 165 + 80 = 245 off. Chitra: 200 off. Concession 445; net 6,905.
    expect(july).toEqual({ ok: true, raised: 6, alreadyThere: 0, students: 3, grossMinor: 735000, concessionMinor: 44500, netMinor: 690500 });
    expect((await lines('2026-07')).map((l: { name: string; head: string; gross: number; concession: number; net: number }) => [l.name, l.head, l.gross, l.concession, l.net])).toEqual([
      ['Asha', 'Transport', 80000, 0, 80000], ['Asha', 'Tuition', 165000, 0, 165000],
      ['Bilal', 'Transport', 80000, 8000, 72000], ['Bilal', 'Tuition', 165000, 16500, 148500],
      ['Chitra', 'Transport', 80000, 0, 80000], ['Chitra', 'Tuition', 165000, 20000, 145000],
    ]);
    // June, raised before the approval, is untouched.
    expect((await lines('2026-06')).every((l: { concession: number }) => l.concession === 0)).toBe(true);
    expect((await as(principal, (c) => listConcessions(c, A))).map((c) => [c.student_name, c.kind, c.status]).sort()).toEqual([['Bilal', 'sibling', 'approved'], ['Chitra', 'scholarship', 'approved']]);
  });

  it('an RTE child’s mandatory heads are raised and conceded in full as rte; an optional head is not; only the office sets the tag', async () => {
    expect(await as(accountant, (c) => setRteTag(c, actor(accountant), { studentId: S.asha, rte: true, entryClass: '1', admittedOn: '2022-04-01' }))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principal, (c) => setRteTag(c, actor(principal), { studentId: S.asha, rte: true, entryClass: null, admittedOn: null }))).toEqual({ ok: false, reason: 'details' });
    expect(await as(principal, (c) => setRteTag(c, actor(principal), { studentId: S.asha, rte: true, entryClass: '1', admittedOn: '2022-04-01' }))).toEqual({ ok: true });
    // A teacher may update an own-class student, but not the RTE tag: the database refuses.
    await expect(as(teacher, (c) => c.query(`update students set rte_admission = false where student_id = $1`, [S.asha]))).rejects.toThrow(/RTE tag/);
    await raise(accountant, '2026-08');
    const asha = (await lines('2026-08')).filter((l: { name: string }) => l.name === 'Asha');
    expect(asha.map((l: { head: string; gross: number; concession: number; net: number; status: string }) => [l.head, l.gross, l.concession, l.net, l.status])).toEqual([['Transport', 80000, 0, 80000, 'pending'], ['Tuition', 165000, 165000, 0, 'waived']]);
    expect(asha[1].detail).toEqual([{ kind: 'rte', minor: 165000, concessionId: null }]);
    // What RTE covers can be counted for the claim desk later.
    expect((await db.pg.query(`select sum((d->>'minor')::bigint)::int as rte from fees_ledger l, jsonb_array_elements(l.concession_detail) d where l.school_id = $1 and d->>'kind' = 'rte'`, [A])).rows[0].rte).toBe(165000);
    expect((await db.pg.query(`select event_action, actor_user_id from audit_log where school_id = $1 and event_action = 'student.rte_tagged'`, [A])).rows).toEqual([{ event_action: 'student.rte_tagged', actor_user_id: PRINCIPAL }]);
  });

  it('ending a concession stops it for later dues and leaves raised dues alone; a concession is never deleted', async () => {
    const bilal = (await as(principal, (c) => listConcessions(c, A))).find((c) => c.student_name === 'Bilal')!;
    expect(await as(principal, (c) => decideConcession(c, actor(principal), bilal.concession_id, 'end', '2026-08-20'))).toMatchObject({ ok: true });
    await raise(accountant, '2026-09');
    expect((await lines('2026-09')).filter((l: { name: string }) => l.name === 'Bilal').map((l: { concession: number }) => l.concession)).toEqual([0, 0]);
    expect((await lines('2026-08')).filter((l: { name: string }) => l.name === 'Bilal').map((l: { concession: number }) => l.concession)).toEqual([8000, 16500]);
    await expect(as(principal, (c) => c.query(`delete from fee_concessions`))).rejects.toThrow(/permission denied/);
    await expect(as(principal, (c) => c.query(`delete from fees_ledger`))).rejects.toThrow(/permission denied/);
  });

  it('every line adds up, by the one reconciliation query, and the database refuses a line that does not', async () => {
    expect(await as(accountant, (c) => duesThatDoNotAddUp(c, A))).toEqual([]);
    const totals = (await db.pg.query(`select sum(gross_minor)::bigint as g, sum(concession_minor)::bigint as c, sum(amount_minor)::bigint as n from fees_ledger where school_id = $1`, [A])).rows[0];
    expect(Number(totals.g) - Number(totals.c)).toBe(Number(totals.n));
    await expect(db.pg.query(`insert into fees_ledger (school_id, student_id, head_id, period_key, gross_minor, concession_minor, amount_minor, due_date) values ($1, $2, $3, '2027-01', 1000, 100, 950, '2027-01-10')`, [A, S.asha, tuition])).rejects.toThrow(/fees_ledger_adds_up/);
    await expect(db.pg.query(`insert into fees_ledger (school_id, student_id, head_id, period_key, gross_minor, concession_minor, amount_minor, due_date) values ($1, $2, $3, '2026-04', 150050, 0, 150050, '2026-04-10')`, [A, S.asha, tuition])).rejects.toThrow(/fees_ledger_one_per_student_head_period/);
    // An older caller that gives only the net still works: nothing was conceded.
    await db.pg.query(`insert into fees_ledger (school_id, student_id, amount_minor, due_date) values ($1, $2, 12300, '2026-04-10')`, [A, S.asha]);
    expect((await db.pg.query(`select gross_minor::int as g, concession_minor::int as c from fees_ledger where amount_minor = 12300`)).rows).toEqual([{ g: 12300, c: 0 }]);
  });

  it('a child still waiting for consent is billed like any other, and the fee desk reads only the billing fields (C162)', async () => {
    // The consent gate still hides the waiting child's record from the accountant.
    expect((await q(accountant, (c) => c.query(`select name from students where class_id = $1 order by name`, [C6]))).rows).toEqual([{ name: 'Gita' }]);
    // The billing function gives the fee desk the few fields it needs, whatever the status: no phone, address, birth date or documents.
    const billing = await q(accountant, (c) => c.query(`select * from fee_billing_students() where class_id = $1 order by name`, [C6]));
    expect(billing.rows.map((r: { name: string; status: string }) => [r.name, r.status])).toEqual([['Gita', 'active'], ['Waiting', 'pending_consent']]);
    expect(billing.fields.map((f: { name: string }) => f.name).sort()).toEqual(['class_id', 'family_id', 'name', 'rte_admission', 'school_id', 'status', 'student_id']);
    expect((await q(accountant, (c) => c.query(`select name from fee_billing_students() where status in ('inactive', 'transferred') order by name`))).rows).toEqual([{ name: 'Inactive' }, { name: 'Left' }]);
    // Nobody else gets a row from it: not a teacher, not another school, not a caller with no school set.
    for (const who of [teacher, principalB, { role: 'accountant', user: ACCOUNTANT, school: B }, { role: 'parent', user: TEACHER, school: A }]) expect((await q(who, (c) => c.query(`select 1 from fee_billing_students() where school_id = $1`, [A]))).rows, who.role).toEqual([]);
    // (test/db/grants.test.ts: anon and authenticated cannot call any function in public.)

    await as(accountant, (c) => addStructureVersion(c, actor(accountant), { classId: C6, sessionId: SESSION, effectiveFrom: '2026-04-01', items: [{ headId: tuition, amountMinor: 200000, frequency: 'monthly' }] }));
    const raiseC6 = (who: Who) => as(who, (c) => raiseDues(c, actor(who), { classId: C6, sessionId: SESSION, month: '2026-06', dueDate: '2026-06-10' }));
    // Raised by the accountant, who cannot see the waiting child's record: both children get a line.
    expect(await raiseC6(accountant)).toEqual({ ok: true, raised: 2, alreadyThere: 0, students: 2, grossMinor: 400000, concessionMinor: 0, netMinor: 400000 });
    expect(await raiseC6(principal)).toMatchObject({ raised: 0, alreadyThere: 2, students: 2 });
    expect((await as(accountant, (c) => duesFor(c, A, C6, ['2026-06']))).map((l) => [l.student_name, l.net_minor])).toEqual([['Gita', 200000], ['Waiting', 200000]]);
    // The counter can take the waiting child's money and propose a concession for them.
    expect((await as(accountant, (c) => openDues(c, A, S.waiting, 'student'))).map((d) => [d.student_name, d.balance_minor])).toEqual([['Waiting', 200000]]);
    const paid = await as(accountant, (c) => takePayment(c, actor(accountant), { studentId: S.waiting, scope: 'student', amountMinor: 50000, method: 'cash', reference: null, allocations: null }));
    expect(paid).toMatchObject({ ok: true, replayed: false });
    expect((await as(accountant, (c) => openDues(c, A, S.waiting, 'student')))[0].balance_minor).toBe(150000);
    expect(paid.ok && (await as(accountant, (c) => getReceipt(c, A, paid.receiptId)))?.student_name).toBe('Waiting');
    expect(await propose(accountant, S.waiting, {})).toMatchObject({ ok: true });
    // A child who has left or is inactive is still not billed.
    expect((await db.pg.query(`select 1 from fees_ledger where student_id = any($1::uuid[])`, [[S.left, sid(5)]])).rows).toEqual([]);
  });

  it('RTE covers the heads marked as covered: a new head follows "every child pays it", then the two are set apart (C162)', async () => {
    const flags = async () => Object.fromEntries((await as(accountant, (c) => listHeads(c, A))).map((h) => [h.name, [h.is_mandatory, h.rte_covered]]));
    expect(await flags()).toEqual({ Admission: [true, true], Transport: [false, false], Tuition: [true, true] });
    // A head added without saying (an import, an older caller) takes its mandatory flag.
    await db.pg.query(`insert into fee_heads (school_id, name, is_mandatory) values ($1, 'Exam', true), ($1, 'Trip', false)`, [A]);
    expect(await flags()).toMatchObject({ Exam: [true, true], Trip: [false, false] });
    // The school covers transport for RTE children and charges them the (mandatory) admission head.
    expect(await as(teacher, (c) => setHeadRteCovered(c, actor(teacher), transport, true))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(accountant, (c) => setHeadRteCovered(c, actor(accountant), transport, true))).toMatchObject({ ok: true, head: { is_mandatory: false, rte_covered: true } });
    expect(await as(accountant, (c) => setHeadRteCovered(c, actor(accountant), tuition, false))).toMatchObject({ ok: true, head: { is_mandatory: true, rte_covered: false } });
    expect(await as(accountant, (c) => setHeadRteCovered(c, actor(accountant), tuition, false))).toMatchObject({ ok: true }); // no change, no second audit row
    expect((await db.pg.query(`select count(*)::int as n from audit_log where school_id = $1 and event_action = 'fees.head_rte_covered_changed'`, [A])).rows[0].n).toBe(2);
    await raise(accountant, '2026-11');
    const asha = (await lines('2026-11')).filter((l: { name: string }) => l.name === 'Asha');
    expect(asha.map((l: { head: string; concession: number; net: number; status: string }) => [l.head, l.concession, l.net, l.status])).toEqual([['Transport', 80000, 0, 'waived'], ['Tuition', 0, 165000, 'pending']]);
    // Dues raised earlier keep what they were raised with.
    expect((await lines('2026-08')).filter((l: { name: string }) => l.name === 'Asha').map((l: { head: string; net: number }) => [l.head, l.net])).toEqual([['Transport', 80000], ['Tuition', 0]]);
    expect(await as(accountant, (c) => duesThatDoNotAddUp(c, A))).toEqual([]);
  });

  it('refusals: a month outside the session, a due date before the month, no structure, and anyone but the finance roles', async () => {
    expect(await raise(accountant, '2026-03')).toEqual({ ok: false, reason: 'month_outside_session' });
    expect(await raise(accountant, '2026-10', '2026-09-30')).toEqual({ ok: false, reason: 'due_date' });
    expect(await raise(accountant, '2026-10', '2027-02-01')).toEqual({ ok: false, reason: 'due_date' });
    expect(await raise(teacher, '2026-10')).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await propose(teacher, S.asha, {})).toEqual({ ok: false, reason: 'not_allowed' });
    for (const bad of [{ percentOff: 0 }, { percentOff: 101 }, { percentOff: 12.345 }, { percentOff: 10, amountOffMinor: 100 }, { percentOff: null, amountOffMinor: null }, { percentOff: null, amountOffMinor: 10.5 }]) expect(await propose(accountant, S.asha, bad), JSON.stringify(bad)).toEqual({ ok: false, reason: 'measure' });
    expect(await propose(accountant, S.asha, { reason: '  ' })).toEqual({ ok: false, reason: 'reason' });
    expect(await propose(accountant, S.asha, { validTo: '2026-03-01' })).toEqual({ ok: false, reason: 'dates' });
  });

  it('a teacher reads no dues, payments or concessions, and another school reads none of this school’s', async () => {
    for (const table of ['fees_ledger', 'payments', 'fee_concessions']) {
      expect(await as(teacher, (c) => c.query(`select 1 from ${table}`).then((r: { rows: unknown[] }) => r.rows)), table).toEqual([]);
      expect(await as(principalB, (c) => c.query(`select 1 from ${table}`).then((r: { rows: unknown[] }) => r.rows)), table).toEqual([]);
    }
    expect((await as(accountant, (c) => duesFor(c, A, C5, ['2026-07']))).length).toBe(6);
    await expect(as(teacher, (c) => c.query(`insert into fees_ledger (school_id, student_id, amount_minor, due_date) values ($1, $2, 100, '2026-04-10')`, [A, S.asha]))).rejects.toThrow(/row-level security/);
  });
});
