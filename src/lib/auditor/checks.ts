import type { PoolClient } from 'pg';
import { classesOnDay, dayTotals } from '@/lib/attendance/day';
import type { SchoolRole } from '@/lib/contracts/modules';
import { followUpList } from '@/lib/fees/recovery';
import { structureInForce } from '@/lib/fees/structures';
import { screenFor } from '@/lib/insights/screens';
import type { FactId, FactResult } from '@/lib/insights/types';
import { workingDaysBetween, type WorkingCalendar } from '@/lib/payments/upi';
import { leaveWaiting } from '@/lib/staff/leave';
import { addDays, dayNumber } from '@/lib/staff/leave-rules';
import { indiaDate } from '@/lib/time/india';
import { periodsPerDay } from '@/lib/timetable/timetable';
import { normalizePhone } from '@/lib/whatsapp/phone';
import { ATTENDANCE_WORKING_DAYS, CHECK_IDS, CHECK_META, LEAVE_WAITED_MORE_THAN_DAYS, OVERDUE_MORE_THAN_DAYS, type CheckId, type CheckMeta } from './rules';

// The twelve checks of School Health Auditor v1 (docs/26 slice 8i, C208). Read rules.ts first.
//
// ONE RULE, ONE PLACE (docs/26 section 3 rule 2). A check does not count again what the app already counts:
//   - where a school fact says the number (students waiting for consent, messages held back, the message budget,
//     complaints past their time, whether any fee was raised), the check ASKS THE FACT, so the auditor and the
//     dashboard cannot disagree, and it opens the address the fact itself gives;
//   - where a module has the list (the classes of a day and their marks, the fee structure in force, the fee
//     follow-up list, the leave requests waiting, the working calendar, the periods in a day, whether a number
//     can receive WhatsApp), the check calls that module's own function and counts what comes back;
//   - three things nothing else in the app counts are counted here and only here: classes without a class
//     teacher, active students without a guardian, and the empty periods of the timetable.
//
// Every check runs in the reader's own session, so row level security decides what it sees, and each names the
// school in its queries. A check answers with a count and an address, never with a name: nothing here lists,
// orders or compares people.

type Sql = Pick<PoolClient, 'query'>;

export type CheckContext = {
  schoolId: string;
  userId: string;
  role: SchoolRole;
  today: string; // India's date
  // One school fact, loaded as this reader by the facts' own library (the last seven days, where a fact is about days).
  fact: (id: FactId) => Promise<FactResult>;
  // The school's working days and holidays: the one calendar the rest of the app reads. Read once for a check-up.
  calendar: () => Promise<WorkingCalendar>;
};

export type CheckOutcome = { state: 'passes' } | { state: 'needs_attention'; count: number; href: string } | { state: 'not_set_up' };
export type CheckDefinition = CheckMeta & { id: CheckId; run: (db: Sql, ctx: CheckContext) => Promise<CheckOutcome> };

const PASSES: CheckOutcome = { state: 'passes' };
const NOT_SET_UP: CheckOutcome = { state: 'not_set_up' };
const found = (count: number, href: string): CheckOutcome => (count > 0 ? { state: 'needs_attention', count, href } : PASSES);
const n = (v: unknown) => Number(v ?? 0);

// A check that is a school fact: "not set up" when the fact says so, its number when it is above zero, and the
// address the fact gives for its rows (the check's own screen until the fact has one).
const fromFact = (id: CheckId, factId: FactId) => async (_db: Sql, ctx: CheckContext): Promise<CheckOutcome> => {
  const fact = await ctx.fact(factId);
  if (fact.state === 'not_set_up') return NOT_SET_UP;
  if (fact.state !== 'ok' || fact.value === null) throw new Error(`the fact ${factId} gave no number`);
  return found(fact.value, fact.href ?? CHECK_META[id].screen);
};

// The most recent working days before `today`, the latest first. Whether a day is a working day is asked of the
// calendar's own function (one day at a time), so a holiday or a weekday the school does not work is left out
// here exactly as everywhere else. It looks back sixty days at the most.
export function lastWorkingDays(calendar: WorkingCalendar, today: string, days: number = ATTENDANCE_WORKING_DAYS): string[] {
  const out: string[] = [];
  for (let back = 1; out.length < days && back <= 60; back += 1) {
    const date = addDays(today, -back);
    if (workingDaysBetween(addDays(date, -1), date, calendar) === 1) out.push(date);
  }
  return out;
}

const RUN: Record<CheckId, CheckDefinition['run']> = {
  // Every class has a class teacher: one who is set, and whose account is still switched on.
  class_teacher: async (db, ctx) => {
    const r = (await db.query(
      `select count(*) as classes, count(*) filter (where u.user_id is null) as without
         from classes c left join users u on u.school_id = c.school_id and u.user_id = c.class_teacher_id and u.is_active
        where c.school_id = $1`,
      [ctx.schoolId]
    )).rows[0];
    return n(r?.classes) === 0 ? NOT_SET_UP : found(n(r?.without), CHECK_META.class_teacher.screen);
  },

  // Every active student has a guardian (one that has not been merged into another).
  student_guardian: async (db, ctx) => {
    const r = (await db.query(
      `select count(*) as active,
              count(*) filter (where not exists (
                select 1 from parent_student_map m join parents p on p.school_id = m.school_id and p.parent_id = m.parent_id and p.merged_into is null
                 where m.school_id = s.school_id and m.student_id = s.student_id)) as without
         from students s where s.school_id = $1 and s.status = 'active'`,
      [ctx.schoolId]
    )).rows[0];
    return n(r?.active) === 0 ? NOT_SET_UP : found(n(r?.without), screenFor.students('active'));
  },

  // Every guardian's number can receive WhatsApp: the guardians the Parents screen lists, each number asked of
  // the one function that says how a number must be written. The numbers are read to be tested; none is kept.
  guardian_phone: async (db, ctx) => {
    const { rows } = await db.query(`select phone from parents where school_id = $1 and merged_into is null`, [ctx.schoolId]);
    if (rows.length === 0) return NOT_SET_UP;
    return found(rows.filter((r) => normalizePhone(String(r.phone ?? '')) === null).length, CHECK_META.guardian_phone.screen);
  },

  // Consent is recorded for every student: the fact for the students waiting for consent.
  consent: fromFact('consent', 'students.waiting_consent'),

  // Attendance was marked on each of the last five working days: for each, the classes of that day as the
  // Attendance screen reads them. A day is counted when a class with students on its roll had no mark.
  attendance_marked: async (db, ctx) => {
    const days = lastWorkingDays(await ctx.calendar(), ctx.today);
    if (days.length === 0) return NOT_SET_UP;
    let notMarked = 0;
    for (const date of days) {
      const day = dayTotals(await classesOnDay(db, ctx.schoolId, date));
      if (day.students === 0) return NOT_SET_UP; // no class has a student on its roll
      if (day.classesMarked < day.classes) notMarked += 1;
    }
    return found(notMarked, screenFor.attendanceDays({ from: days[days.length - 1], to: days[0] }));
  },

  // The timetable has no empty period on a working day: for every class, each period of each weekday the school
  // works, up to its "periods in a day" setting. "Not set up" while the school has no timetable at all.
  timetable_filled: async (db, ctx) => {
    const classes = (await db.query(`select class_id from classes where school_id = $1`, [ctx.schoolId])).rows as { class_id: string }[];
    const entries = (await db.query(`select class_id, weekday::int as weekday, period::int as period from timetable_entries where school_id = $1`, [ctx.schoolId])).rows as { class_id: string; weekday: number; period: number }[];
    if (classes.length === 0 || entries.length === 0) return NOT_SET_UP;
    const periods = await periodsPerDay(db as PoolClient, ctx.schoolId);
    // The calendar numbers Sunday 0; the timetable numbers Monday 1 to Sunday 7.
    const weekdays = [...(await ctx.calendar()).weekdays].map((d) => (d === 0 ? 7 : d));
    const filled = new Set(entries.map((e) => `${e.class_id}:${e.weekday}:${e.period}`));
    let empty = 0;
    for (const c of classes) for (const weekday of weekdays) for (let period = 1; period <= periods; period += 1) if (!filled.has(`${c.class_id}:${weekday}:${period}`)) empty += 1;
    return found(empty, CHECK_META.timetable_filled.screen);
  },

  // Every class has a fee structure in force: the fees library's own "in force" (the latest version that began
  // on or before the date, in the session), asked for today in the session running today. "Not set up" while
  // the school has made no fee structure at all.
  fee_structure: async (db, ctx) => {
    const classes = (await db.query(`select class_id from classes where school_id = $1`, [ctx.schoolId])).rows as { class_id: string }[];
    const any = (await db.query(`select exists (select 1 from fee_structures where school_id = $1) as any`, [ctx.schoolId])).rows[0]?.any === true;
    if (classes.length === 0 || !any) return NOT_SET_UP;
    const session = (await db.query(
      `select session_id from academic_sessions where school_id = $1 and start_date <= $2::date and end_date >= $2::date order by is_current desc, start_date desc limit 1`,
      [ctx.schoolId, ctx.today]
    )).rows[0] as { session_id: string } | undefined;
    let without = 0;
    for (const c of classes) if (!session || !(await structureInForce(db as PoolClient, ctx.schoolId, c.class_id, session.session_id, ctx.today))) without += 1;
    return found(without, CHECK_META.fee_structure.screen);
  },

  // No fee is overdue by more than thirty days without a follow-up: the families of the fee desk's own follow-up
  // list whose oldest unpaid fee is that old and who have had no call, promise or hardship recorded since it
  // fell due. "Not set up" while no fee has been raised (the fee facts' own rule).
  overdue_followed_up: async (db, ctx) => {
    if ((await ctx.fact('fees.overdue')).state === 'not_set_up') return NOT_SET_UP;
    const waiting = (await followUpList(db as PoolClient, ctx.schoolId)).filter((r) => r.days_overdue > OVERDUE_MORE_THAN_DAYS && !(r.last_on !== null && r.last_on > r.oldest_due));
    return found(waiting.length, screenFor.dues('overdue'));
  },

  // No message was held back in the last seven days: the fact, over the seven days ending today.
  messages_held: fromFact('messages_held', 'messages.held'),

  // A monthly message budget is set: the spend fact says "not set up" while there is none. Set, the check passes.
  message_budget: async (_db, ctx) => ((await ctx.fact('whatsapp.spend')).state === 'not_set_up' ? NOT_SET_UP : PASSES),

  // No complaint is past its due time: the fact.
  complaints_overdue: fromFact('complaints_overdue', 'complaints.overdue'),

  // No leave request has waited more than two days: the requests the Staff screen lists as waiting, by India's date.
  leave_waiting: async (db, ctx) => {
    const waiting = await leaveWaiting(db, { schoolId: ctx.schoolId, userId: ctx.userId, role: ctx.role }, ctx.today);
    return found(waiting.filter((r) => dayNumber(ctx.today) - dayNumber(indiaDate(new Date(r.asked_at))) > LEAVE_WAITED_MORE_THAN_DAYS).length, CHECK_META.leave_waiting.screen);
  },
};

export const CHECKS: readonly CheckDefinition[] = CHECK_IDS.map((id) => ({ id, ...CHECK_META[id], run: RUN[id] }));
