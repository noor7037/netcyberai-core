import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { saveSettings } from '@/lib/frameworks/settings-store';
import { decideConcession, listConcessions } from '@/lib/fees/concessions';
import { lineAmounts, percentOfMinor, raiseDues } from '@/lib/fees/dues';
import { byChild, cancelPaymentLink, createPaymentLink, familyDues, openLink, splitAcrossChildren } from '@/lib/fees/family';
import type { OpenDue } from '@/lib/fees/payments';
import { applySiblingRule, ruleCovers, siblingRule } from '@/lib/fees/sibling';
import { addHead, addStructureVersion } from '@/lib/fees/structures';

// The sibling rule, the family's dues and one payment link per family
// (docs/23 6e, C168): the arithmetic with no database, then the whole real
// schema as the app's role.

describe('who the sibling rule covers', () => {
  const younger = { percent: 10, child: 'younger' as const, mandatoryOnly: true };
  const third = { percent: 10, child: 'third_onwards' as const, mandatoryOnly: true };
  it('every child after the eldest, or the third child onwards; never an only child', () => {
    expect([1, 2, 3].map((rank) => ruleCovers(younger, rank, 3))).toEqual([false, true, true]);
    expect([1, 2, 3, 4].map((rank) => ruleCovers(third, rank, 4))).toEqual([false, false, true, true]);
    expect(ruleCovers(younger, 1, 1)).toBe(false);
    expect(ruleCovers(younger, 2, 1)).toBe(false); // the others have left: nobody is a sibling on the rolls
  });
});

describe('the split of one amount across a family’s children', () => {
  const due = (fee: string, child: string, due_date: string, balance: number): OpenDue => ({ fee_id: fee, student_id: child, student_name: child, head_name: 'Tuition', period_key: due_date.slice(0, 7), is_late_fee: false, overdue: false, due_date, net_minor: balance, paid_minor: 0, balance_minor: balance });
  // Oldest first: Asha April 1,350.45; Bilal April 1,500.50; Asha May 1,350.45; Chitra May 999.99.
  const dues = [due('a-apr', 'asha', '2026-04-10', 135045), due('b-apr', 'bilal', '2026-04-10', 150050), due('a-may', 'asha', '2026-05-10', 135045), due('c-may', 'chitra', '2026-05-10', 99999)];

  it('everything owed: each child’s share is exactly what that child owes, and the shares add up to the amount', () => {
    const all = splitAcrossChildren(520139, dues);
    expect(all.perChild).toEqual([{ studentId: 'asha', amountMinor: 270090 }, { studentId: 'bilal', amountMinor: 150050 }, { studentId: 'chitra', amountMinor: 99999 }]);
    expect(all.totalMinor).toBe(520139);
    expect(byChild(dues).map((c) => [c.studentId, c.owedMinor])).toEqual([['asha', 270090], ['bilal', 150050], ['chitra', 99999]]);
  });

  it('a part amount goes to the oldest due first, whoever’s it is, to the paisa', () => {
    // 3,000.00: Asha April in full (1,350.45), Bilal April in full (1,500.50), then 149.05 of Asha's May.
    const part = splitAcrossChildren(300000, dues);
    expect(part.lines).toEqual([{ feeId: 'a-apr', studentId: 'asha', amountMinor: 135045 }, { feeId: 'b-apr', studentId: 'bilal', amountMinor: 150050 }, { feeId: 'a-may', studentId: 'asha', amountMinor: 14905 }]);
    expect(part.perChild).toEqual([{ studentId: 'asha', amountMinor: 149950 }, { studentId: 'bilal', amountMinor: 150050 }]);
  });

  it('for every amount from one paisa to everything, no paisa is lost or made', () => {
    for (const amount of [1, 99, 135045, 135046, 285095, 420140, 520138, 520139]) {
      const s = splitAcrossChildren(amount, dues);
      expect(s.totalMinor, String(amount)).toBe(amount);
      expect(s.perChild.reduce((t, c) => t + c.amountMinor, 0), String(amount)).toBe(amount);
      expect(s.lines.every((l) => Number.isInteger(l.amountMinor) && l.amountMinor > 0)).toBe(true);
    }
    // More than is owed is never spread: the split stops at what is owed (the caller refuses it first).
    expect(splitAcrossChildren(999999999, dues).totalMinor).toBe(520139);
  });

  it('a sibling percentage is rounded once per line, half up; the family total is the sum of the rounded lines', () => {
    // 12.5% of 1,500.50 is 187.5625 → 187.56; of 800.01 is 100.00125 → 100.00; of 0.20 is 0.025 → 0.03.
    expect([150050, 80001, 20].map((gross) => percentOfMinor(gross, 12.5))).toEqual([18756, 10000, 3]);
    const lines = [150050, 80001, 20].map((gross) => lineAmounts(gross, [{ concessionId: 's', kind: 'sibling', percentOff: 12.5, amountOffMinor: null }], false));
    expect(lines.map((l) => l.netMinor)).toEqual([131294, 70001, 17]);
    expect(lines.reduce((t, l) => t + l.grossMinor, 0) - lines.reduce((t, l) => t + l.concessionMinor, 0)).toBe(lines.reduce((t, l) => t + l.netMinor, 0));
  });
});

const A = 'e1000000-0000-4000-8000-000000000001';
const B = 'e1000000-0000-4000-8000-000000000002';
const PRINCIPAL = 'e1000000-0000-4000-8000-0000000000a1';
const ACCOUNTANT = 'e1000000-0000-4000-8000-0000000000a2';
const TEACHER = 'e1000000-0000-4000-8000-0000000000a3';
const PRINCIPAL_B = 'e1000000-0000-4000-8000-0000000000b1';
const C5 = 'e1000000-0000-4000-8000-0000000000c1';
const SESSION = 'e1000000-0000-4000-8000-0000000000e1';
const FAMILY = 'e1000000-0000-4000-8000-0000000000d1';
const sid = (n: number) => `e1000000-0000-4000-8000-0000005000${String(n).padStart(2, '0')}`;
// One confirmed family: Asha (eldest, 2014), Bilal (2016), Chitra (2018). Dev and Esha share a surname but the
// office has not linked them: no family. Farah has no brother or sister.
const S = { asha: sid(1), bilal: sid(2), chitra: sid(3), dev: sid(4), esha: sid(5), farah: sid(6) };

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
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
const fees = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'fees')!;
let revision = 0;
const setRule = async (set: Record<string, string | number | boolean>) => {
  expect(await as(principal, (c) => saveSettings(c, actor(principal), fees, { moduleId: 'fees', baseRevision: revision, set }))).toMatchObject({ ok: true });
  revision += 1;
};
const sync = (who: Who = accountant) => as(who, (c) => applySiblingRule(c, actor(who), '2026-07-05'));
const raise = (month: string) => as(accountant, (c) => raiseDues(c, actor(accountant), { classId: C5, sessionId: SESSION, month, dueDate: `${month}-10` }));
const ruleRows = async () => (await db.pg.query(`select st.name, c.status, c.percent_off::float8 as percent, c.mandatory_only, c.source, c.valid_from::text as valid_from from fee_concessions c join students st using (student_id) where c.school_id = $1 order by st.name, c.created_at`, [A])).rows;
const lines = async (month: string) => (await db.pg.query(`select st.name, h.name as head, l.gross_minor::int as gross, l.concession_minor::int as concession, l.amount_minor::int as net from fees_ledger l join students st using (student_id) join fee_heads h using (head_id) where l.school_id = $1 and l.period_key = $2 order by st.name, h.name`, [A, month])).rows;

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${ACCOUNTANT}', '${A}', 'acc@a.invalid', 'accountant', 'Accountant A'),
        ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Teacher A'), ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', 'principal', 'Principal B');
      insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
      insert into classes (class_id, school_id, name) values ('${C5}', '${A}', '5-A');
      insert into families (family_id, school_id, family_code, created_by) values ('${FAMILY}', '${A}', 'FAM-1', '${PRINCIPAL}');
      insert into students (student_id, school_id, admission_no, name, class_id, family_id, dob) values
        ('${S.asha}', '${A}', 'A-1', 'Asha Rao', '${C5}', '${FAMILY}', '2014-03-01'), ('${S.bilal}', '${A}', 'A-2', 'Bilal Rao', '${C5}', '${FAMILY}', '2016-03-01'), ('${S.chitra}', '${A}', 'A-3', 'Chitra Rao', '${C5}', '${FAMILY}', '2018-03-01'),
        ('${S.dev}', '${A}', 'A-4', 'Dev Shah', '${C5}', null, '2014-01-01'), ('${S.esha}', '${A}', 'A-5', 'Esha Shah', '${C5}', null, '2016-01-01'), ('${S.farah}', '${A}', 'A-6', 'Farah Ali', '${C5}', null, '2015-01-01');
      alter table students disable trigger user;
      update students set status = 'active';
      alter table students enable trigger user;
    `);
    const head = async (name: string, isMandatory: boolean) => {
      const r = await as(accountant, (c) => addHead(c, actor(accountant), { name, isMandatory }));
      return r.head.head_id as string;
    };
    const tuition = await head('Tuition', true);
    const transport = await head('Transport', false);
    // Tuition 1,500.50 a month (so 12.5% does not land on a whole paisa), transport 800 a month.
    await as(accountant, (c) => addStructureVersion(c, actor(accountant), { classId: C5, sessionId: SESSION, effectiveFrom: '2026-04-01', items: [{ headId: tuition, amountMinor: 150050, frequency: 'monthly' }, { headId: transport, amountMinor: 80000, frequency: 'monthly' }] }));
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it('with no rule set, nothing is proposed; an amount with the switch off is still no rule', async () => {
    expect(await as(accountant, (c) => siblingRule(c, A))).toBeNull();
    expect(await sync()).toEqual({ proposed: 0, ended: 0 });
    await setRule({ sibling_percent: 12.5 });
    expect(await as(accountant, (c) => siblingRule(c, A))).toBeNull();
    expect(await sync()).toEqual({ proposed: 0, ended: 0 });
  });

  it('switched on: proposes for the younger children of a CONFIRMED family only, and nothing applies until a person approves', async () => {
    await setRule({ sibling_enabled: true });
    expect(await as(accountant, (c) => siblingRule(c, A))).toEqual({ percent: 12.5, child: 'younger', mandatoryOnly: true });
    expect(await sync()).toEqual({ proposed: 2, ended: 0 });
    // Bilal and Chitra, not Asha (the eldest); not Dev and Esha (never linked by the office); not Farah.
    expect(await ruleRows()).toEqual([
      { name: 'Bilal Rao', status: 'proposed', percent: 12.5, mandatory_only: true, source: 'rule', valid_from: '2026-07-01' },
      { name: 'Chitra Rao', status: 'proposed', percent: 12.5, mandatory_only: true, source: 'rule', valid_from: '2026-07-01' },
    ]);
    expect(await sync()).toEqual({ proposed: 0, ended: 0 }); // running it again proposes nothing twice
    // Raised while only proposed: nobody is conceded anything.
    await raise('2026-07');
    expect((await lines('2026-07')).every((l: { concession: number }) => l.concession === 0)).toBe(true);
    // A teacher cannot run it; another school's run touches nothing here.
    expect(await sync(teacher)).toEqual({ proposed: 0, ended: 0 });
    await as(principalB, (c) => applySiblingRule(c, actor(principalB), '2026-07-05'));
    expect((await ruleRows()).length).toBe(2);
  });

  it('once approved, it is taken off the heads every child pays, rounded half up to the paisa, and the family total is the sum of its children', async () => {
    for (const c of await as(principal, (cl) => listConcessions(cl, A))) expect(await as(principal, (cl) => decideConcession(cl, actor(principal), c.concession_id, 'approve', '2026-07-06'))).toMatchObject({ ok: true });
    await raise('2026-08');
    const august = await lines('2026-08');
    const of = (name: string) => august.filter((l: { name: string }) => l.name === name).map((l: { head: string; concession: number; net: number }) => [l.head, l.concession, l.net]);
    // 12.5% of 1,500.50 = 187.5625 → 187.56 off tuition; transport (optional) is untouched.
    expect(of('Bilal Rao')).toEqual([['Transport', 0, 80000], ['Tuition', 18756, 131294]]);
    expect(of('Chitra Rao')).toEqual([['Transport', 0, 80000], ['Tuition', 18756, 131294]]);
    expect(of('Asha Rao')).toEqual([['Transport', 0, 80000], ['Tuition', 0, 150050]]);
    expect(of('Esha Shah')).toEqual([['Transport', 0, 80000], ['Tuition', 0, 150050]]);
    // The family: July (no concession) and August for three children.
    const family = await as(accountant, (c) => familyDues(c, A, S.bilal));
    expect(family.familyCode).toBe('FAM-1');
    expect(family.children.map((c: { studentName: string; owedMinor: number }) => [c.studentName, c.owedMinor]).sort()).toEqual([['Asha Rao', 2 * 230050], ['Bilal Rao', 230050 + 211294], ['Chitra Rao', 230050 + 211294]]);
    expect(family.totalMinor).toBe(family.children.reduce((t: number, c: { owedMinor: number }) => t + c.owedMinor, 0));
    expect(family.totalMinor).toBe(460100 + 441344 + 441344);
    // A child with no family is their own total.
    expect((await as(accountant, (c) => familyDues(c, A, S.farah))).children.map((c: { studentName: string }) => c.studentName)).toEqual(['Farah Ali']);
  });

  it('one payment link per family: its lines fix, to the paisa, which due of which child the money is for', async () => {
    const whole = await as(accountant, (c) => createPaymentLink(c, actor(accountant), { studentId: S.chitra, amountMinor: null }));
    expect(whole).toMatchObject({ ok: true, created: true, link: { amountMinor: 1342788, status: 'open' } });
    const perChild = (link: { lines: { studentName: string; amountMinor: number }[] }) => Object.fromEntries(['Asha Rao', 'Bilal Rao', 'Chitra Rao'].map((n) => [n, link.lines.filter((l) => l.studentName === n).reduce((t, l) => t + l.amountMinor, 0)]));
    expect(perChild(whole.link)).toEqual({ 'Asha Rao': 460100, 'Bilal Rao': 441344, 'Chitra Rao': 441344 });
    expect(whole.link.lines.reduce((t: number, l: { amountMinor: number }) => t + l.amountMinor, 0)).toBe(1342788);
    expect(whole.link.token.length).toBeGreaterThanOrEqual(32);
    // Asked again from another child of the family, for the same amount: the same link, not a second one.
    expect(await as(principal, (c) => createPaymentLink(c, actor(principal), { studentId: S.asha, amountMinor: 1342788 }))).toMatchObject({ ok: true, created: false, link: { linkId: whole.link.linkId } });
    // Another amount while one is open is refused; the database holds the same rule.
    expect(await as(accountant, (c) => createPaymentLink(c, actor(accountant), { studentId: S.bilal, amountMinor: 100000 }))).toEqual({ ok: false, reason: 'link_exists' });
    await expect(db.pg.query(`insert into payment_links (school_id, family_id, student_id, token, amount_minor, created_by, expires_at) values ($1, $2, $3, $4, 100, $5, now() + interval '1 day')`, [A, FAMILY, S.asha, 'x'.repeat(40), PRINCIPAL])).rejects.toThrow(/payment_links_one_open_per_family/);

    expect(await as(accountant, (c) => cancelPaymentLink(c, actor(accountant), whole.link.linkId))).toEqual({ ok: true, cancelled: true });
    expect(await as(accountant, (c) => openLink(c, A, S.asha))).toBeNull();
    // A part amount: 5,000.00 goes to July's lines first, oldest first across the children.
    const part = await as(accountant, (c) => createPaymentLink(c, actor(accountant), { studentId: S.asha, amountMinor: 500000 }));
    expect(part).toMatchObject({ ok: true, created: true });
    expect(part.link.lines.reduce((t: number, l: { amountMinor: number }) => t + l.amountMinor, 0)).toBe(500000);
    const july = (await db.pg.query(`select count(*)::int as n from payment_link_lines n join fees_ledger l using (fee_id) where n.link_id = $1 and l.period_key <> '2026-07'`, [part.link.linkId])).rows[0].n;
    expect(july).toBe(0); // 5,000 is less than July's 6,901.50, so no August line is touched
    expect(perChild(part.link)['Asha Rao'] + perChild(part.link)['Bilal Rao'] + perChild(part.link)['Chitra Rao']).toBe(500000);
  });

  it('refusals: more than is owed, nothing owed, not the fee desk, another school; a link past its date is closed', async () => {
    expect(await as(accountant, (c) => createPaymentLink(c, actor(accountant), { studentId: S.farah, amountMinor: 999999999 }))).toEqual({ ok: false, reason: 'more_than_owed' });
    expect(await as(accountant, (c) => createPaymentLink(c, actor(accountant), { studentId: S.farah, amountMinor: 0 }))).toEqual({ ok: false, reason: 'amount' });
    expect(await as(teacher, (c) => createPaymentLink(c, actor(teacher), { studentId: S.farah, amountMinor: null }))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principalB, (c) => createPaymentLink(c, actor(principalB), { studentId: S.farah, amountMinor: null }))).toEqual({ ok: false, reason: 'unknown_student' });
    expect((await as(principalB, (c) => c.query(`select 1 from payment_links`))).rows).toEqual([]);
    expect((await as(teacher, (c) => c.query(`select 1 from payment_link_lines`))).rows).toEqual([]);
    await expect(as(principal, (c) => c.query(`delete from payment_links`))).rejects.toThrow(/permission denied/);
    const lone = await as(accountant, (c) => createPaymentLink(c, actor(accountant), { studentId: S.farah, amountMinor: null }));
    expect(lone).toMatchObject({ ok: true, link: { amountMinor: 2 * 230050 } });
    await db.pg.query(`update payment_links set expires_at = now() - interval '1 minute' where link_id = $1`, [lone.link.linkId]);
    expect(await as(accountant, (c) => openLink(c, A, S.farah))).toBeNull();
    expect((await db.pg.query(`select status from payment_links where link_id = $1`, [lone.link.linkId])).rows[0].status).toBe('expired');
  });

  it('when a brother or sister leaves, a child who no longer qualifies loses the concession from that day; raised dues stay', async () => {
    // Asha and Bilal leave: Chitra is the only Rao on the rolls, so she has no sibling there.
    await db.pg.exec(`alter table students disable trigger user; update students set status = 'transferred' where student_id in ('${S.asha}', '${S.bilal}'); alter table students enable trigger user;`);
    await raise('2026-09'); // raising brings the rule up to date first
    expect((await ruleRows()).map((r: { name: string; status: string }) => [r.name, r.status])).toEqual([['Bilal Rao', 'ended'], ['Chitra Rao', 'ended']]);
    expect((await lines('2026-09')).filter((l: { name: string }) => l.name === 'Chitra Rao').map((l: { head: string; concession: number }) => [l.head, l.concession])).toEqual([['Transport', 0], ['Tuition', 0]]);
    expect((await lines('2026-08')).filter((l: { name: string; head: string }) => l.name === 'Chitra Rao' && l.head === 'Tuition')[0].concession).toBe(18756);
    expect((await db.pg.query(`select count(*)::int as n from audit_log where school_id = $1 and event_action = 'fees.sibling_rule_applied'`, [A])).rows[0].n).toBe(2);
  });

  it('"the third child onwards" covers only the third; the date of birth never leaves the database', async () => {
    await db.pg.exec(`alter table students disable trigger user; update students set status = 'active' where student_id in ('${S.asha}', '${S.bilal}'); alter table students enable trigger user;`);
    await setRule({ sibling_child: 'third_onwards', sibling_heads: 'all' });
    expect(await sync()).toEqual({ proposed: 1, ended: 0 });
    expect((await ruleRows()).filter((r: { status: string }) => r.status === 'proposed')).toMatchObject([{ name: 'Chitra Rao', mandatory_only: false }]);
    const ranks = await as(accountant, (c) => c.query(`select * from fee_family_children() order by elder_rank`));
    expect(ranks.fields.map((f: { name: string }) => f.name).sort()).toEqual(['children', 'elder_rank', 'family_id', 'school_id', 'student_id']);
    expect(ranks.rows.map((r: { student_id: string; elder_rank: number }) => [r.student_id, r.elder_rank])).toEqual([[S.asha, 1], [S.bilal, 2], [S.chitra, 3]]);
    expect((await as(teacher, (c) => c.query(`select 1 from fee_family_children()`))).rows).toEqual([]);
    // Switched off: the open proposal is ended, and nothing more is proposed.
    await setRule({ sibling_enabled: false });
    expect(await sync()).toEqual({ proposed: 0, ended: 1 });
  });
});
