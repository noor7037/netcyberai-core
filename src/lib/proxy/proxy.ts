import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { classLabel } from '@/lib/frameworks/class-label';
import { schoolCalendar, type WorkingCalendar } from '@/lib/payments/upi';
import { addDays, isLeaveDate } from '@/lib/staff/leave-rules';
import { indiaDate } from '@/lib/time/india';
import { isoWeek, isoWeekday, needsCover, PROXY_AHEAD_DAYS, PROXY_ARRANGERS, suggestFor, type Cover, type CoverProblem, type DayFacts, type DayOff, type MyCover, type PeriodToCover, type ProxyDay, type Suggestion } from './rules';

export * from './rules';

// Proxy Auto (docs/26 slice 8c, C202): covers for the periods of a teacher on leave.
//
//   - WHAT NEEDS COVER is read, never kept: for a date, every period the timetable gives a teacher whose leave is
//     approved for that date. "On leave on a day" is written once, in the database (staff_on_leave), and read
//     through it by staff leave's onLeave(), by teachers_away_on() and by the rule that guards a new cover. A
//     school holiday or a day the school does not work has nothing to cover.
//   - WHO IS SUGGESTED: the school's active teachers who are free that period (no class of their own then), not on
//     leave that date, and not already covering then. In the order of the one rule in ./rules (suggestFor), with
//     the facts behind each place.
//   - NOTHING IS ASSIGNED WITHOUT A PERSON'S TAP. This file proposes. assignCover() and undoCover() are the only
//     writers, each is one person's decision in that person's own name, and nothing else in the app calls them.
//   - A PERIOD IS COVERED ONCE, AND A TEACHER COVERS ONE CLASS A PERIOD. assignCover() checks every rule again in
//     the transaction; the database's two unique indexes are the last guard, and what they refuse is answered in
//     plain words ('already_covered', 'already_covering').
//   - A teacher is a user, as in the timetable. A cover does not widen what the substitute can read: for the
//     covered period they are given the class and the subject (MyCover), on Proxy Auto, My Day and Timetable, and
//     nothing else changes. They are not given who is away.
//   - A COVER CAN STOP BEING GOOD AFTER THE TAP: the leave is cancelled, the day becomes a holiday, the timetable
//     changes, or the substitute goes on leave, leaves, or is given a class of their own then. The app undoes
//     nothing by itself (a person decides). It says so instead: such a period counts as needing cover again, such
//     a cover is listed as no longer needed, and My Day tells the people who arrange cover about both.
//   - Nobody is told by a message, and no job is added: the substitute sees the cover in the app.
//   - Covers are for running the day. Nothing here adds up a person's covers over time or puts staff in an order
//     of who covers most; the two small numbers beside a suggestion belong to that one decision.
//   - Every query runs in the caller's own session. The academic coordinator arranges cover but does not read
//     leave, so "which teachers are away that day" comes from the database's own teachers_away_on(), which gives
//     the three arranging roles that one fact and nothing else about anyone's leave; the coordinator only for the
//     days cover can still be arranged for (today and PROXY_AHEAD_DAYS after), the office for any day.

type Sql = Pick<PoolClient, 'query'>;
type Actor = { schoolId: string; userId: string; role: StaffRole };

const iso = (v: unknown) => new Date(v as string).toISOString();
const validPeriod = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 12;
// A day cover can still be arranged for: today up to PROXY_AHEAD_DAYS ahead.
const isOpen = (date: string, today: string) => date >= today && date <= addDays(today, PROXY_AHEAD_DAYS);

// Which teachers are away on a date (approved leave), for the people who arrange cover. Empty for anyone else,
// and for the academic coordinator on a day outside the days cover is arranged for.
async function awayOn(db: Sql, schoolId: string, date: string): Promise<{ user_id: string; name: string }[]> {
  const { rows } = await db.query(
    `select a.user_id, u.display_name as name from teachers_away_on($2::date) a join users u on u.school_id = $1 and u.user_id = a.user_id order by u.display_name, a.user_id`,
    [schoolId, date]
  );
  return rows as { user_id: string; name: string }[];
}

// Is the school closed on the date? A holiday the office has entered, or a weekday the school does not work
// (the 'setup.working_days' setting): the one working calendar the rest of the app reads.
const closedOn = (calendar: WorkingCalendar, date: string): DayOff['kind'] | null => (calendar.holidays.has(date) ? 'holiday' : calendar.weekdays.has(isoWeekday(date) % 7) ? null : 'not_working');
export async function dayOff(db: Sql, schoolId: string, date: string): Promise<DayOff | null> {
  const kind = closedOn(await schoolCalendar(db, schoolId), date);
  if (kind === null) return null;
  if (kind === 'not_working') return { kind };
  const name = (await db.query(`select name from school_holidays where school_id = $1 and holiday_date = $2::date`, [schoolId, date])).rows[0]?.name as string | undefined;
  return { kind, name: name ?? '' };
}

// A cover as the people who arrange it read it. With it, two facts about the substitute as they stand now, which
// say whether the cover can still be taken: still an active teacher of the school, and whether the timetable has
// since given them a class of their own in that period.
const COVERS = `select x.substitution_id, x.on_date::text as on_date, x.period::int as period, x.class_id, c.name as class, c.section, s.name as subject_name,
                       x.absent_user_id, a.display_name as absent_name, x.substitute_user_id, su.display_name as substitute_name, ab.display_name as assigned_by, x.assigned_at,
                       (su.role::text = 'teacher' and su.is_active) as substitute_active,
                       exists (select 1 from timetable_entries own where own.school_id = x.school_id and own.teacher_user_id = x.substitute_user_id
                                  and own.weekday = extract(isodow from x.on_date)::int and own.period = x.period) as substitute_teaches
                  from substitutions x
                  join classes c on c.school_id = x.school_id and c.class_id = x.class_id
                  join subjects s on s.school_id = x.school_id and s.subject_id = x.subject_id
                  join users a on a.school_id = x.school_id and a.user_id = x.absent_user_id
                  join users su on su.school_id = x.school_id and su.user_id = x.substitute_user_id
                  join users ab on ab.school_id = x.school_id and ab.user_id = x.assigned_by`;
type Held = { cover: Cover; substituteActive: boolean; substituteTeaches: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const held = (r: any): Held => ({
  cover: {
    substitution_id: r.substitution_id, on_date: r.on_date, period: r.period, class_id: r.class_id, class_name: classLabel(r.class, r.section) ?? '', subject_name: r.subject_name,
    absent_user_id: r.absent_user_id, absent_name: r.absent_name, substitute_user_id: r.substitute_user_id, substitute_name: r.substitute_name, assigned_by: r.assigned_by, assigned_at: iso(r.assigned_at),
  },
  substituteActive: Boolean(r.substitute_active),
  substituteTeaches: Boolean(r.substitute_teaches),
});
// Why a cover cannot be taken any more, or null. The same three things assignCover() refuses a new cover for.
const problemOf = (x: Held, away: ReadonlySet<string>): CoverProblem | null => (!x.substituteActive ? 'not_active' : away.has(x.cover.substitute_user_id) ? 'on_leave' : x.substituteTeaches ? 'own_class' : null);

// The covers assigned on a date, as this session may read them (the arranging roles: all of them).
async function coversOn(db: Sql, schoolId: string, date: string): Promise<Held[]> {
  const { rows } = await db.query(`${COVERS} where x.school_id = $1 and x.on_date = $2::date and x.status = 'assigned' order by x.period, c.name, c.section, x.class_id`, [schoolId, date]);
  return rows.map(held);
}

// The periods of one date as the timetable gives them to the teachers away that day, each with its cover when a
// person has assigned one. No day-off rule here: periodsToCover() and proxyDay() apply it.
async function periodsOf(db: Sql, schoolId: string, date: string, away: readonly { user_id: string }[], covers: readonly Held[]): Promise<PeriodToCover[]> {
  if (away.length === 0) return [];
  const { rows } = await db.query(
    `select e.period::int as period, e.class_id, c.name as class, c.section, e.subject_id, s.name as subject_name, e.teacher_user_id as absent_user_id, u.display_name as absent_name
       from timetable_entries e
       join classes c on c.school_id = e.school_id and c.class_id = e.class_id
       join subjects s on s.school_id = e.school_id and s.subject_id = e.subject_id
       join users u on u.school_id = e.school_id and u.user_id = e.teacher_user_id
      where e.school_id = $1 and e.weekday = $2 and e.teacher_user_id = any($3::uuid[])
      order by e.period, c.name, c.section, e.class_id`,
    [schoolId, isoWeekday(date), away.map((p) => p.user_id)]
  );
  const gone = new Set(away.map((p) => p.user_id));
  return rows.map((r): PeriodToCover => {
    const x = covers.find((h) => h.cover.class_id === r.class_id && h.cover.period === r.period) ?? null;
    return {
      on_date: date, period: r.period, class_id: r.class_id, class_name: classLabel(r.class, r.section) ?? '', subject_id: r.subject_id, subject_name: r.subject_name,
      absent_user_id: r.absent_user_id, absent_name: r.absent_name, cover: x ? { ...x.cover, problem: problemOf(x, gone) } : null,
    };
  });
}

// One reading of a date, which the screen and My Day's cards both draw from: is the school closed, who is away,
// the periods of those teachers with their covers, and the covers still assigned that no period needs any more
// (the leave was cancelled, the timetable changed, or the day became a holiday).
type DayRead = { off: DayOff | null; away: { user_id: string; name: string }[]; periods: PeriodToCover[]; noLongerNeeded: Cover[] };
async function readDay(db: Sql, schoolId: string, date: string): Promise<DayRead> {
  const off = await dayOff(db, schoolId, date);
  const away = await awayOn(db, schoolId, date);
  const covers = await coversOn(db, schoolId, date);
  const periods = off ? [] : await periodsOf(db, schoolId, date, away, covers);
  const needed = new Set(periods.map((p) => p.cover?.substitution_id));
  return { off, away, periods, noLongerNeeded: covers.filter((x) => !needed.has(x.cover.substitution_id)).map((x) => x.cover) };
}

// Every period that needs cover on a date: for each teacher whose approved leave covers it, their periods of
// that weekday in the timetable, each with its cover if one is assigned. Nothing on a school holiday or a day the
// school does not work. In the order of the day: by period, then by class. The date is India's today unless given.
export async function periodsToCover(db: Sql, schoolId: string, date: string = indiaDate()): Promise<PeriodToCover[]> {
  return isLeaveDate(date) ? (await readDay(db, schoolId, date)).periods : [];
}

// What waits for a person on a date (India's today unless given), for My Day:
//   `open`            the periods that have no teacher: no cover yet, or a cover that cannot be taken any more;
//   `noLongerNeeded`  the covers still assigned that no period needs. On a working day each is still shown to
//                     its teacher until a person undoes it.
// The same reading the Proxy Auto screen draws, so a card's number is the screen's. Empty for anyone who does not
// arrange cover.
export async function coverWork(db: Sql, actor: Actor, date: string = indiaDate()): Promise<{ open: PeriodToCover[]; noLongerNeeded: Cover[] }> {
  if (!PROXY_ARRANGERS.includes(actor.role) || !isLeaveDate(date)) return { open: [], noLongerNeeded: [] };
  const day = await readDay(db, actor.schoolId, date);
  return { open: day.periods.filter(needsCover), noLongerNeeded: day.noLongerNeeded };
}

// What the rule reads about a date: the school's own rows, in the caller's session.
async function dayFacts(db: Sql, schoolId: string, date: string, away: readonly { user_id: string }[]): Promise<DayFacts> {
  const week = isoWeek(date);
  const [teachers, own, teaches, covers, weekly] = [
    await db.query(`select user_id, display_name as name from users where school_id = $1 and role::text = 'teacher' and is_active`, [schoolId]),
    await db.query(`select teacher_user_id, period::int as period from timetable_entries where school_id = $1 and weekday = $2`, [schoolId, isoWeekday(date)]),
    await db.query(`select distinct teacher_user_id, subject_id from timetable_entries where school_id = $1`, [schoolId]),
    await db.query(`select substitute_user_id, period::int as period from substitutions where school_id = $1 and on_date = $2::date and status = 'assigned'`, [schoolId, date]),
    await db.query(`select substitute_user_id from substitutions where school_id = $1 and on_date between $2::date and $3::date and status = 'assigned'`, [schoolId, week.from, week.to]),
  ];
  const coversThatWeek = new Map<string, number>();
  for (const r of weekly.rows as { substitute_user_id: string }[]) coversThatWeek.set(r.substitute_user_id, (coversThatWeek.get(r.substitute_user_id) ?? 0) + 1);
  return { teachers: teachers.rows, away: new Set(away.map((p) => p.user_id)), own: own.rows, teaches: teaches.rows, covers: covers.rows, coversThatWeek };
}

// The free teachers for one period of a date, in the order of the rule (./rules suggestFor), each with the facts
// behind its place. Only the people who arrange cover are answered, and only for a day cover can still be
// arranged for: for anyone else, or any other day, the list is empty, because that session is not told who is on
// leave then.
export async function suggest(db: Sql, actor: Actor, date: string, slot: { period: number; subjectId: string }, today: string = indiaDate()): Promise<Suggestion[]> {
  if (!PROXY_ARRANGERS.includes(actor.role) || !isLeaveDate(date) || !isOpen(date, today) || !validPeriod(slot.period)) return [];
  return suggestFor(await dayFacts(db, actor.schoolId, date, await awayOn(db, actor.schoolId, date)), slot);
}

// A date as the people who arrange cover see it: who is away, the periods to cover with the suggestions for
// each one still open, and the covers nothing needs any more. Only for a day cover can still be arranged for
// (today up to PROXY_AHEAD_DAYS ahead): any other day comes back closed and empty. Null for anyone who does not
// arrange cover.
export async function proxyDay(db: Sql, actor: Actor, date: string, today: string = indiaDate()): Promise<ProxyDay | null> {
  if (!PROXY_ARRANGERS.includes(actor.role) || !isLeaveDate(date)) return null;
  // A day gone by, or one further ahead than cover is arranged for: nothing is read and nothing is said about it,
  // so the screen cannot claim that nobody was on leave on a day it was not told about.
  if (!isOpen(date, today)) return { date, weekday: isoWeekday(date), dayOff: null, away: [], periods: [], noLongerNeeded: [], open: false };
  const { off, away, periods, noLongerNeeded } = await readDay(db, actor.schoolId, date);
  // Suggestions only where a person can still act on them: a period with no cover. (A cover that cannot be taken
  // any more is undone first: a period is covered once.)
  const facts = periods.some((p) => !p.cover) ? await dayFacts(db, actor.schoolId, date, away) : null;
  return {
    date,
    weekday: isoWeekday(date),
    dayOff: off,
    away,
    periods: periods.map((p) => ({ ...p, suggestions: facts && !p.cover ? suggestFor(facts, { period: p.period, subjectId: p.subject_id }) : [] })),
    noLongerNeeded,
    open: true,
  };
}

export type AssignInput = { date: string; period: number; classId: string; substituteUserId: string };
export type AssignResult =
  | { ok: true; substitutionId: string }
  | { ok: false; reason: 'not_allowed' | 'elsewhere' | 'date' | 'day_off' | 'not_needed' | 'already_covered' | 'substitute' | 'on_leave' | 'not_free' | 'already_covering' | 'changed' };

// Is this person on this school's own staff list? A cover is kept against the school's own `users` rows, as the
// timetable and leave are: an account made at another school and signed in here through a membership is told so
// in plain words, before the database is asked to hold a row it would refuse.
const ofThisSchool = async (db: Sql, schoolId: string, userId: string) => Boolean((await db.query(`select 1 from users where school_id = $1 and user_id = $2`, [schoolId, userId])).rows[0]);

// One person's tap: this teacher covers this period. Every rule is checked again here, against what the database
// holds at this moment, whatever the screen showed when it was drawn. The insert runs behind a savepoint, so when
// the database itself refuses it (the unique indexes: someone else tapped first; its trigger: leave or the
// timetable changed in that instant) the answer is a plain reason and the caller's transaction goes on.
export async function assignCover(db: Sql, actor: Actor, input: AssignInput, today: string = indiaDate()): Promise<AssignResult> {
  if (!PROXY_ARRANGERS.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (!(await ofThisSchool(db, actor.schoolId, actor.userId))) return { ok: false, reason: 'elsewhere' };
  if (!isLeaveDate(input.date) || !isOpen(input.date, today) || !validPeriod(input.period)) return { ok: false, reason: 'date' };
  if (await dayOff(db, actor.schoolId, input.date)) return { ok: false, reason: 'day_off' };
  const away = await awayOn(db, actor.schoolId, input.date);
  const period = (await periodsOf(db, actor.schoolId, input.date, away, await coversOn(db, actor.schoolId, input.date))).find((p) => p.class_id === input.classId && p.period === input.period);
  if (!period) return { ok: false, reason: 'not_needed' };
  if (period.cover) return { ok: false, reason: 'already_covered' };
  const facts = await dayFacts(db, actor.schoolId, input.date, away);
  const who = input.substituteUserId;
  if (who === period.absent_user_id || !facts.teachers.some((p) => p.user_id === who)) return { ok: false, reason: 'substitute' };
  if (facts.away.has(who)) return { ok: false, reason: 'on_leave' };
  if (facts.own.some((e) => e.teacher_user_id === who && e.period === input.period)) return { ok: false, reason: 'not_free' };
  if (facts.covers.some((x) => x.substitute_user_id === who && x.period === input.period)) return { ok: false, reason: 'already_covering' };

  await db.query('savepoint proxy_assign');
  let substitutionId: string;
  try {
    substitutionId = (await db.query(
      `insert into substitutions (school_id, on_date, period, class_id, subject_id, absent_user_id, substitute_user_id, assigned_by) values ($1, $2::date, $3, $4, $5, $6, $7, $8) returning substitution_id`,
      [actor.schoolId, input.date, input.period, period.class_id, period.subject_id, period.absent_user_id, who, actor.userId]
    )).rows[0].substitution_id as string;
    await db.query('release savepoint proxy_assign');
  } catch (err) {
    await db.query('rollback to savepoint proxy_assign');
    const e = err as { code?: string; constraint?: string; message?: string };
    const text = `${e.constraint ?? ''} ${e.message ?? ''}`;
    if (e.code === '23505' && text.includes('substitutions_one_cover_a_period')) return { ok: false, reason: 'already_covered' };
    if (e.code === '23505' && text.includes('substitutions_one_class_a_substitute')) return { ok: false, reason: 'already_covering' };
    if (e.code === '23514') return { ok: false, reason: 'changed' };
    throw err;
  }
  await writeAuditLog(db, {
    schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'cover.assigned', targetType: 'substitutions', targetId: substitutionId, beforeState: undefined,
    afterState: { date: input.date, period: input.period, classId: period.class_id, subjectId: period.subject_id, absentUserId: period.absent_user_id, substituteUserId: who },
  });
  return { ok: true, substitutionId };
}

export type UndoResult = { ok: true } | { ok: false; reason: 'not_allowed' | 'elsewhere' | 'not_found' | 'undone' | 'past' };

// One person's tap: this cover is taken back. The row stays, marked undone in that person's name, and the period
// can be assigned again. A cover of a day gone by is left as it was.
export async function undoCover(db: Sql, actor: Actor, substitutionId: string, today: string = indiaDate()): Promise<UndoResult> {
  if (!PROXY_ARRANGERS.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (!(await ofThisSchool(db, actor.schoolId, actor.userId))) return { ok: false, reason: 'elsewhere' };
  const row = (await db.query(
    `select status, on_date::text as on_date, period::int as period, class_id, absent_user_id, substitute_user_id from substitutions where school_id = $1 and substitution_id = $2 for update`,
    [actor.schoolId, substitutionId]
  )).rows[0] as { status: string; on_date: string; period: number; class_id: string; absent_user_id: string; substitute_user_id: string } | undefined;
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status !== 'assigned') return { ok: false, reason: 'undone' };
  if (row.on_date < today) return { ok: false, reason: 'past' };
  await db.query(`update substitutions set status = 'undone', undone_by = $3, undone_at = now() where school_id = $1 and substitution_id = $2`, [actor.schoolId, substitutionId, actor.userId]);
  await writeAuditLog(db, {
    schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'cover.undone', targetType: 'substitutions', targetId: substitutionId, beforeState: { status: 'assigned' },
    afterState: { date: row.on_date, period: row.period, classId: row.class_id, absentUserId: row.absent_user_id, substituteUserId: row.substitute_user_id, status: 'undone' },
  });
  return { ok: true };
}

// The covers one teacher holds from one date to another (both included), in the order of the days and periods.
// Read in the caller's own session: a teacher is given their own, and nobody else's. Each is the day, the period,
// the class and the subject: the query reads no name, so who is away is not in what a teacher is given. A cover on
// a day the school is closed (a holiday entered after the tap) is nobody's period to teach, so it is left out; the
// people who arrange cover are shown it as no longer needed.
export async function coversBetween(db: Sql, schoolId: string, userId: string, from: string, to: string): Promise<MyCover[]> {
  if (!isLeaveDate(from) || !isLeaveDate(to) || to < from) return [];
  const { rows } = await db.query(
    `select x.substitution_id, x.on_date::text as on_date, x.period::int as period, x.class_id, c.name as class, c.section, s.name as subject_name
       from substitutions x
       join classes c on c.school_id = x.school_id and c.class_id = x.class_id
       join subjects s on s.school_id = x.school_id and s.subject_id = x.subject_id
      where x.school_id = $1 and x.substitute_user_id = $2 and x.on_date between $3::date and $4::date and x.status = 'assigned'
      order by x.on_date, x.period, c.name, c.section, x.class_id`,
    [schoolId, userId, from, to]
  );
  if (rows.length === 0) return [];
  const calendar = await schoolCalendar(db, schoolId);
  return rows
    .filter((r) => !closedOn(calendar, r.on_date))
    .map((r): MyCover => ({ substitution_id: r.substitution_id, on_date: r.on_date, period: r.period, class_id: r.class_id, class_name: classLabel(r.class, r.section) ?? '', subject_name: r.subject_name }));
}

// The covers one teacher holds on one date (India's today unless given), in the order of the periods.
export const coversFor = (db: Sql, schoolId: string, userId: string, date: string = indiaDate()): Promise<MyCover[]> => coversBetween(db, schoolId, userId, date, date);

// How many covers are still assigned for the days of one leave request, from `today` on: what the office is told
// when it cancels approved leave, so that each can be undone on Proxy Auto. Read in the caller's own session (the
// people who arrange cover: every cover; the person whose leave it is: the covers of their own periods).
export async function coversLeftFor(db: Sql, schoolId: string, leaveId: string, today: string = indiaDate()): Promise<number> {
  const { rows } = await db.query(
    `select x.substitution_id
       from staff_leave l
       join substitutions x on x.school_id = l.school_id and x.absent_user_id = l.user_id and x.on_date between l.from_date and l.to_date
      where l.school_id = $1 and l.leave_id = $2 and x.status = 'assigned' and x.on_date >= $3::date`,
    [schoolId, leaveId, today]
  );
  return rows.length;
}
