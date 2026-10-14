import { PRESENT_RATE_RULE_VERSION, classesOnDay, dayTotals, marksByDay, marksTotal, presentRate } from '@/lib/attendance/day';
import { listNotices } from '@/lib/communication/notices';
import { SCHOOL_ROLES, type SchoolRole } from '@/lib/contracts/modules';
import type { TicketShow } from '@/lib/contracts/tickets';
import { listEvents } from '@/lib/events/events';
import { loadFeesSummary } from '@/lib/fees/overdue';
import { collectedBetween } from '@/lib/fees/payments';
import { promisesDue } from '@/lib/fees/recovery';
import { countAssignmentsIn } from '@/lib/homework/homework';
import { listAnswers } from '@/lib/parent-ai/answers';
import { waitingReports } from '@/lib/payments/upi';
import { listPtms } from '@/lib/ptm/ptm';
import { sentTotals } from '@/lib/pulse/drafts';
import { listFollowups } from '@/lib/pulse/followups';
import { TICKET_ROWS_MAX, listTickets } from '@/lib/support/tickets';
import { schoolSpend } from '@/lib/whatsapp/cost';
import { MESSAGE_STATES, countMessages, messagesInAll } from '@/lib/whatsapp/delivery';
import { datesIn, screenFor } from './screens';
import type { FactContext, FactDefinition, FactId, FactNumbers, InsightsSql } from './types';

// The school facts themselves (docs/26 slice 8d, C203). Read types.ts first.
//
// One rule, one place (docs/26 §3 rule 2): a fact does not write a second
// definition of anything a screen already computes. It calls that screen's
// own function (the fee summary, the month's spend, the lists the screens
// show) and counts what comes back, so the number IS the rows of the screen
// it opens. Where a screen had no list of the rows (which classes are
// marked, which fee entries are overdue), the list was added to the
// module's own library and its screen, and the fact counts that list.
// Where a list can be long (receipts, homework, WhatsApp and Daily Pulse
// messages of a month), the module's library has the total beside the
// list, built from the same query, so a busy school's number is never cut
// short at the list's row limit; the screen says when its rows are. The
// short lists (notices waiting, events coming, draft answers, open tickets,
// promises) are counted as listed: above their own limit the number is the
// rows on that screen.
//
// A fact has an address (`href`) only when that screen lists exactly its
// rows for that address. NO_LIST_YET names the facts whose screen has no
// such list yet: they are counted and shown, without a link.
//
// Every query names the school (`ctx.schoolId`): row level security narrows
// a school session further (a role, a teacher's own classes), but a fact
// never relies on it to choose the school, so the same call from a job or a
// check that runs as the platform role still counts one school's rows.
//
// The roles of each fact are the roles its tables' row level security lets
// read (supabase/migrations), narrowed to the roles the module is for
// (contracts/modules.ts). Who may read what, table by table:
//   fees_ledger, payments, receipts, fee_followups, payment_reports   principal, school admin, accountant
//   homework, homework_targets, homework_status, pulse_followups      principal, school admin, coordinator, teacher (own classes)
//   complaints, class_notices, ptm_*, school_events, parent_ai_answers  principal, school admin, teacher (own)
//   students waiting for consent                                       principal, school admin, teacher (own classes)
//   support_tickets                                                    the office all, anyone else their own
//   attendance, pulse_messages, communication_log, schools            no role policy: every role of the school (a
//     teacher: own classes). For these the roles below are the only thing that keeps the fact from a role it is not
//     for: loadFact (load.ts) refuses such a role before any query runs. test/insights/access.test.ts names each
//     such pair; a restrictive role policy on each of these tables (a migration) is what would close them in the
//     database itself.

const OFFICE: readonly SchoolRole[] = ['principal', 'school_admin'];
const TEACHING: readonly SchoolRole[] = ['principal', 'school_admin', 'academic_coordinator', 'teacher'];
const ENGAGEMENT: readonly SchoolRole[] = ['principal', 'school_admin', 'teacher'];
const FINANCE: readonly SchoolRole[] = ['principal', 'school_admin', 'accountant'];

const n = (v: unknown) => Number(v ?? 0);
const NOT_SET_UP: FactNumbers = { state: 'not_set_up', value: null };

// ---- Shared reads: each runs once for a load ---------------------------------

const attendanceToday = (db: InsightsSql, ctx: FactContext) => ctx.once('attendance.day', async () => dayTotals(await classesOnDay(db, ctx.schoolId, ctx.today)));
const studentCounts = (db: InsightsSql, ctx: FactContext) =>
  ctx.once('students', async () => {
    const r = (await db.query(`select count(*) filter (where status = 'active') as active, count(*) filter (where status = 'pending_consent') as pending, count(*) as records from students where school_id = $1`, [ctx.schoolId])).rows[0];
    return { active: n(r?.active), pending: n(r?.pending), records: n(r?.records) };
  });
const feeSummary = (db: InsightsSql, ctx: FactContext) =>
  ctx.once('fees.summary', async () => ({ ...(await loadFeesSummary(db, ctx.schoolId)), raised: (await db.query(`select exists (select 1 from fees_ledger where school_id = $1) as any`, [ctx.schoolId])).rows[0]?.any === true }));
const pulseSent = (db: InsightsSql, ctx: FactContext) => ctx.once('pulse.sent', () => sentTotals(db as never, ctx.schoolId, ctx.range.from, ctx.range.to));
const homework = (db: InsightsSql, ctx: FactContext) => ctx.once('homework', () => countAssignmentsIn(db as never, ctx.schoolId, ctx.range.from, ctx.range.to));
const messageCounts = (db: InsightsSql, ctx: FactContext) => ctx.once('messages', () => countMessages(db as never, ctx.schoolId, ctx.range));
const complaintCounts = (db: InsightsSql, ctx: FactContext) =>
  ctx.once('complaints', async () => {
    // Counted, not listed: the Complaints screen's own list marks every complaint as seen when the principal opens
    // it, and a number on a dashboard must not do that.
    const r = (await db.query(`select count(*) filter (where status = 'open') as open, count(*) filter (where status = 'open' and due_at <= now()) as overdue from complaints where school_id = $1`, [ctx.schoolId])).rows[0];
    return { open: n(r?.open), overdue: n(r?.overdue) };
  });
// The tickets of one of the two lists the Raise Ticket screen opens on (/app/help/ticket?show=…), this school's.
const tickets = (db: InsightsSql, ctx: FactContext, show: TicketShow) =>
  ctx.once(`tickets.${show}`, async () => {
    const listed = await listTickets(db as never, { schoolId: ctx.schoolId, show, limit: TICKET_ROWS_MAX });
    if (!listed.ok) throw new Error('tickets could not be listed');
    return listed.value;
  });

// Facts whose screen cannot yet list exactly their rows, so they carry no address: the Complaints and PTM
// screens (not this slice's files) show every complaint and every meeting, with no filter in the address. Each
// gets its `href` when its screen can open on the filter that lists these rows and no others
// (/app/complaints?show=open | overdue, /app/ptm?show=coming), and leaves this list then.
// test/insights/facts.test.ts holds the list to exactly the facts that have no address.
export const NO_LIST_YET: readonly FactId[] = ['complaints.open', 'complaints.overdue', 'ptm.coming'];

// A count of today's attendance, or "not set up" while no class has a student.
const attendanceCount = (pick: (t: Awaited<ReturnType<typeof attendanceToday>>) => FactNumbers) => async (db: InsightsSql, ctx: FactContext) => {
  const t = await attendanceToday(db, ctx);
  return t.students === 0 ? NOT_SET_UP : pick(t);
};

export const FACTS: readonly FactDefinition[] = [
  // ---- Attendance (today, and the present rate over the range) -----------------
  {
    id: 'attendance.classes_marked', moduleId: 'attendance', roles: TEACHING, unit: 'count', period: 'today', drill: 'rows', version: 1, sources: ['classes', 'students', 'attendance'],
    load: attendanceCount((t) => ({ value: t.classesMarked, total: t.classes, href: screenFor.attendance('marked'), parts: [{ key: 'marked', value: t.classesMarked, href: screenFor.attendance('marked') }, { key: 'unmarked', value: t.classes - t.classesMarked, href: screenFor.attendance('unmarked') }] })),
  },
  {
    // No attendance is expected on a Sunday (the rule of My Day's card), so it asks for nobody then.
    id: 'attendance.classes_unmarked', moduleId: 'attendance', roles: TEACHING, unit: 'count', period: 'today', drill: 'rows', version: 1, sources: ['classes', 'students', 'attendance'],
    load: async (db, ctx) => {
      const t = await attendanceToday(db, ctx);
      if (t.students === 0) return NOT_SET_UP;
      const unmarked = t.classes - t.classesMarked;
      return { value: unmarked, total: t.classes, href: screenFor.attendance('unmarked'), attention: unmarked > 0 && !ctx.sunday };
    },
  },
  {
    // A student on leave IS marked (the mistake of the first dashboard, which left them out).
    id: 'attendance.students_marked', moduleId: 'attendance', roles: TEACHING, unit: 'count', period: 'today', drill: 'rows', version: 2, sources: ['students', 'attendance'],
    load: attendanceCount((t) => ({ value: t.marked, total: t.students, href: screenFor.attendance('with-mark'), parts: [{ key: 'marked', value: t.marked, href: screenFor.attendance('with-mark') }, { key: 'not_marked', value: t.students - t.marked, href: screenFor.attendance('not-marked') }] })),
  },
  { id: 'attendance.present', moduleId: 'attendance', roles: TEACHING, unit: 'count', period: 'today', drill: 'rows', version: 1, sources: ['students', 'attendance'], load: attendanceCount((t) => ({ value: t.present, total: t.marked, href: screenFor.attendance('present') })) },
  { id: 'attendance.absent', moduleId: 'attendance', roles: TEACHING, unit: 'count', period: 'today', drill: 'rows', version: 1, sources: ['students', 'attendance'], load: attendanceCount((t) => ({ value: t.absent, total: t.marked, href: screenFor.attendance('absent') })) },
  { id: 'attendance.late', moduleId: 'attendance', roles: TEACHING, unit: 'count', period: 'today', drill: 'rows', version: 1, sources: ['students', 'attendance'], load: attendanceCount((t) => ({ value: t.late, total: t.marked, href: screenFor.attendance('late') })) },
  { id: 'attendance.leave', moduleId: 'attendance', roles: TEACHING, unit: 'count', period: 'today', drill: 'rows', version: 1, sources: ['students', 'attendance'], load: attendanceCount((t) => ({ value: t.leave, total: t.marked, href: screenFor.attendance('leave') })) },
  {
    // In school (present or late) out of every mark saved in the range; leave is marked and is not an absence.
    // `parts` carry the four counts, so a caller that needs another ratio does not count again. `total` is the
    // days with a mark saved: the rows of the list it opens, whose title says this same rate (marksTotal).
    id: 'attendance.present_rate', moduleId: 'attendance', roles: TEACHING, unit: 'percent', period: 'range', drill: 'figure', version: PRESENT_RATE_RULE_VERSION, sources: ['attendance'],
    load: async (db, ctx) => {
      const byDay = await marksByDay(db, ctx.schoolId, ctx.range.from, ctx.range.to);
      const sum = marksTotal(byDay);
      const days = new Map(byDay.map((d) => [d.date, presentRate(d)]));
      return {
        state: sum.rate === null ? 'no_data' : 'ok', value: sum.rate, total: sum.days, href: screenFor.attendanceDays(ctx.range),
        parts: (['present', 'late', 'absent', 'leave'] as const).map((k) => ({ key: k, value: sum[k] })),
        series: datesIn(ctx.range).map((date) => ({ date, value: days.get(date) ?? null })),
      };
    },
  },

  // ---- Students ----------------------------------------------------------------
  {
    id: 'students.active', moduleId: 'students', roles: SCHOOL_ROLES, unit: 'count', period: 'now', drill: 'rows', version: 1, sources: ['students'],
    load: async (db, ctx) => {
      const s = await studentCounts(db, ctx);
      return s.records === 0 ? NOT_SET_UP : { value: s.active, total: s.records, href: screenFor.students('active') };
    },
  },
  {
    id: 'students.waiting_consent', moduleId: 'students', roles: ENGAGEMENT, unit: 'count', period: 'now', drill: 'rows', version: 1, sources: ['students'],
    load: async (db, ctx) => {
      const s = await studentCounts(db, ctx);
      return s.records === 0 ? NOT_SET_UP : { value: s.pending, total: s.active + s.pending, href: screenFor.students('pending_consent'), attention: s.pending > 0 };
    },
  },

  // ---- Fees (finance roles only; never beside anything about learning) -----------
  {
    id: 'fees.collected', moduleId: 'fees', roles: FINANCE, unit: 'inr_paise', period: 'range', drill: 'rows', version: 1, sources: ['receipts'],
    load: async (db, ctx) => {
      const got = await collectedBetween(db as never, ctx.schoolId, ctx.range.from, ctx.range.to);
      return { value: got.minor, count: got.count, href: screenFor.collected(ctx.range), parts: [{ key: 'receipts', value: got.count }, { key: 'reversed', value: got.reversed }] };
    },
  },
  {
    id: 'fees.owed', moduleId: 'fees', roles: FINANCE, unit: 'inr_paise', period: 'now', drill: 'sum', version: 1, sources: ['fees_ledger', 'payments'],
    load: async (db, ctx) => {
      const f = await feeSummary(db, ctx);
      return f.raised ? { value: f.pendingMinor, href: screenFor.dues('owed') } : NOT_SET_UP;
    },
  },
  {
    id: 'fees.overdue', moduleId: 'fees', roles: FINANCE, unit: 'inr_paise', period: 'now', drill: 'rows', version: 1, sources: ['fees_ledger', 'payments'],
    load: async (db, ctx) => {
      const f = await feeSummary(db, ctx);
      return f.raised ? { value: f.overdueMinor, count: f.overdueCount, href: screenFor.dues('overdue'), attention: f.overdueCount > 0 } : NOT_SET_UP;
    },
  },
  {
    id: 'fees.promises_due', moduleId: 'fees', roles: FINANCE, unit: 'count', period: 'now', drill: 'rows', version: 1, sources: ['fee_followups'],
    load: async (db, ctx) => {
      const due = (await promisesDue(db as never, ctx.schoolId)).length;
      return { value: due, href: screenFor.fees('promises'), attention: due > 0 };
    },
  },
  {
    id: 'fees.upi_to_verify', moduleId: 'fees', roles: FINANCE, unit: 'count', period: 'now', drill: 'rows', version: 1, sources: ['payment_reports'],
    load: async (db, ctx) => {
      const waiting = (await waitingReports(db as never, ctx.schoolId)).length;
      return { value: waiting, href: screenFor.fees('verify'), attention: waiting > 0 };
    },
  },

  // ---- Daily Pulse and the needs-help queue -----------------------------------
  {
    id: 'pulse.sent', moduleId: 'pulse', roles: ENGAGEMENT, unit: 'count', period: 'range', drill: 'rows', version: 1, sources: ['pulse_messages', 'communication_log'],
    load: async (db, ctx) => {
      const sent = await pulseSent(db, ctx);
      return { value: sent.sent, href: screenFor.pulseSent(ctx.range), parts: [{ key: 'queued', value: sent.queued }, { key: 'held', value: sent.held }] };
    },
  },
  { id: 'pulse.understood', moduleId: 'pulse', roles: ENGAGEMENT, unit: 'count', period: 'range', drill: 'sum', version: 1, sources: ['pulse_messages', 'pulse_response_log'], load: async (db, ctx) => ({ value: (await pulseSent(db, ctx)).understood, href: screenFor.pulseSent(ctx.range) }) },
  { id: 'pulse.needs_help', moduleId: 'pulse', roles: ENGAGEMENT, unit: 'count', period: 'range', drill: 'sum', version: 1, sources: ['pulse_messages', 'pulse_response_log'], load: async (db, ctx) => ({ value: (await pulseSent(db, ctx)).needs_help, href: screenFor.pulseSent(ctx.range) }) },
  {
    id: 'followups.open', moduleId: 'pulse', roles: TEACHING, unit: 'count', period: 'now', drill: 'rows', version: 1, sources: ['pulse_followups'],
    load: async (db, ctx) => {
      const open = (await listFollowups(db as never, ctx.schoolId)).open.length;
      return { value: open, href: '/app/pulse', attention: open > 0 };
    },
  },

  // ---- Homework ----------------------------------------------------------------
  { id: 'homework.set', moduleId: 'homework', roles: TEACHING, unit: 'count', period: 'range', drill: 'rows', version: 1, sources: ['homework', 'homework_targets'], load: async (db, ctx) => ({ value: (await homework(db, ctx)).set, href: screenFor.homework('set', ctx.range) }) },
  {
    // Version 2: homework given to a section with nobody on its roll is not "due" and not "checked for everyone".
    id: 'homework.checked', moduleId: 'homework', roles: TEACHING, unit: 'count', period: 'range', drill: 'rows', version: 2, sources: ['homework_targets', 'homework_status', 'students'],
    load: async (db, ctx) => {
      const h = await homework(db, ctx);
      if (h.due === 0) return { state: 'no_data', value: null, total: 0, href: screenFor.homework('due', ctx.range) };
      return { value: h.checked, total: h.due, href: screenFor.homework('checked', ctx.range), parts: [{ key: 'checked', value: h.checked, href: screenFor.homework('checked', ctx.range) }, { key: 'unchecked', value: h.unchecked, href: screenFor.homework('unchecked', ctx.range) }] };
    },
  },
  { id: 'homework.not_done', moduleId: 'homework', roles: TEACHING, unit: 'count', period: 'range', drill: 'sum', version: 1, sources: ['homework_targets', 'homework_status', 'students'], load: async (db, ctx) => ({ value: (await homework(db, ctx)).notDoneMarks, href: screenFor.homework('not_done', ctx.range) }) },

  // ---- Messages to parents and what they cost ---------------------------------
  {
    // By state, with the meaning src/lib/whatsapp/delivery.ts gives each state: where the message is NOW.
    id: 'messages.total', moduleId: 'communication', roles: OFFICE, unit: 'count', period: 'range', drill: 'rows', version: 1, sources: ['communication_log'],
    load: async (db, ctx) => {
      const counts = await messageCounts(db, ctx);
      return { value: messagesInAll(counts), href: screenFor.messages(null, ctx.range), parts: MESSAGE_STATES.map((s) => ({ key: s, value: n(counts[s]), href: screenFor.messages(s, ctx.range) })) };
    },
  },
  {
    id: 'messages.failed', moduleId: 'communication', roles: OFFICE, unit: 'count', period: 'range', drill: 'rows', version: 1, sources: ['communication_log'],
    load: async (db, ctx) => {
      const failed = n((await messageCounts(db, ctx)).failed);
      return { value: failed, href: screenFor.messages('failed', ctx.range), attention: failed > 0 };
    },
  },
  {
    id: 'messages.held', moduleId: 'communication', roles: OFFICE, unit: 'count', period: 'range', drill: 'rows', version: 1, sources: ['communication_log'],
    load: async (db, ctx) => {
      const held = n((await messageCounts(db, ctx)).held);
      return { value: held, href: screenFor.messages('held', ctx.range), attention: held > 0 };
    },
  },
  {
    // This month's spend against the budget: schoolSpend, the function the Communication screen shows.
    id: 'whatsapp.spend', moduleId: 'communication', roles: OFFICE, unit: 'inr_paise', period: 'month', drill: 'figure', version: 1, sources: ['communication_log', 'schools'],
    load: async (db, ctx) => {
      const s = await schoolSpend(db as never, ctx.schoolId);
      if (s.budgetPaise === null) return { ...NOT_SET_UP, href: '/app/communication' };
      return { value: s.spentPaise, total: s.budgetPaise, href: '/app/communication', parts: [{ key: 'delivered', value: s.delivered }, { key: 'on_its_way', value: s.onItsWay }, { key: 'on_its_way_cost', value: s.onItsWayPaise, unit: 'inr_paise' }, { key: 'held_for_budget', value: s.heldForBudget }] };
    },
  },

  // ---- Parents: complaints, notices, meetings, events, answers -----------------
  // No address yet (NO_LIST_YET): the Complaints screen lists every complaint, closed ones too.
  { id: 'complaints.open', moduleId: 'complaints', roles: ENGAGEMENT, unit: 'count', period: 'now', drill: 'rows', version: 1, sources: ['complaints'], load: async (db, ctx) => ({ value: (await complaintCounts(db, ctx)).open }) },
  {
    id: 'complaints.overdue', moduleId: 'complaints', roles: ENGAGEMENT, unit: 'count', period: 'now', drill: 'rows', version: 1, sources: ['complaints'],
    load: async (db, ctx) => {
      const overdue = (await complaintCounts(db, ctx)).overdue;
      return { value: overdue, attention: overdue > 0 };
    },
  },
  {
    // The notices that wait for approval: the list /app/communication?show=notices shows, counted.
    // Only the principal approves a notice, so it asks for the principal alone.
    id: 'notices.waiting', moduleId: 'communication', roles: ENGAGEMENT, unit: 'count', period: 'now', drill: 'rows', version: 1, sources: ['class_notices'],
    load: async (db, ctx) => {
      const waiting = (await listNotices(db as never, ctx.schoolId, 'waiting')).length;
      return { value: waiting, href: screenFor.noticesWaiting(), attention: waiting > 0 && ctx.role === 'principal' };
    },
  },
  {
    // No address yet (NO_LIST_YET): the PTM screen lists every meeting, past and cancelled ones too.
    id: 'ptm.coming', moduleId: 'ptm', roles: ENGAGEMENT, unit: 'count', period: 'coming', drill: 'rows', version: 1, sources: ['ptm_events', 'ptm_slots', 'ptm_bookings'],
    load: async (db, ctx) => {
      const coming = (await listPtms(db as never, ctx.schoolId)).filter((m) => m.status !== 'cancelled' && m.held_on >= ctx.today);
      return { value: coming.length, parts: [{ key: 'slots', value: coming.reduce((a, m) => a + m.slots, 0) }, { key: 'booked', value: coming.reduce((a, m) => a + m.booked, 0) }] };
    },
  },
  {
    // The events dated today or later and not cancelled: the list /app/events?show=coming shows, counted.
    id: 'events.coming', moduleId: 'events', roles: ENGAGEMENT, unit: 'count', period: 'coming', drill: 'rows', version: 1, sources: ['school_events', 'event_replies', 'communication_log'],
    load: async (db, ctx) => {
      const coming = await listEvents(db as never, ctx.schoolId, ctx.today);
      return { value: coming.length, href: screenFor.eventsComing(), parts: [{ key: 'invited', value: coming.reduce((a, e) => a + e.invited, 0) }, { key: 'yes', value: coming.reduce((a, e) => a + e.yes, 0) }, { key: 'no', value: coming.reduce((a, e) => a + e.no, 0) }] };
    },
  },
  {
    // The drafts nobody has approved or discarded: the list /app/parent-ai?show=drafts shows, counted.
    id: 'parent_ai.drafts', moduleId: 'parent-ai', roles: ENGAGEMENT, unit: 'count', period: 'now', drill: 'rows', version: 1, sources: ['parent_ai_answers'],
    load: async (db, ctx) => {
      const drafts = (await listAnswers(db as never, ctx.schoolId, 'draft')).length;
      return { value: drafts, href: screenFor.answerDrafts(), attention: drafts > 0 };
    },
  },

  // ---- Running the school -------------------------------------------------------
  // The tickets of /app/help/ticket?show=open and ?show=waiting, counted as listed.
  { id: 'tickets.open', moduleId: 'raise-ticket', roles: SCHOOL_ROLES, unit: 'count', period: 'now', drill: 'rows', version: 1, sources: ['support_tickets'], load: async (db, ctx) => ({ value: (await tickets(db, ctx, 'open')).length, href: screenFor.tickets('open') }) },
  {
    id: 'tickets.waiting', moduleId: 'raise-ticket', roles: SCHOOL_ROLES, unit: 'count', period: 'now', drill: 'rows', version: 1, sources: ['support_tickets'],
    load: async (db, ctx) => {
      const waiting = (await tickets(db, ctx, 'waiting')).length;
      return { value: waiting, href: screenFor.tickets('waiting'), attention: waiting > 0 };
    },
  },

  // ---- Staff leave and covers (slices 8b and 8c) ---------------------------------
  // The lead adds these once `staff_leave` and `substitutions` exist, each counting the list its screen shows:
  //   'staff.leave_waiting'     leave requests waiting for the office to decide        → /app/staff
  //   'staff.on_leave_today'    staff whose approved leave covers today                → /app/staff
  //   'proxy.uncovered_today'   periods of an absent teacher today with no cover yet   → /app/proxy
  // Add the ids to FACT_IDS (types.ts), the words `fact.<id>.label` / `.rule` to the message files, and the ids
  // to the "running" group in dashboard.ts.
];
