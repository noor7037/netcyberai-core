// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import type { SchoolEntitlements } from '@/lib/contracts/entitlements';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';
import { indiaDate } from '@/lib/time/india';

// One made-up school on the whole schema, for the school facts' tests
// (docs/26 slice 8d, C203). Every name and number here is invented. The
// comments beside each block say what the facts must count from it.

export const A = 'ad000000-0000-4000-8000-000000000001';
export const B = 'ad000000-0000-4000-8000-000000000002'; // another school: never counted
export const EMPTY = 'ad000000-0000-4000-8000-000000000003'; // a school with nothing set up
const u = (n: number) => `ad000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const [PRINCIPAL, ADMIN, TARA, TARUN, ACCOUNTANT, COORDINATOR, NEW_PRINCIPAL, TINA] = [u(11), u(12), u(13), u(14), u(15), u(16), u(17), u(18)];
// Tara's leave request, which waits for the office.
export const TARA_LEAVE = u(951);
export const [C5A, C6B, C7C] = [u(51), u(52), u(53)];
const MATHS = u(60);
// 5-A: Asha, Bela, Chirag, Dev (active), Esha (waiting for consent), Ishan (inactive). 6-B: Farah, Gopal, Hina. Jaya: no class.
const [ASHA, BELA, CHIRAG, DEV, ESHA, FARAH, GOPAL, HINA, ISHAN, JAYA] = [u(101), u(102), u(103), u(104), u(105), u(106), u(107), u(108), u(109), u(110)];
export { FARAH };
export const [G_ASHA, G_FARAH] = [u(201), u(206)];
// A complaint the office gives Tara to look into about Farah of 6-B, a class that is not hers (put in by one test).
export const FARAH_COMPLAINT = u(805);

export const TODAY = indiaDate();
// India's date n days before today (negative: after).
export const day = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
// Ten in the morning in India on that day.
const at = (n: number) => `${day(n)}T10:00:00+05:30`;
export const isSundayToday = new Date(`${TODAY}T00:00:00Z`).getUTCDay() === 0;
// Today as the timetable numbers its days (1 is Monday, 7 is Sunday), and the day after it.
const WEEKDAY = new Date(`${TODAY}T00:00:00Z`).getUTCDay() || 7;
const NEXT_WEEKDAY = (WEEKDAY % 7) + 1;

export type Who = { role: string; user: string; school?: string };
export const principal: Who = { role: 'principal', user: PRINCIPAL };
export const admin: Who = { role: 'school_admin', user: ADMIN };
export const tara: Who = { role: 'teacher', user: TARA };
export const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
export const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR };

export const ents = (off: readonly string[] = [], school = A): SchoolEntitlements => ({ schoolId: school, plan: 'standard', accessMode: 'full', modules: Object.fromEntries(MODULE_REGISTRY.map((m) => [m.id, { enabled: !off.includes(m.id), source: 'plan' as const }])) });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any;
class Undo extends Error {
  constructor(readonly value: unknown) {
    super('undo');
  }
}
// As the app's own role with that person's school, role and user set, inside a transaction that is always rolled
// back: a read in one test never changes what the next one sees (the Complaints list marks rows as seen).
const inRole = async <T>(db: Db, databaseRole: 'app_user' | 'nca_super', who: Who, fn: (client: Db) => Promise<T>): Promise<T> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.pg.transaction(async (tx: any) => {
      await tx.query(`set local role ${databaseRole}`);
      for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
      throw new Undo(await fn(tx));
    });
  } catch (err) {
    if (err instanceof Undo) return err.value as T;
    throw err;
  }
  throw new Error('the transaction ended without an answer');
};
export const asWho = <T>(db: Db, who: Who, fn: (client: Db) => Promise<T>): Promise<T> => inRole(db, 'app_user', who, fn);
// As the platform's own database role (nca_super), which row level security does not narrow to a school: how a
// nightly job or a check would run. The school's settings are set as well, as a caller of the facts would set them.
export const asPlatform = <T>(db: Db, who: Who, fn: (client: Db) => Promise<T>): Promise<T> => inRole(db, 'nca_super', who, fn);
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
  const mark = (student: string, cls: string, n: number, status: string, leave: string | null = null) => `('${A}', '${student}', '${cls}', '${day(n)}', '${status}', '${TARA}', ${leave ? `'${leave}'` : 'null'})`;
  const fee = (id: number, student: string, minor: number, n: number, status: string) => `('${u(id)}', '${A}', '${student}', ${minor}, ${minor}, '${day(n)}', '${status}')`;
  const receipt = (id: number, no: string, student: string, minor: number, n: number, reversed = false) => `('${u(id)}', '${A}', '${no}', '${student}', ${minor}, 'cash', '${ACCOUNTANT}', '${at(n)}', ${reversed ? `'${at(n - 1)}', '${ADMIN}', 'The cheque came back.'` : 'null, null, null'})`;
  const log = (status: string, n: number, extra: { key?: string; student?: string; parent?: string; cost?: boolean; template?: string } = {}) =>
    `('${A}', 'whatsapp', '${extra.template ?? 'attendance_absence_notification'}', '${status}', '${at(n)}', ${extra.key ? `'${extra.key}'` : 'null'}, ${extra.student ? `'${extra.student}'` : 'null'}, ${extra.parent ? `'${extra.parent}'` : 'null'}, 'meta', ${extra.cost ? 'true, 12, 2' : 'false, 0, 0'}, ${extra.cost || status === 'sent' ? `'rate_table'` : 'null'}, '9000000001')`;
  // Triggers and foreign keys are off while the rows go in (checks still hold): the facts read rows, and the
  // rules that write them are each module's own tests.
  await db.pg.exec(`
    set session_replication_role = replica;
    insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise) values
      ('${A}', 'School A', 'IN-HR', false, false, true, 50000), ('${B}', 'School B', 'IN-DL', false, false, true, null), ('${EMPTY}', 'School New', 'IN-UP', false, false, true, null);
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Asif Admin'),
      ('${TARA}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher'), ('${TARUN}', '${A}', 'tarun@school-a.example', 'teacher', 'Tarun Teacher'),
      ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant'), ('${COORDINATOR}', '${A}', 'coordinator@school-a.example', 'academic_coordinator', 'Chitra Coordinator'),
      ('${TINA}', '${A}', 'tina@school-a.example', 'teacher', 'Tina Teacher'),
      ('${NEW_PRINCIPAL}', '${EMPTY}', 'principal@school-new.example', 'principal', 'Nina New');
    insert into school_entitlements (school_id, plan) values ('${A}', 'standard'), ('${EMPTY}', 'standard');
    insert into school_module_entitlements (school_id, module_id, enabled, source) select s, m, true, 'plan' from unnest(array['${A}'::uuid, '${EMPTY}'::uuid]) s, unnest(array[${MODULE_REGISTRY.map((m) => `'${m.id}'`).join(', ')}]) m;
    insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5A}', '${A}', '5-A', '${TARA}'), ('${C6B}', '${A}', '6-B', '${TARUN}'), ('${C7C}', '${A}', '7-C', null);
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics');
    -- Students: 8 active (one of them in no class), 1 waiting for consent, 1 inactive. On a class roll: 5 in 5-A, 3 in 6-B.
    insert into students (student_id, school_id, admission_no, name, status, class_id) values
      ('${ASHA}', '${A}', 'A-1', 'Asha', 'active', '${C5A}'), ('${BELA}', '${A}', 'A-2', 'Bela', 'active', '${C5A}'), ('${CHIRAG}', '${A}', 'A-3', 'Chirag', 'active', '${C5A}'), ('${DEV}', '${A}', 'A-4', 'Dev', 'active', '${C5A}'),
      ('${ESHA}', '${A}', 'A-5', 'Esha', 'pending_consent', '${C5A}'), ('${FARAH}', '${A}', 'A-6', 'Farah', 'active', '${C6B}'), ('${GOPAL}', '${A}', 'A-7', 'Gopal', 'active', '${C6B}'), ('${HINA}', '${A}', 'A-8', 'Hina', 'active', '${C6B}'),
      ('${ISHAN}', '${A}', 'A-9', 'Ishan', 'inactive', '${C5A}'), ('${JAYA}', '${A}', 'A-10', 'Jaya', 'active', null),
      ('${u(190)}', '${B}', 'B-1', 'Bina', 'active', null);
    insert into parents (parent_id, school_id, name, phone) values ('${G_ASHA}', '${A}', 'Anita Sharma', '9000000001'), ('${G_FARAH}', '${A}', 'Fatima Ali', '9000000006');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${G_ASHA}', '${ASHA}'), ('${A}', '${G_FARAH}', '${FARAH}');
    -- Attendance today: 5-A is marked (present, late, absent, on leave; Esha not yet), 6-B is not. Earlier days for the rate.
    insert into attendance (school_id, student_id, class_id, date, status, marked_by, leave_code) values
      ${mark(ASHA, C5A, 0, 'present')}, ${mark(BELA, C5A, 0, 'late')}, ${mark(CHIRAG, C5A, 0, 'absent')}, ${mark(DEV, C5A, 0, 'leave', 'sick')},
      ${mark(ASHA, C5A, 1, 'present')}, ${mark(BELA, C5A, 1, 'present')}, ${mark(CHIRAG, C5A, 1, 'present')}, ${mark(DEV, C5A, 1, 'present')}, ${mark(FARAH, C6B, 1, 'absent')}, ${mark(GOPAL, C6B, 1, 'present')}, ${mark(HINA, C6B, 1, 'leave')},
      ${mark(ASHA, C5A, 3, 'present')}, ${mark(BELA, C5A, 3, 'absent')},
      ${mark(ASHA, C5A, 10, 'present')}, ${mark(FARAH, C6B, 10, 'present')}, ${mark(ISHAN, C5A, 10, 'present')},
      ${mark(ASHA, C5A, 40, 'absent')};
    insert into attendance (school_id, student_id, class_id, date, status) values ('${B}', '${u(190)}', '${u(191)}', '${day(0)}', 'present');
    -- Fees. Overdue: 1,000 unpaid since yesterday, and 1,500 left of 2,000 (2 entries). Owed, not yet due: 3,000 next week and 3,000 left of 4,000 due today.
    insert into fees_ledger (fee_id, school_id, student_id, amount_minor, gross_minor, due_date, status) values
      ${fee(301, ASHA, 100000, 1, 'pending')}, ${fee(302, ASHA, 200000, 5, 'overdue')}, ${fee(303, FARAH, 300000, -7, 'pending')}, ${fee(304, FARAH, 400000, 0, 'partial')}, ${fee(305, BELA, 500000, 10, 'paid')}, ${fee(306, BELA, 0, 10, 'waived')},
      ('${u(390)}', '${B}', '${u(190)}', 99900000, 99900000, '${day(9)}', 'pending');
    -- Receipts: 500 today, 1,000 three days ago, 5,000 twenty days ago; 700 two days ago was reversed; 900 came 45 days ago.
    insert into receipts (receipt_id, school_id, receipt_no, student_id, total_minor, method, issued_by, issued_at, reversed_at, reversed_by, reversal_reason) values
      ${receipt(401, 'RCP-1', ASHA, 50000, 0)}, ${receipt(402, 'RCP-2', FARAH, 100000, 3)}, ${receipt(403, 'RCP-3', BELA, 500000, 20)}, ${receipt(404, 'RCP-4', ASHA, 70000, 2, true)}, ${receipt(405, 'RCP-5', BELA, 90000, 45)};
    insert into payments (payment_id, school_id, fee_id, amount_minor, method, receipt_id, reverses_payment_id) values
      ('${u(411)}', '${A}', '${u(302)}', 50000, 'cash', '${u(401)}', null), ('${u(412)}', '${A}', '${u(304)}', 100000, 'cash', '${u(402)}', null), ('${u(413)}', '${A}', '${u(305)}', 500000, 'cash', '${u(403)}', null),
      ('${u(414)}', '${A}', '${u(301)}', 70000, 'cash', '${u(404)}', null), ('${u(415)}', '${A}', '${u(301)}', -70000, 'cash', '${u(404)}', '${u(414)}');
    -- Promises to pay: Asha's fell due yesterday, Gopal's today (his family owes nothing overdue); Farah's is for later; Bela's is closed.
    insert into fee_followups (school_id, student_id, kind, note, promise_date, status, created_by, closed_by, closed_at, close_note) values
      ('${A}', '${ASHA}', 'promise', 'Will pay after the harvest.', '${day(1)}', 'open', '${ACCOUNTANT}', null, null, null), ('${A}', '${GOPAL}', 'promise', 'Will pay on salary day.', '${day(0)}', 'open', '${ACCOUNTANT}', null, null, null),
      ('${A}', '${FARAH}', 'promise', 'Will pay next week.', '${day(-3)}', 'open', '${ACCOUNTANT}', null, null, null), ('${A}', '${BELA}', 'promise', 'Paid in full.', '${day(4)}', 'closed', '${ACCOUNTANT}', '${ACCOUNTANT}', '${at(2)}', 'Paid.');
    -- A UPI payment a parent reported and nobody has checked; another was not found.
    insert into payment_links (link_id, school_id, student_id, token, amount_minor, status, created_by, expires_at, reference_code) values
      ('${u(501)}', '${A}', '${ASHA}', 'tokentokentokentokentokentoken0001', 100000, 'open', '${ACCOUNTANT}', '${at(-7)}', 'ABCDEFGH'), ('${u(502)}', '${A}', '${FARAH}', 'tokentokentokentokentokentoken0002', 100000, 'open', '${ACCOUNTANT}', '${at(-7)}', 'ABCDEFGJ');
    insert into payment_reports (school_id, link_id, utr, amount_minor, status, reported_at, decided_by, decided_at) values
      ('${A}', '${u(501)}', '123456789012', 100000, 'reported', '${at(0)}', null, null), ('${A}', '${u(502)}', '123456789013', 100000, 'not_found', '${at(3)}', '${ACCOUNTANT}', '${at(2)}');
    -- Daily Pulse: one sent today (5-A), one four days ago (6-B); a draft today; one sent 45 days ago.
    insert into pulse_messages (pulse_id, school_id, class_id, subject_id, topic, exception_state, body_en, body_hi, body_hinglish, sent_on, status, sent_by, sent_at) values
      ('${u(601)}', '${A}', '${C5A}', '${MATHS}', 'Fractions', 'taught', 'Today: fractions.', 'आज: भिन्न।', 'Aaj: fractions.', '${day(0)}', 'sent', '${TARA}', '${at(0)}'),
      ('${u(602)}', '${A}', '${C6B}', '${MATHS}', 'Decimals', 'taught', 'Today: decimals.', 'आज: दशमलव।', 'Aaj: decimals.', '${day(4)}', 'sent', '${TARUN}', '${at(4)}'),
      ('${u(603)}', '${A}', '${C5A}', '${MATHS}', 'Angles', 'taught', '', '', '', '${day(0)}', 'draft', null, null),
      ('${u(604)}', '${A}', '${C5A}', '${MATHS}', 'Shapes', 'taught', 'Today: shapes.', 'आज: आकृतियाँ।', 'Aaj: shapes.', '${day(45)}', 'sent', '${TARA}', '${at(45)}');
    insert into pulse_response_log (school_id, pulse_id, student_id, parent_id, tier) values
      ('${A}', '${u(601)}', '${ASHA}', '${G_ASHA}', 1), ('${A}', '${u(601)}', '${BELA}', '${G_ASHA}', 2), ('${A}', '${u(602)}', '${FARAH}', '${G_FARAH}', 1), ('${A}', '${u(602)}', '${GOPAL}', '${G_FARAH}', 1), ('${A}', '${u(604)}', '${ASHA}', '${G_ASHA}', 2);
    insert into pulse_followups (school_id, student_id, class_id, kind, status, created_by, decided_by, decided_at, outcome) values
      ('${A}', '${BELA}', '${C5A}', 'did_not_understand', 'open', '${TARA}', null, null, null), ('${A}', '${FARAH}', '${C6B}', 'homework_help', 'open', '${TARUN}', null, null, null), ('${A}', '${ASHA}', '${C5A}', 'other', 'done', '${TARA}', '${TARA}', '${at(1)}', 'Spoke to her.');
    -- Homework. Set today (due tomorrow); set 3 days ago, due yesterday, checked for all five of 5-A (two not done);
    -- set 2 days ago, due today, checked for two of three in 6-B (one not done); set 20 days ago, due 15 days ago, never checked.
    -- And one set 2 days ago, due today, for 7-C, which has nobody on its roll: it is "set", and it is neither
    -- "due" nor "checked for everyone" (nobody was there to check).
    insert into homework (homework_id, school_id, subject_id, title, due_date, created_by) values ('${u(701)}', '${A}', '${MATHS}', 'Sums 1', '${day(-1)}', '${TARA}'), ('${u(702)}', '${A}', '${MATHS}', 'Sums 2', '${day(1)}', '${TARA}'), ('${u(703)}', '${A}', '${MATHS}', 'Sums 3', '${day(0)}', '${TARUN}'), ('${u(704)}', '${A}', '${MATHS}', 'Sums 4', '${day(15)}', '${TARUN}'), ('${u(705)}', '${A}', '${MATHS}', 'Sums 5', '${day(0)}', '${TARUN}');
    insert into homework_targets (target_id, school_id, homework_id, class_id, title, due_date, assigned_at) values
      ('${u(711)}', '${A}', '${u(701)}', '${C5A}', 'Sums 1', '${day(-1)}', '${at(0)}'), ('${u(712)}', '${A}', '${u(702)}', '${C5A}', 'Sums 2', '${day(1)}', '${at(3)}'),
      ('${u(713)}', '${A}', '${u(703)}', '${C6B}', 'Sums 3', '${day(0)}', '${at(2)}'), ('${u(714)}', '${A}', '${u(704)}', '${C6B}', 'Sums 4', '${day(15)}', '${at(20)}'),
      ('${u(715)}', '${A}', '${u(705)}', '${C7C}', 'Sums 5', '${day(0)}', '${at(2)}');
    insert into homework_status (school_id, target_id, class_id, student_id, done, checked_by) values
      ('${A}', '${u(712)}', '${C5A}', '${ASHA}', true, '${TARA}'), ('${A}', '${u(712)}', '${C5A}', '${BELA}', true, '${TARA}'), ('${A}', '${u(712)}', '${C5A}', '${CHIRAG}', true, '${TARA}'), ('${A}', '${u(712)}', '${C5A}', '${DEV}', false, '${TARA}'), ('${A}', '${u(712)}', '${C5A}', '${ESHA}', false, '${TARA}'),
      ('${A}', '${u(713)}', '${C6B}', '${FARAH}', true, '${TARUN}'), ('${A}', '${u(713)}', '${C6B}', '${GOPAL}', false, '${TARUN}');
    -- WhatsApp messages. Today: delivered, held (no consent), waiting. In the week: also sent (4 days ago), read (yesterday), failed (2 days ago).
    -- In the month: also held for the budget (10 days ago). 45 days ago: one more delivered. An email is not a WhatsApp message.
    insert into communication_log (school_id, channel, template_name, status, created_at, dedupe_key, student_id, parent_id, provider, billable, est_cost_paise, gst_paise, cost_basis, to_phone) values
      ${log('delivered', 0, { key: `pulse:${u(601)}:${ASHA}:${G_ASHA}`, student: ASHA, parent: G_ASHA, cost: true, template: 'daily_pulse' })},
      ${log('blocked_consent', 0, { key: `pulse:${u(601)}:${BELA}:${G_ASHA}`, student: BELA, template: 'daily_pulse' })},
      ${log('queued', 0)},
      ${log('sent', 4, { key: `pulse:${u(602)}:${FARAH}:${G_FARAH}`, student: FARAH, parent: G_FARAH, template: 'daily_pulse' })},
      ${log('read', 1, { student: FARAH, parent: G_FARAH, cost: true })},
      ${log('failed', 2, { student: ASHA, parent: G_ASHA })},
      ${log('blocked_budget', 10)},
      ${log('delivered', 45, { cost: true })};
    insert into communication_log (school_id, channel, status, created_at) values ('${A}', 'email', 'sent', '${at(0)}'), ('${B}', 'whatsapp', 'failed', '${at(0)}');
    -- Complaints: one open and in time, one open past its time, one open about Tara that the principal has not yet seen, one closed.
    insert into complaints (complaint_id, school_id, parent_id, student_id, about_user_id, source, summary, status, owner_id, due_at, created_by, closed_by, closed_at, closing_note) values
      ('${u(801)}', '${A}', '${G_ASHA}', '${ASHA}', null, 'office', 'The bus was late.', 'open', '${ADMIN}', '${at(-2)}', '${ADMIN}', null, null, null),
      ('${u(802)}', '${A}', '${G_ASHA}', '${ASHA}', null, 'office', 'The water cooler is broken.', 'open', '${TARA}', '${at(1)}', '${ADMIN}', null, null, null),
      ('${u(803)}', '${A}', '${G_FARAH}', '${FARAH}', '${TARA}', 'office', 'About a teacher.', 'open', '${ADMIN}', '${at(-2)}', '${ADMIN}', null, null, null),
      ('${u(804)}', '${A}', '${G_FARAH}', '${FARAH}', null, 'office', 'Homework was too much.', 'closed', '${ADMIN}', '${at(5)}', '${ADMIN}', '${ADMIN}', '${at(4)}', 'Spoke to the teacher.');
    -- Notices: one waiting for 5-A, one waiting for the whole school, one sent.
    insert into class_notices (school_id, class_id, body, status, written_by, decided_by, decided_at) values
      ('${A}', '${C5A}', 'Bring a water bottle.', 'waiting', '${TARA}', null, null), ('${A}', null, 'School closes early on Friday.', 'waiting', '${ADMIN}', null, null), ('${A}', '${C6B}', 'Sports day kit.', 'sent', '${TARUN}', '${PRINCIPAL}', '${at(1)}');
    -- Meetings: one in five days (two times, one booked); one ten days ago; one in eight days that was cancelled.
    -- And one dated TODAY for 6-B, still a draft with no times yet: "today or later" starts at today, and a draft
    -- that has not been sent out is a meeting to come like any other.
    insert into ptm_events (ptm_id, school_id, title, held_on, starts_at, ends_at, slot_minutes, class_ids, status, created_by, invited_by, invited_at, cancelled_by, cancelled_at) values
      ('${u(901)}', '${A}', 'Term meeting', '${day(-5)}', '09:00', '10:00', 30, array['${C5A}'::uuid], 'invited', '${ADMIN}', '${ADMIN}', '${at(1)}', null, null),
      ('${u(904)}', '${A}', 'Class meeting', '${day(0)}', '14:00', '15:00', 30, array['${C6B}'::uuid], 'draft', '${ADMIN}', null, null, null, null),
      ('${u(902)}', '${A}', 'Old meeting', '${day(10)}', '09:00', '10:00', 30, array['${C5A}'::uuid], 'invited', '${ADMIN}', '${ADMIN}', '${at(15)}', null, null),
      ('${u(903)}', '${A}', 'Called off', '${day(-8)}', '09:00', '10:00', 30, array['${C6B}'::uuid], 'cancelled', '${ADMIN}', null, null, '${ADMIN}', '${at(1)}');
    insert into ptm_slots (slot_id, school_id, ptm_id, teacher_id, starts_at) values ('${u(911)}', '${A}', '${u(901)}', '${TARA}', '09:00'), ('${u(912)}', '${A}', '${u(901)}', '${TARA}', '09:30'), ('${u(913)}', '${A}', '${u(902)}', '${TARA}', '09:00');
    insert into ptm_bookings (school_id, ptm_id, slot_id, teacher_id, parent_id, booked_via) values ('${A}', '${u(901)}', '${u(911)}', '${TARA}', '${G_ASHA}', 'reply');
    -- Events: one in three days (two yes, one no); one five days ago.
    insert into school_events (event_id, school_id, title, held_on, details, class_ids, status, created_by, invited_by, invited_at) values
      ('${u(921)}', '${A}', 'Annual day', '${day(-3)}', 'In the school hall.', '{}', 'invited', '${ADMIN}', '${ADMIN}', '${at(1)}'), ('${u(922)}', '${A}', 'Old fair', '${day(5)}', 'In the playground.', '{}', 'draft', '${ADMIN}', null, null);
    insert into event_replies (school_id, event_id, parent_id, answer, replied_at) values ('${A}', '${u(921)}', '${G_ASHA}', 'yes', '${at(0)}'), ('${A}', '${u(921)}', '${G_FARAH}', 'yes', '${at(0)}'), ('${A}', '${u(921)}', '${u(207)}', 'no', '${at(0)}');
    -- Parent AI: one draft waiting, one sent.
    insert into parent_ai_answers (school_id, student_id, parent_id, body, sources, ai_assisted, status, drafted_by, approved_by, approved_at) values
      ('${A}', '${ASHA}', '${G_ASHA}', 'Practise fractions with fruit.', '[{"kind":"followup"}]', false, 'draft', '${TARA}', null, null), ('${A}', '${FARAH}', '${G_FARAH}', 'Read for ten minutes.', '[{"kind":"followup"}]', false, 'sent', '${TARUN}', '${TARUN}', '${at(1)}');
    -- Tickets: Tara's is open, the principal's waits on the school, the accountant's is resolved. School B has one of its own, open.
    insert into support_tickets (school_id, raised_by, raised_role, category, subject, body, status) values
      ('${A}', '${TARA}', 'teacher', 'how_to', 'How do I mark leave?', 'I cannot find the leave button.', 'open'), ('${A}', '${PRINCIPAL}', 'principal', 'how_to', 'Fee heads', 'How do I add a new fee head?', 'waiting_on_school'), ('${A}', '${ACCOUNTANT}', 'accountant', 'billing', 'Receipt format', 'The receipt number format.', 'resolved'),
      ('${B}', '${u(192)}', 'principal', 'how_to', 'Another school', 'A ticket of another school.', 'open');
    -- School A works every day of the week, so today's periods are periods to cover whatever day the tests run on.
    insert into school_settings (school_id, module_id, schema_version, setting_values, revision) values ('${A}', 'setup', 2, '{"working_days": ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]}', 1);
    -- Staff leave. Waiting for the office: Tara's (in three days) and the school admin's own (in six days).
    -- Approved: Tarun's, yesterday to tomorrow, so he is on leave today; the coordinator's ended last week; Tina's
    -- is for later. The accountant's request for today was refused and Tina's for today was withdrawn: neither is
    -- leave. School B has a request waiting and a teacher away today: never counted.
    insert into staff_leave (leave_id, school_id, user_id, from_date, to_date, kind, reason, status, asked_at, recorded_by, decided_by, decided_at, decision_note, withdrawn_by, withdrawn_at) values
      ('${TARA_LEAVE}', '${A}', '${TARA}', '${day(-3)}', '${day(-4)}', 'casual', 'A family function in another town.', 'waiting', '${at(2)}', '${TARA}', null, null, null, null, null),
      ('${u(952)}', '${A}', '${ADMIN}', '${day(-6)}', '${day(-6)}', 'other', 'A day at the district office.', 'waiting', '${at(1)}', '${ADMIN}', null, null, null, null, null),
      ('${u(953)}', '${A}', '${TARUN}', '${day(1)}', '${day(-1)}', 'sick', 'Unwell, phoned in.', 'approved', '${at(2)}', '${TARUN}', '${PRINCIPAL}', '${at(2)}', null, null, null),
      ('${u(954)}', '${A}', '${COORDINATOR}', '${day(10)}', '${day(8)}', 'casual', 'A wedding in the family.', 'approved', '${at(15)}', '${COORDINATOR}', '${PRINCIPAL}', '${at(14)}', null, null, null),
      ('${u(955)}', '${A}', '${TINA}', '${day(-2)}', '${day(-3)}', 'casual', 'A visit home.', 'approved', '${at(3)}', '${TINA}', '${ADMIN}', '${at(2)}', null, null, null),
      ('${u(956)}', '${A}', '${ACCOUNTANT}', '${day(0)}', '${day(0)}', 'casual', 'A day off.', 'refused', '${at(3)}', '${ACCOUNTANT}', '${ADMIN}', '${at(2)}', 'The month is closing.', null, null),
      ('${u(957)}', '${A}', '${TINA}', '${day(0)}', '${day(0)}', 'other', 'A bank visit.', 'withdrawn', '${at(4)}', '${TINA}', null, null, null, '${TINA}', '${at(3)}'),
      ('${u(958)}', '${B}', '${u(192)}', '${day(-1)}', '${day(-1)}', 'casual', 'Another school.', 'waiting', '${at(1)}', '${u(192)}', null, null, null, null, null),
      ('${u(959)}', '${B}', '${u(193)}', '${day(0)}', '${day(0)}', 'sick', 'Another school.', 'approved', '${at(1)}', '${u(193)}', '${u(192)}', '${at(1)}', null, null, null);
    -- The timetable of today's weekday: Tarun teaches 6-B in periods 1, 2 and 3; Tara teaches 5-A in periods 1 and 3.
    -- Tomorrow's weekday has one more period of Tarun's, which is not today's.
    insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values
      ('${A}', '${C6B}', ${WEEKDAY}, 1, '${MATHS}', '${TARUN}'), ('${A}', '${C6B}', ${WEEKDAY}, 2, '${MATHS}', '${TARUN}'), ('${A}', '${C6B}', ${WEEKDAY}, 3, '${MATHS}', '${TARUN}'),
      ('${A}', '${C5A}', ${WEEKDAY}, 1, '${MATHS}', '${TARA}'), ('${A}', '${C5A}', ${WEEKDAY}, 3, '${MATHS}', '${TARA}'),
      ('${A}', '${C6B}', ${NEXT_WEEKDAY}, 4, '${MATHS}', '${TARUN}');
    -- Covers for Tarun's three periods today. Period 1: Tina covers it. Period 2: a cover was assigned and undone,
    -- so nobody covers it. Period 3: given to Tara, who teaches her own class then, so she cannot take it.
    -- Two of the three still need cover. Yesterday's cover is not today's.
    insert into substitutions (school_id, on_date, period, class_id, subject_id, absent_user_id, substitute_user_id, status, assigned_by, assigned_at, undone_by, undone_at) values
      ('${A}', '${day(0)}', 1, '${C6B}', '${MATHS}', '${TARUN}', '${TINA}', 'assigned', '${ADMIN}', '${at(0)}', null, null),
      ('${A}', '${day(0)}', 2, '${C6B}', '${MATHS}', '${TARUN}', '${TINA}', 'undone', '${ADMIN}', '${at(0)}', '${ADMIN}', '${at(0)}'),
      ('${A}', '${day(0)}', 3, '${C6B}', '${MATHS}', '${TARUN}', '${TARA}', 'assigned', '${ADMIN}', '${at(0)}', null, null),
      ('${A}', '${day(1)}', 2, '${C6B}', '${MATHS}', '${TARUN}', '${TINA}', 'assigned', '${ADMIN}', '${at(1)}', null, null);
    set session_replication_role = origin;
  `);
  return db;
}
