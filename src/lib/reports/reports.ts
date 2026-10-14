import { PRESENT_RATE_RULE_VERSION, marksByDay, marksTotal, presentRate } from '@/lib/attendance/day';
import type { SchoolRole } from '@/lib/contracts/modules';
import { listDues } from '@/lib/fees/overdue';
import { collectedByDay } from '@/lib/fees/payments';
import { followUpList } from '@/lib/fees/recovery';
import { classLabel } from '@/lib/frameworks/class-label';
import { countAssignmentsByClass } from '@/lib/homework/homework';
import { datesIn } from '@/lib/insights/screens';
import { sentTotalsByClass } from '@/lib/pulse/drafts';
import { leaveCalendar } from '@/lib/staff/leave';
import { MESSAGE_STATES, countMessages, messagesInAll } from '@/lib/whatsapp/delivery';
import { REPORT_SOURCE_ROWS_MAX, ReportTooLarge, type ReportContext, type ReportDefinition, type ReportId, type ReportNote, type ReportRow, type ReportSql } from './types';

// The reports of v1 (docs/26 slice 8h, C207). Read types.ts first.
//
// Where each report's rows come from, and the dashboard number its total equals:
//   daily-collection     collectedByDay (collectedBetween, a day and a method at a time)     fees.collected
//   dues                 listDues('overdue') (the entries /app/fees?show=overdue lists),     fees.overdue
//                        with the last follow-up of the recovery list (followUpList)
//   attendance-by-class  the attendance marks of the days, by the class they were saved      attendance.present_rate
//   absentees            under; the rate is presentRate (src/lib/attendance/day.ts)          (its "absent" part)
//   homework-coverage    countAssignmentsByClass (countAssignmentsIn, a class at a time)     homework.set, .checked, .not_done
//   pulse-coverage       sentTotalsByClass (sentTotals, a class at a time)                   pulse.sent, .understood, .needs_help
//   messages-by-state    countMessages, a day at a time (the counts of /app/communication)   messages.total, .failed, .held
//   staff-leave          leaveCalendar (the office's own list on /app/staff)                 (none)
//
// A report that is a row a day or a row a class is COUNTED IN THE DATABASE by its module, with the query the
// dashboard's number is counted by: it reads no list, so no year is too busy for it. Only the three whose own rows
// are a list (absentees, dues, staff leave) read one, whole, and are refused past REPORT_SOURCE_ROWS_MAX rather
// than cut short.
//
// The two attendance reports have no module list to group (the module's own list is by day), so their rows are
// counted here from the same table over the same days, and the rate is the module's rule. The days on which the
// school has a mark are the module's own count (marksByDay), the one the dashboard says.
//
// Who may read what follows the school facts (src/lib/insights/facts.ts): the roles the tables' row level
// security lets read, narrowed to the roles the report's module is for, and to the four roles Reports is for.
//   fees_ledger, payments, receipts, fee_followups   principal, school admin, accountant
//   attendance, homework                             principal, school admin, academic coordinator
//   pulse_messages                                   principal, school admin (Daily Pulse is not a coordinator's module)
//   communication_log, staff_leave                   principal, school admin
// Attendance, Daily Pulse messages and the message log have no role policy in the database: for them this list
// is what keeps the report from a role it is not for, and runReport (load.ts) refuses before any query runs.

const OFFICE: readonly SchoolRole[] = ['principal', 'school_admin'];
const FINANCE: readonly SchoolRole[] = ['principal', 'school_admin', 'accountant'];
const ACADEMIC: readonly SchoolRole[] = ['principal', 'school_admin', 'academic_coordinator'];

const n = (v: unknown) => Number(v ?? 0);
// A module's list, whole: one row more than the limit was asked for, so a list that is longer is known to be.
const wholeList = <T>(id: ReportId, rows: T[]): T[] => {
  if (rows.length > REPORT_SOURCE_ROWS_MAX) throw new ReportTooLarge(id);
  return rows;
};
const ASK = REPORT_SOURCE_ROWS_MAX + 1;

// The methods a receipt can carry (the receipts table's own check). A method this list does not know stops the
// report rather than leave money out of a row.
export const RECEIPT_METHODS = ['cash', 'upi', 'cheque', 'card', 'netbanking', 'online'] as const;

// Every class of the school by its id, as the screens write it ("5-A").
async function classLabels(db: ReportSql, schoolId: string): Promise<Map<string, { label: string; order: string }>> {
  const { rows } = await db.query(`select class_id, name, section from classes where school_id = $1`, [schoolId]);
  return new Map(rows.map((r) => [r.class_id as string, { label: classLabel(r.name as string | null, r.section as string | null) ?? '', order: `${r.name ?? ''}\u0000${r.section ?? ''}\u0000${r.class_id}` }]));
}
const byOrder = <T extends { order: string }>(a: T, b: T) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0);

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

async function dailyCollection(db: ReportSql, ctx: ReportContext): Promise<{ rows: ReportRow[] }> {
  // The receipts of the days as the dashboard counts them (collectedBetween), a day and a method at a time: how
  // many stand and for how much, and how many were reversed later. The reversed ones count for nothing in the
  // amounts and are shown apart.
  const days = new Map<string, ReportRow>();
  for (const c of await collectedByDay(db as never, ctx.schoolId, ctx.range.from, ctx.range.to)) {
    if (!(RECEIPT_METHODS as readonly string[]).includes(c.method)) throw new Error(`a receipt has a method this report does not know: ${c.method}`);
    if (!days.has(c.day)) days.set(c.day, { day: c.day, receipts: 0, amount: 0, ...Object.fromEntries(RECEIPT_METHODS.map((m) => [m, 0])), reversed: 0 });
    const row = days.get(c.day) as ReportRow;
    row.receipts = n(row.receipts) + c.count;
    row.amount = n(row.amount) + c.minor;
    row[c.method] = n(row[c.method]) + c.minor;
    row.reversed = n(row.reversed) + c.reversed;
  }
  return { rows: [...days.values()].sort((a, b) => String(a.day).localeCompare(String(b.day))) };
}

// The most families the recovery list holds (src/lib/fees/recovery.ts, followUpList). Past it, a family's last
// follow-up is not known here, and the report says so instead of "none".
const RECOVERY_LIST_ROWS = 500;

async function duesAndDefaulters(db: ReportSql, ctx: ReportContext): Promise<{ rows: ReportRow[]; notes?: ReportNote[] }> {
  // Overdue by the one rule (src/lib/fees/overdue.ts): the entries the Fees screen lists, each with what is still owed.
  const dues = wholeList('dues', await listDues(db, ctx.schoolId, 'overdue', ASK));
  if (dues.length === 0) return { rows: [] };
  // The last thing the office did, from the recovery list: it is the office's own record of each family.
  const followups = await followUpList(db as never, ctx.schoolId);
  // Who pays: a family, or a child with no family on record. The recovery list names a family by one of its
  // children, who need not be a child with an overdue entry here, so both lists' children are looked up.
  const people = await db.query(
    `select st.student_id, st.family_id, f.family_code
       from fee_billing_students() st left join families f on f.school_id = st.school_id and f.family_id = st.family_id
      where st.school_id = $1 and st.student_id = any($2::uuid[])`,
    [ctx.schoolId, [...new Set([...dues.map((d) => d.student_id), ...followups.map((f) => f.student_id)])]]
  );
  const payerOf = new Map(people.rows.map((p) => [p.student_id as string, { key: (p.family_id as string | null) ?? (p.student_id as string), code: (p.family_code as string | null) ?? null }]));
  type Payer = { key: string; code: string | null; children: Map<string, string>; entries: number; owed: number; oldest: string };
  const payers = new Map<string, Payer>();
  for (const d of dues) {
    const who = payerOf.get(d.student_id) ?? { key: d.student_id, code: null };
    if (!payers.has(who.key)) payers.set(who.key, { key: who.key, code: who.code, children: new Map(), entries: 0, owed: 0, oldest: d.due_date });
    const p = payers.get(who.key) as Payer;
    p.children.set(d.student_id, d.student_name ?? '');
    p.entries += 1;
    p.owed += d.balance_minor;
    if (d.due_date < p.oldest) p.oldest = d.due_date;
  }
  const lastOf = new Map(followups.map((f) => [payerOf.get(f.student_id)?.key ?? f.student_id, f]));
  const listCut = followups.length >= RECOVERY_LIST_ROWS;
  const rows = [...payers.values()].map((p) => {
    // The family's name on the page is the recovery list's own: its code, then the first child by name.
    const names = [...p.children.entries()].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])).map(([, name]) => name);
    const last = lastOf.get(p.key);
    return {
      payer: `${p.code ? `${p.code} · ` : ''}${names[0]}`,
      children: p.children.size,
      entries: p.entries,
      owed: p.owed,
      oldest_due: p.oldest,
      last_followup: last ? (last.last_kind ?? 'none') : listCut ? 'unknown' : 'none',
      last_on: last?.last_on ?? null,
    } satisfies ReportRow;
  });
  // The longest wait first, then by name: the recovery list's own order. Never by the amount.
  rows.sort((a, b) => a.oldest_due.localeCompare(b.oldest_due) || a.payer.localeCompare(b.payer));
  return { rows, ...(listCut && rows.some((r) => r.last_followup === 'unknown') ? { notes: [{ key: 'rpt.dues.note.followups', params: { count: RECOVERY_LIST_ROWS } }] } : {}) };
}

async function attendanceByClass(db: ReportSql, ctx: ReportContext): Promise<{ rows: ReportRow[]; whole: Record<string, number> }> {
  // Every mark saved in the days, under the class it was saved for. One mark is in one class, so the classes
  // add up to the school's marks: the ones the dashboard's present rate is worked out from. The DAYS do not add
  // up: a day two classes were marked on is one day of the school. So the total row's days are counted for the
  // school by the module's own function, the one the dashboard's "Days with a mark saved" is.
  const { rows } = await db.query(
    `select a.class_id, c.name, c.section, count(distinct a.date)::int as days,
            (count(*) filter (where a.status = 'present'))::int as present, (count(*) filter (where a.status = 'late'))::int as late,
            (count(*) filter (where a.status = 'absent'))::int as absent, (count(*) filter (where a.status = 'leave'))::int as leave
       from attendance a
       left join classes c on c.school_id = a.school_id and c.class_id = a.class_id
      where a.school_id = $1 and a.date between $2::date and $3::date
      group by a.class_id, c.name, c.section
      order by c.name, c.section, a.class_id`,
    [ctx.schoolId, ctx.range.from, ctx.range.to]
  );
  const school = marksTotal(await marksByDay(db, ctx.schoolId, ctx.range.from, ctx.range.to));
  return { rows: rows.map((r) => ({ class: classLabel(r.name as string | null, r.section as string | null), days: n(r.days), present: n(r.present), late: n(r.late), absent: n(r.absent), leave: n(r.leave) })), whole: { days: school.days } };
}

async function absentees(db: ReportSql, ctx: ReportContext): Promise<{ rows: ReportRow[] }> {
  // A row a student marked absent on a day of the range, in the class the mark was saved for. By class and
  // then name: never by how many days. A student this role may not see by name (waiting for consent) is still
  // counted, without the name, so the total is every absence of the days.
  const { rows } = await db.query(
    `select c.name as class_name, c.section, s.name, s.roll_no, count(*)::int as days, array_agg(a.date::text order by a.date) as dates
       from attendance a
       left join students s on s.school_id = a.school_id and s.student_id = a.student_id
       left join classes c on c.school_id = a.school_id and c.class_id = a.class_id
      where a.school_id = $1 and a.date between $2::date and $3::date and a.status = 'absent'
      group by a.class_id, c.name, c.section, a.student_id, s.name, s.roll_no
      order by c.name, c.section, a.class_id, s.name, a.student_id
      limit $4`,
    [ctx.schoolId, ctx.range.from, ctx.range.to, ASK]
  );
  return { rows: wholeList('absentees', rows).map((r) => ({ class: classLabel(r.class_name as string | null, r.section as string | null), student: (r.name as string | null) ?? null, roll_no: (r.roll_no as string | null) ?? null, days: n(r.days), dates: r.dates as string[] })) };
}

// A row a class from a module's counts by class, in the order of the classes' names; a class the reader cannot
// name (it is no longer on record) keeps its counts, comes last and says so.
async function byClass<T extends { class_id: string }>(db: ReportSql, schoolId: string, counted: readonly T[], row: (c: T) => ReportRow): Promise<ReportRow[]> {
  const labels = await classLabels(db, schoolId);
  return counted.map((c) => ({ order: labels.get(c.class_id)?.order ?? `\uffff${c.class_id}`, row: { class: labels.get(c.class_id)?.label ?? null, ...row(c) } })).sort(byOrder).map((c) => c.row);
}

async function homeworkCoverage(db: ReportSql, ctx: ReportContext): Promise<{ rows: ReportRow[] }> {
  // The module's own counts (countAssignmentsIn, the dashboard's numbers), a class at a time: what was given out
  // in the days; of what fell due in them, what is checked for every student and what is not yet; and how many
  // times a student was marked "not done". What each count holds is said once, in src/lib/homework/homework.ts.
  const counted = await countAssignmentsByClass(db as never, ctx.schoolId, ctx.range.from, ctx.range.to);
  // A class whose homework due in the days was all for a roll with nobody on it, and given out before them, has
  // nothing to say: nothing is not a row of zeros.
  const some = counted.filter((c) => c.set + c.due + c.notDoneMarks > 0);
  return { rows: await byClass(db, ctx.schoolId, some, (c) => ({ set: c.set, due: c.due, checked: c.checked, unchecked: c.unchecked, not_done: c.notDoneMarks })) };
}

async function pulseCoverage(db: ReportSql, ctx: ReportContext): Promise<{ rows: ReportRow[] }> {
  // The module's own totals (sentTotals, the dashboard's numbers), a class at a time: the messages a person sent
  // for the lessons of the days, how many went out or were held, and what parents answered.
  const counted = await sentTotalsByClass(db as never, ctx.schoolId, ctx.range.from, ctx.range.to);
  return { rows: await byClass(db, ctx.schoolId, counted, (c) => ({ sent: c.sent, queued: c.queued, held: c.held, understood: c.understood, needs_help: c.needs_help })) };
}

async function messagesByState(db: ReportSql, ctx: ReportContext): Promise<{ rows: ReportRow[] }> {
  // The Communication screen's own count, asked a day at a time: the days are apart, so they add up to the
  // count for the whole span. A day with no message has no row. No name and no number: counts only.
  const rows: ReportRow[] = [];
  for (const day of datesIn(ctx.range)) {
    const counts = await countMessages(db as never, ctx.schoolId, { from: day, to: day });
    const all = messagesInAll(counts);
    if (all > 0) rows.push({ day, ...Object.fromEntries(MESSAGE_STATES.map((s) => [s, n(counts[s])])), all });
  }
  return { rows };
}

async function staffLeave(db: ReportSql, ctx: ReportContext): Promise<{ rows: ReportRow[] }> {
  // Approved leave with a day in the range: the office's own list (src/lib/staff/leave.ts), which the database
  // lets nobody else read, in that list's own order (the first day, then the name). A ROW IS ONE LEAVE: who, its
  // first and last day, and how many of its days fall inside the range. Leave is for running the day, so nothing
  // here adds up one person's leave, puts people in the order of a count or sets them side by side (docs/26 §3
  // rule 4, and the leave module's own rule). Never the kind of leave or the reason.
  const { from, to } = ctx.range;
  const leave = wholeList('staff-leave', await leaveCalendar(db as never, { schoolId: ctx.schoolId, userId: ctx.userId, role: ctx.role }, from, to, ctx.today, ASK));
  return { rows: leave.map((l) => ({ name: l.name, from_date: l.from_date, to_date: l.to_date, days: dayNumber(l.to_date < to ? l.to_date : to) - dayNumber(l.from_date > from ? l.from_date : from) + 1 })) };
}

export const REPORTS: readonly ReportDefinition[] = [
  // ---- Fees (finance roles only; never beside anything about learning) ------------
  {
    id: 'daily-collection', moduleId: 'fees', group: 'money', roles: FINANCE, period: 'range', version: 1, sources: ['receipts'],
    columns: [
      { key: 'day', label: 'rpt.col.day', unit: 'date', total: 'label' },
      { key: 'receipts', label: 'rpt.col.receipts', unit: 'count', total: 'sum' },
      { key: 'amount', label: 'rpt.col.collected', unit: 'inr_paise', total: 'sum' },
      ...RECEIPT_METHODS.map((m) => ({ key: m, label: `rpt.col.method.${m}` as const, unit: 'inr_paise' as const, total: 'sum' as const })),
      { key: 'reversed', label: 'rpt.col.reversed', unit: 'count', total: 'sum' },
    ],
    agrees: [{ column: 'amount', fact: 'fees.collected', pick: 'value' }, { column: 'receipts', fact: 'fees.collected', pick: 'count' }, { column: 'reversed', fact: 'fees.collected', pick: { part: 'reversed' } }],
    run: dailyCollection,
  },
  {
    id: 'dues', moduleId: 'fees', group: 'money', roles: FINANCE, period: 'now', version: 1, sources: ['fees_ledger', 'payments', 'fee_followups'],
    columns: [
      { key: 'payer', label: 'rpt.col.payer', unit: 'text', total: 'label' },
      { key: 'children', label: 'rpt.col.children', unit: 'count', total: 'sum' },
      { key: 'entries', label: 'rpt.col.entries', unit: 'count', total: 'sum' },
      { key: 'owed', label: 'rpt.col.owed', unit: 'inr_paise', total: 'sum' },
      { key: 'oldest_due', label: 'rpt.col.oldestDue', unit: 'date', total: 'none' },
      { key: 'last_followup', label: 'rpt.col.lastFollowup', unit: 'word', total: 'none', words: 'rpt.followup.' },
      { key: 'last_on', label: 'rpt.col.lastOn', unit: 'date', total: 'none' },
    ],
    agrees: [{ column: 'owed', fact: 'fees.overdue', pick: 'value' }, { column: 'entries', fact: 'fees.overdue', pick: 'count' }],
    // A school that has never raised a fee has no dues to be late with: "not set up", as the dashboard says.
    notSetUpAs: 'fees.overdue',
    run: duesAndDefaulters,
  },

  // ---- Attendance and homework (the office and the academic coordinator) ----------
  {
    id: 'attendance-by-class', moduleId: 'attendance', group: 'learning', roles: ACADEMIC, period: 'range', version: PRESENT_RATE_RULE_VERSION, sources: ['attendance', 'classes'],
    columns: [
      { key: 'class', label: 'rpt.col.class', unit: 'text', total: 'label', empty: 'rpt.empty.class' },
      // Each class's own days. The total row's are the school's: a day two classes were marked on is one day.
      { key: 'days', label: 'rpt.col.daysMarked', unit: 'count', total: 'whole' },
      { key: 'present', label: 'att.status.present', unit: 'count', total: 'sum' },
      { key: 'late', label: 'att.status.late', unit: 'count', total: 'sum' },
      { key: 'absent', label: 'att.status.absent', unit: 'count', total: 'sum' },
      { key: 'leave', label: 'att.status.leave', unit: 'count', total: 'sum' },
      { key: 'rate', label: 'rpt.col.presentRate', unit: 'percent', total: 'worked' },
    ],
    agrees: [
      { column: 'rate', fact: 'attendance.present_rate', pick: 'value' },
      { column: 'days', fact: 'attendance.present_rate', pick: 'total' },
      ...(['present', 'late', 'absent', 'leave'] as const).map((k) => ({ column: k, fact: 'attendance.present_rate' as const, pick: { part: k } })),
    ],
    // The present rate by the one rule (src/lib/attendance/day.ts), for a class and for the school alike.
    worked: (c) => ({ rate: presentRate({ present: n(c.present), late: n(c.late), absent: n(c.absent), leave: n(c.leave) }) }),
    run: attendanceByClass,
  },
  {
    id: 'absentees', moduleId: 'attendance', group: 'learning', roles: ACADEMIC, period: 'range', version: 1, sources: ['attendance', 'students', 'classes'],
    columns: [
      { key: 'class', label: 'rpt.col.class', unit: 'text', total: 'label', empty: 'rpt.empty.class' },
      { key: 'student', label: 'rpt.col.student', unit: 'text', total: 'none', empty: 'rpt.empty.student' },
      { key: 'roll_no', label: 'rpt.col.rollNo', unit: 'text', total: 'none' },
      { key: 'days', label: 'rpt.col.daysAbsent', unit: 'count', total: 'sum' },
      { key: 'dates', label: 'rpt.col.dates', unit: 'dates', total: 'none' },
    ],
    agrees: [{ column: 'days', fact: 'attendance.present_rate', pick: { part: 'absent' } }],
    run: absentees,
  },
  {
    id: 'homework-coverage', moduleId: 'homework', group: 'learning', roles: ACADEMIC, period: 'range', version: 1, sources: ['homework', 'homework_targets', 'homework_status', 'students'],
    columns: [
      { key: 'class', label: 'rpt.col.class', unit: 'text', total: 'label', empty: 'rpt.empty.class' },
      { key: 'set', label: 'rpt.col.hwSet', unit: 'count', total: 'sum' },
      { key: 'due', label: 'rpt.col.hwDue', unit: 'count', total: 'sum' },
      { key: 'checked', label: 'rpt.col.hwChecked', unit: 'count', total: 'sum' },
      { key: 'unchecked', label: 'rpt.col.hwUnchecked', unit: 'count', total: 'sum' },
      { key: 'not_done', label: 'rpt.col.hwNotDone', unit: 'count', total: 'sum' },
    ],
    agrees: [{ column: 'set', fact: 'homework.set', pick: 'value' }, { column: 'checked', fact: 'homework.checked', pick: 'value' }, { column: 'due', fact: 'homework.checked', pick: 'total' }, { column: 'unchecked', fact: 'homework.checked', pick: { part: 'unchecked' } }, { column: 'not_done', fact: 'homework.not_done', pick: 'value' }],
    run: homeworkCoverage,
  },

  // ---- Parents (the office) --------------------------------------------------------
  {
    id: 'pulse-coverage', moduleId: 'pulse', group: 'parents', roles: OFFICE, period: 'range', version: 1, sources: ['pulse_messages', 'communication_log', 'pulse_response_log'],
    columns: [
      { key: 'class', label: 'rpt.col.class', unit: 'text', total: 'label', empty: 'rpt.empty.class' },
      { key: 'sent', label: 'rpt.col.pulseSent', unit: 'count', total: 'sum' },
      { key: 'queued', label: 'rpt.col.pulseQueued', unit: 'count', total: 'sum' },
      { key: 'held', label: 'rpt.col.pulseHeld', unit: 'count', total: 'sum' },
      { key: 'understood', label: 'rpt.col.pulseUnderstood', unit: 'count', total: 'sum' },
      { key: 'needs_help', label: 'rpt.col.pulseNeedsHelp', unit: 'count', total: 'sum' },
    ],
    agrees: [{ column: 'sent', fact: 'pulse.sent', pick: 'value' }, { column: 'queued', fact: 'pulse.sent', pick: { part: 'queued' } }, { column: 'held', fact: 'pulse.sent', pick: { part: 'held' } }, { column: 'understood', fact: 'pulse.understood', pick: 'value' }, { column: 'needs_help', fact: 'pulse.needs_help', pick: 'value' }],
    run: pulseCoverage,
  },
  {
    id: 'messages-by-state', moduleId: 'communication', group: 'parents', roles: OFFICE, period: 'range', version: 1, sources: ['communication_log'],
    columns: [
      { key: 'day', label: 'rpt.col.day', unit: 'date', total: 'label' },
      ...MESSAGE_STATES.map((s) => ({ key: s, label: `msg.state.${s}` as const, unit: 'count' as const, total: 'sum' as const })),
      { key: 'all', label: 'rpt.col.allMessages', unit: 'count', total: 'sum' },
    ],
    agrees: [{ column: 'all', fact: 'messages.total', pick: 'value' }, ...MESSAGE_STATES.map((s) => ({ column: s, fact: 'messages.total' as const, pick: { part: s } })), { column: 'failed', fact: 'messages.failed', pick: 'value' }, { column: 'held', fact: 'messages.held', pick: 'value' }],
    run: messagesByState,
  },

  // ---- Staff (the office only: the table lets nobody else read another person's leave) ----
  {
    id: 'staff-leave', moduleId: 'staff', group: 'staff', roles: OFFICE, period: 'range', version: 1, sources: ['staff_leave'],
    columns: [
      { key: 'name', label: 'rpt.col.staffName', unit: 'text', total: 'label' },
      { key: 'from_date', label: 'rpt.col.leaveFrom', unit: 'date', total: 'none' },
      { key: 'to_date', label: 'rpt.col.leaveTo', unit: 'date', total: 'none' },
      { key: 'days', label: 'rpt.col.leaveDays', unit: 'count', total: 'sum' },
    ],
    agrees: [],
    run: staffLeave,
  },
];
