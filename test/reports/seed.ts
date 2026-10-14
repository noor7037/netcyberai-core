// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import type { SchoolEntitlements } from '@/lib/contracts/entitlements';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';
import { indiaDate } from '@/lib/time/india';

// One made-up school on the whole schema, for the reports' tests (docs/26
// slice 8h, C207). Every name and number here is invented. The comment
// beside each block says what the reports must make of it; the tests count
// the same rows by hand.

export const A = 'ae000000-0000-4000-8000-000000000001';
export const B = 'ae000000-0000-4000-8000-000000000002'; // another school: never in a report
// A third school that has only just begun: a principal, one class, one student. No fee was ever raised, no receipt
// issued, nothing marked. Its reports say "not set up" or "nothing in these days", never a zero.
export const C = 'ae000000-0000-4000-8000-000000000003';
const u = (n: number) => `ae000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const [PRINCIPAL, ADMIN, TARA, TARUN, ACCOUNTANT, COORDINATOR] = [u(11), u(12), u(13), u(14), u(15), u(16)];
export const [C5A, C6B, C7C] = [u(51), u(52), u(53)];
export const [PRINCIPAL_C, STUDENT_C] = [u(31), u(170)];
const MATHS = u(60);
// 5-A: Asha, Bela, Chirag, Dev (active), Esha (waiting for consent). 6-B: Farah, Gopal, Hina. Jaya: no class.
const [ASHA, BELA, CHIRAG, DEV, ESHA, FARAH, GOPAL, HINA, JAYA] = [u(101), u(102), u(103), u(104), u(105), u(106), u(107), u(108), u(110)];
const [G_ASHA, G_FARAH] = [u(201), u(206)];
// Asha and Farah are sisters: one family, in two classes. Gopal has no family on record. Dev and Hina are a
// second family.
const FAMILY = u(250);
const FAMILY_2 = u(251);

export const TODAY = indiaDate();
// India's date n days before today (negative: after).
export const day = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
// Ten in the morning in India on that day.
const at = (n: number) => `${day(n)}T10:00:00+05:30`;
// Ten past midnight in India on that day: still the day before by the clock in London.
const justAfterMidnight = (n: number) => `${day(n)}T00:10:00+05:30`;

export type Who = { role: string; user: string; school?: string };
export const principal: Who = { role: 'principal', user: PRINCIPAL };
export const admin: Who = { role: 'school_admin', user: ADMIN };
export const tara: Who = { role: 'teacher', user: TARA };
export const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
export const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR };
export const principalC: Who = { role: 'principal', user: PRINCIPAL_C, school: C };

export const ents = (off: readonly string[] = [], school = A): SchoolEntitlements => ({ schoolId: school, plan: 'standard', accessMode: 'full', modules: Object.fromEntries(MODULE_REGISTRY.map((m) => [m.id, { enabled: !off.includes(m.id), source: 'plan' as const }])) });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any;
class Undo extends Error {
  constructor(readonly value: unknown) {
    super('undo');
  }
}
// As the app's own database role with that person's school, role and user set, inside a transaction that is
// always rolled back.
export const asWho = async <T>(db: Db, who: Who, fn: (client: Db) => Promise<T>): Promise<T> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.pg.transaction(async (tx: any) => {
      await tx.query('set local role app_user');
      for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
      throw new Undo(await fn(tx));
    });
  } catch (err) {
    if (err instanceof Undo) return err.value as T;
    throw err;
  }
  throw new Error('the transaction ended without an answer');
};
// The same, kept: for a route that writes an audit row.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const asWhoKept = <T>(db: Db, who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });

export async function startSchool(): Promise<Db> {
  const db = await startHarnessDb({ port: 0 });
  const mark = (student: string, cls: string, n: number, status: string) => `('${A}', '${student}', '${cls}', '${day(n)}', '${status}', '${TARA}')`;
  const fee = (id: number, student: string, minor: number, n: number, status: string) => `('${u(id)}', '${A}', '${student}', ${minor}, ${minor}, '${day(n)}', '${status}')`;
  const receipt = (id: number, no: string, student: string, minor: number, method: string, when: string, reversed = false) => `('${u(id)}', '${A}', '${no}', '${student}', ${minor}, '${method}', '${ACCOUNTANT}', '${when}', ${reversed ? `'${at(0)}', '${ADMIN}', 'The cheque came back.'` : 'null, null, null'})`;
  const log = (status: string, when: string, extra: { key?: string; student?: string; parent?: string; template?: string } = {}) =>
    `('${A}', 'whatsapp', '${extra.template ?? 'attendance_absence_notification'}', '${status}', '${when}', ${extra.key ? `'${extra.key}'` : 'null'}, ${extra.student ? `'${extra.student}'` : 'null'}, ${extra.parent ? `'${extra.parent}'` : 'null'}, 'meta', false, 0, 0, null, '9000000001')`;
  const leave = (who: string, from: number, to: number, status: string, extra = 'null, null, null, null, null, null') => `('${A}', '${who}', '${day(from)}', '${day(to)}', 'casual', 'A family function.', '${status}', '${who}', ${extra})`;
  const approved = `'${PRINCIPAL}', '${at(40)}', null, null, null, null`;
  // Triggers and foreign keys are off while the rows go in (checks still hold): the reports read rows, and the
  // rules that write them are each module's own tests.
  await db.pg.exec(`
    set session_replication_role = replica;
    insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound) values ('${A}', 'School A', 'IN-HR', false, false, true), ('${B}', 'School B', 'IN-DL', false, false, true), ('${C}', 'School C', 'IN-UP', false, false, true);
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Asif Admin'),
      ('${TARA}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher'), ('${TARUN}', '${A}', 'tarun@school-a.example', 'teacher', 'Tarun Teacher'),
      ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant'), ('${COORDINATOR}', '${A}', 'coordinator@school-a.example', 'academic_coordinator', 'Chitra Coordinator'),
      ('${u(19)}', '${B}', 'teacher@school-b.example', 'teacher', 'Bharat Teacher'), ('${PRINCIPAL_C}', '${C}', 'principal@school-c.example', 'principal', 'Parul Principal');
    insert into school_entitlements (school_id, plan) values ('${A}', 'standard'), ('${B}', 'standard'), ('${C}', 'standard');
    insert into school_module_entitlements (school_id, module_id, enabled, source) select s, m, true, 'plan' from unnest(array['${A}'::uuid, '${B}'::uuid, '${C}'::uuid]) s, unnest(array[${MODULE_REGISTRY.map((m) => `'${m.id}'`).join(', ')}]) m;
    -- Classes: "5-A" as one name; "6" with section "B" (written 6-B); "7-C" with nobody on its roll.
    insert into classes (class_id, school_id, name, section, class_teacher_id) values ('${C5A}', '${A}', '5-A', null, '${TARA}'), ('${C6B}', '${A}', '6', 'B', '${TARUN}'), ('${C7C}', '${A}', '7-C', null, null), ('${u(59)}', '${B}', '5-A', null, null), ('${u(57)}', '${C}', '1-A', null, null);
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics');
    insert into families (family_id, school_id, family_code, created_by) values ('${FAMILY}', '${A}', 'F-001', '${ADMIN}'), ('${FAMILY_2}', '${A}', 'F-002', '${ADMIN}');
    insert into students (student_id, school_id, admission_no, name, status, class_id, family_id) values
      ('${ASHA}', '${A}', 'A-1', 'Asha', 'active', '${C5A}', '${FAMILY}'), ('${BELA}', '${A}', 'A-2', 'Bela', 'active', '${C5A}', null), ('${CHIRAG}', '${A}', 'A-3', 'Chirag', 'active', '${C5A}', null), ('${DEV}', '${A}', 'A-4', 'Dev', 'active', '${C5A}', '${FAMILY_2}'),
      ('${ESHA}', '${A}', 'A-5', 'Esha', 'pending_consent', '${C5A}', null), ('${FARAH}', '${A}', 'A-6', 'Farah', 'active', '${C6B}', '${FAMILY}'), ('${GOPAL}', '${A}', 'A-7', 'Gopal', 'active', '${C6B}', null), ('${HINA}', '${A}', 'A-8', 'Hina', 'active', '${C6B}', '${FAMILY_2}'),
      ('${JAYA}', '${A}', 'A-10', 'Jaya', 'active', null, null),
      ('${u(190)}', '${B}', 'B-1', 'Bina', 'active', '${u(59)}', null), ('${STUDENT_C}', '${C}', 'C-1', 'Sunil', 'active', '${u(57)}', null);
    insert into parents (parent_id, school_id, name, phone) values ('${G_ASHA}', '${A}', 'Anita Sharma', '9000000001'), ('${G_FARAH}', '${A}', 'Fatima Ali', '9000000006');

    -- Attendance. Today: 5-A (present, late, absent, on leave, and Esha absent). Yesterday: both classes. Three and
    -- ten days ago: a few marks. Forty days ago: outside thirty days.
    insert into attendance (school_id, student_id, class_id, date, status, marked_by) values
      ${mark(ASHA, C5A, 0, 'present')}, ${mark(BELA, C5A, 0, 'late')}, ${mark(CHIRAG, C5A, 0, 'absent')}, ${mark(DEV, C5A, 0, 'leave')}, ${mark(ESHA, C5A, 0, 'absent')},
      ${mark(ASHA, C5A, 1, 'present')}, ${mark(BELA, C5A, 1, 'present')}, ${mark(CHIRAG, C5A, 1, 'absent')}, ${mark(DEV, C5A, 1, 'present')}, ${mark(FARAH, C6B, 1, 'absent')}, ${mark(GOPAL, C6B, 1, 'present')}, ${mark(HINA, C6B, 1, 'leave')},
      ${mark(ASHA, C5A, 3, 'present')}, ${mark(BELA, C5A, 3, 'absent')},
      ${mark(ASHA, C5A, 10, 'present')}, ${mark(FARAH, C6B, 10, 'present')},
      ${mark(ASHA, C5A, 40, 'absent')};
    insert into attendance (school_id, student_id, class_id, date, status) values ('${B}', '${u(190)}', '${u(59)}', '${day(0)}', 'absent');

    -- Fees. Overdue by the rule: Asha 1,000 unpaid since yesterday and 1,500 left of 2,000 (5 days); Farah 3,000
    -- left of 4,000 (12 days); Gopal 600 (15 days: the longest wait and a small amount); Hina 200 (7 days). Five
    -- entries, 6,300 in all. Not overdue: Farah's 3,000 due next week, Bela's paid entries, and the entries of Gopal
    -- (2,500) and Dev (800) that were waived (their dates have passed, and nothing is owed on them).
    insert into fees_ledger (fee_id, school_id, student_id, amount_minor, gross_minor, due_date, status) values
      ${fee(301, ASHA, 100000, 1, 'pending')}, ${fee(302, ASHA, 200000, 5, 'overdue')}, ${fee(303, FARAH, 300000, -7, 'pending')}, ${fee(304, FARAH, 400000, 12, 'partial')}, ${fee(305, BELA, 500000, 10, 'paid')},
      ${fee(307, GOPAL, 250000, 20, 'waived')}, ${fee(308, GOPAL, 60000, 15, 'pending')}, ${fee(309, GOPAL, 30000, 3, 'paid')}, ${fee(310, BELA, 40000, 1, 'paid')},
      ${fee(311, DEV, 80000, 9, 'waived')}, ${fee(312, HINA, 20000, 7, 'pending')},
      ('${u(390)}', '${B}', '${u(190)}', 99900000, 99900000, '${day(9)}', 'pending');
    -- Receipts. Today 500 cash. Yesterday 400 by card, issued ten past midnight in India. Two days ago 700 cash,
    -- reversed since. Three days ago 1,000 by UPI and 300 online. Twenty days ago 5,000 by cheque. Forty-five days
    -- ago 900 cash: outside thirty days.
    insert into receipts (receipt_id, school_id, receipt_no, student_id, total_minor, method, issued_by, issued_at, reversed_at, reversed_by, reversal_reason) values
      ${receipt(401, 'RCP-1', ASHA, 50000, 'cash', at(0))}, ${receipt(402, 'RCP-2', FARAH, 100000, 'upi', at(3))}, ${receipt(403, 'RCP-3', BELA, 500000, 'cheque', at(20))}, ${receipt(404, 'RCP-4', ASHA, 70000, 'cash', at(2), true)},
      ${receipt(405, 'RCP-5', BELA, 90000, 'cash', at(45))}, ${receipt(408, 'RCP-8', BELA, 40000, 'card', justAfterMidnight(1))},
      ('${u(490)}', '${B}', 'RCP-1', '${u(190)}', 12300, 'cash', '${u(19)}', '${at(0)}', null, null, null);
    -- Paid online through a payment link: no person issued it (the database's own rule for an online receipt).
    insert into receipts (receipt_id, school_id, receipt_no, student_id, total_minor, method, issued_by, issued_at, payment_link_id, gateway, gateway_payment_id) values
      ('${u(406)}', '${A}', 'RCP-6', '${GOPAL}', 30000, 'online', null, '${at(3)}', '${u(450)}', 'standin', 'pay-0001');
    insert into payments (payment_id, school_id, fee_id, amount_minor, method, receipt_id, reverses_payment_id) values
      ('${u(411)}', '${A}', '${u(302)}', 50000, 'cash', '${u(401)}', null), ('${u(412)}', '${A}', '${u(304)}', 100000, 'upi', '${u(402)}', null), ('${u(413)}', '${A}', '${u(305)}', 500000, 'cheque', '${u(403)}', null),
      ('${u(414)}', '${A}', '${u(301)}', 70000, 'cash', '${u(404)}', null), ('${u(415)}', '${A}', '${u(301)}', -70000, 'adjustment', '${u(404)}', '${u(414)}'),
      ('${u(416)}', '${A}', '${u(309)}', 30000, 'online', '${u(406)}', null), ('${u(418)}', '${A}', '${u(310)}', 40000, 'card', '${u(408)}', null);
    -- What the office did: the first family was called four days ago and promised, two days ago, to pay next week.
    -- The second family was called yesterday; the call is recorded against Dev, who has no overdue entry himself.
    -- Nothing for Gopal.
    insert into fee_followups (school_id, family_id, student_id, kind, note, promise_date, status, created_by, created_at) values
      ('${A}', '${FAMILY}', '${ASHA}', 'call', 'Asked to call back in the evening.', null, 'closed', '${ACCOUNTANT}', '${at(4)}'),
      ('${A}', '${FAMILY}', '${ASHA}', 'promise', 'Will pay after the harvest.', '${day(-5)}', 'open', '${ACCOUNTANT}', '${at(2)}'),
      ('${A}', '${FAMILY_2}', '${DEV}', 'call', 'Will send it with the child on Monday.', null, 'closed', '${ACCOUNTANT}', '${at(1)}');

    -- Homework. 5-A: one set today (due tomorrow), one set 3 days ago, due yesterday, checked for all five (two not
    -- done). 6-B: one set 2 days ago, due today, checked for two of three (one not done); one set 20 days ago, due
    -- 15 days ago, never checked. 7-C: one set 2 days ago, due today, for a section with nobody on its roll.
    insert into homework (homework_id, school_id, subject_id, title, due_date, created_by) values ('${u(701)}', '${A}', '${MATHS}', 'Sums 1', '${day(-1)}', '${TARA}'), ('${u(702)}', '${A}', '${MATHS}', 'Sums 2', '${day(1)}', '${TARA}'), ('${u(703)}', '${A}', '${MATHS}', 'Sums 3', '${day(0)}', '${TARUN}'), ('${u(704)}', '${A}', '${MATHS}', 'Sums 4', '${day(15)}', '${TARUN}'), ('${u(705)}', '${A}', '${MATHS}', 'Sums 5', '${day(0)}', '${TARUN}');
    insert into homework_targets (target_id, school_id, homework_id, class_id, title, due_date, assigned_at) values
      ('${u(711)}', '${A}', '${u(701)}', '${C5A}', 'Sums 1', '${day(-1)}', '${at(0)}'), ('${u(712)}', '${A}', '${u(702)}', '${C5A}', 'Sums 2', '${day(1)}', '${at(3)}'),
      ('${u(713)}', '${A}', '${u(703)}', '${C6B}', 'Sums 3', '${day(0)}', '${at(2)}'), ('${u(714)}', '${A}', '${u(704)}', '${C6B}', 'Sums 4', '${day(15)}', '${at(20)}'),
      ('${u(715)}', '${A}', '${u(705)}', '${C7C}', 'Sums 5', '${day(0)}', '${at(2)}');
    insert into homework_status (school_id, target_id, class_id, student_id, done, checked_by) values
      ('${A}', '${u(712)}', '${C5A}', '${ASHA}', true, '${TARA}'), ('${A}', '${u(712)}', '${C5A}', '${BELA}', true, '${TARA}'), ('${A}', '${u(712)}', '${C5A}', '${CHIRAG}', true, '${TARA}'), ('${A}', '${u(712)}', '${C5A}', '${DEV}', false, '${TARA}'), ('${A}', '${u(712)}', '${C5A}', '${ESHA}', false, '${TARA}'),
      ('${A}', '${u(713)}', '${C6B}', '${FARAH}', true, '${TARUN}'), ('${A}', '${u(713)}', '${C6B}', '${GOPAL}', false, '${TARUN}');

    -- Daily Pulse: sent today for 5-A (one message out, one held; one "understood", one "needs help"); sent four days
    -- ago for 6-B (one out; two "understood"); a draft today; one sent 45 days ago.
    insert into pulse_messages (pulse_id, school_id, class_id, subject_id, topic, exception_state, body_en, body_hi, body_hinglish, sent_on, status, sent_by, sent_at) values
      ('${u(601)}', '${A}', '${C5A}', '${MATHS}', 'Fractions', 'taught', 'Today: fractions.', 'आज: भिन्न।', 'Aaj: fractions.', '${day(0)}', 'sent', '${TARA}', '${at(0)}'),
      ('${u(602)}', '${A}', '${C6B}', '${MATHS}', 'Decimals', 'taught', 'Today: decimals.', 'आज: दशमलव।', 'Aaj: decimals.', '${day(4)}', 'sent', '${TARUN}', '${at(4)}'),
      ('${u(603)}', '${A}', '${C5A}', '${MATHS}', 'Angles', 'taught', '', '', '', '${day(0)}', 'draft', null, null),
      ('${u(604)}', '${A}', '${C5A}', '${MATHS}', 'Shapes', 'taught', 'Today: shapes.', 'आज: आकृतियाँ।', 'Aaj: shapes.', '${day(45)}', 'sent', '${TARA}', '${at(45)}');
    insert into pulse_response_log (school_id, pulse_id, student_id, parent_id, tier) values
      ('${A}', '${u(601)}', '${ASHA}', '${G_ASHA}', 1), ('${A}', '${u(601)}', '${BELA}', '${G_ASHA}', 2), ('${A}', '${u(602)}', '${FARAH}', '${G_FARAH}', 1), ('${A}', '${u(602)}', '${GOPAL}', '${G_FARAH}', 1), ('${A}', '${u(604)}', '${ASHA}', '${G_ASHA}', 2);

    -- WhatsApp messages, by the day each was written. Today: delivered, held (no consent), waiting. Yesterday: read.
    -- Two days ago: failed. Four days ago: sent. Five days ago, ten past midnight in India: delivered. Ten days ago:
    -- held for the budget. 45 days ago: delivered (outside thirty days). An email is not a WhatsApp message.
    insert into communication_log (school_id, channel, template_name, status, created_at, dedupe_key, student_id, parent_id, provider, billable, est_cost_paise, gst_paise, cost_basis, to_phone) values
      ${log('delivered', at(0), { key: `pulse:${u(601)}:${ASHA}:${G_ASHA}`, student: ASHA, parent: G_ASHA, template: 'daily_pulse' })},
      ${log('blocked_consent', at(0), { key: `pulse:${u(601)}:${BELA}:${G_ASHA}`, student: BELA, template: 'daily_pulse' })},
      ${log('queued', at(0))},
      ${log('read', at(1), { student: FARAH, parent: G_FARAH })},
      ${log('failed', at(2), { student: ASHA, parent: G_ASHA })},
      ${log('sent', at(4), { key: `pulse:${u(602)}:${FARAH}:${G_FARAH}`, student: FARAH, parent: G_FARAH, template: 'daily_pulse' })},
      ${log('delivered', justAfterMidnight(5))},
      ${log('blocked_budget', at(10))},
      ${log('delivered', at(45))};
    insert into communication_log (school_id, channel, status, created_at) values ('${A}', 'email', 'sent', '${at(0)}'), ('${B}', 'whatsapp', 'failed', '${at(0)}');

    -- Staff leave. Approved: Tara from 35 to 28 days ago (two of those days are inside thirty days) and three days ago;
    -- Tarun from yesterday to the day after tomorrow. Not approved, so not leave: the coordinator's request that
    -- waits, the accountant's that was withdrawn and another that was refused. Tara's of sixty days ago is outside.
    insert into staff_leave (school_id, user_id, from_date, to_date, kind, reason, status, recorded_by, decided_by, decided_at, decision_note, withdrawn_by, withdrawn_at, withdrawn_note) values
      ${leave(TARA, 35, 28, 'approved', approved)}, ${leave(TARA, 3, 3, 'approved', approved)}, ${leave(TARUN, 1, -2, 'approved', approved)}, ${leave(TARA, 60, 58, 'approved', approved)},
      ${leave(COORDINATOR, 5, 5, 'waiting')},
      ${leave(ACCOUNTANT, 6, 6, 'withdrawn', `null, null, null, '${ACCOUNTANT}', '${at(8)}', null`)},
      ${leave(ACCOUNTANT, 8, 8, 'refused', `'${PRINCIPAL}', '${at(9)}', 'The audit is that week.', null, null, null`)},
      ('${B}', '${u(19)}', '${day(2)}', '${day(1)}', 'sick', 'Fever.', 'approved', '${u(19)}', '${u(18)}', '${at(3)}', null, null, null, null);
    set session_replication_role = origin;
  `);
  return db;
}
