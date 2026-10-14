// Proxy Auto: who arranges cover, the days it reaches, and the one rule that orders the free teachers for a
// period (docs/26 slice 8c, C202). No database and no session: the screens and the server both read this file, so
// the order a screen shows is the order the server made.

// Who arranges cover (reads every cover, assigns and undoes), and who opens the screen at all.
export const PROXY_ARRANGERS: readonly string[] = ['principal', 'school_admin', 'academic_coordinator'];
export const PROXY_ROLES: readonly string[] = [...PROXY_ARRANGERS, 'teacher'];
// How far ahead a cover can be arranged, in days. Today is the first day: a day gone by is not rewritten. The
// database holds the same days (cover_day_open in the migration, with the same number): it takes no cover for any
// other day, and answers the academic coordinator "which teachers are away" for these days and no others.
export const PROXY_AHEAD_DAYS = 31;

const DAY_MS = 86_400_000;
const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const plus = (iso: string, days: number) => new Date(at(iso) + days * DAY_MS).toISOString().slice(0, 10);
// The day of the week as the timetable numbers it: 1 is Monday, 7 is Sunday.
export const isoWeekday = (date: string) => new Date(at(date)).getUTCDay() || 7;
// The Monday and the Sunday of the date's week.
export const isoWeek = (date: string) => ({ from: plus(date, 1 - isoWeekday(date)), to: plus(date, 7 - isoWeekday(date)) });

// One free teacher for one period, with the facts that gave them their place, so the screen can say why.
export type Suggestion = {
  user_id: string;
  name: string;
  // Always true: only a teacher with no class of their own in that period, not on leave and not already covering
  // then is suggested at all.
  freeThisPeriod: true;
  // Has a period of the same subject somewhere in the week's timetable.
  teachesSubject: boolean;
  // Their own periods that weekday, plus the covers they already hold on the date.
  periodsThatDay: number;
  // The covers they hold in the date's week, Monday to Sunday.
  coversThatWeek: number;
};

// What the rule reads about one date. Everything is the school's own rows.
export type DayFacts = {
  // The school's active teachers.
  teachers: readonly { user_id: string; name: string }[];
  // On approved leave that date.
  away: ReadonlySet<string>;
  // That weekday in the timetable: who teaches in which period.
  own: readonly { teacher_user_id: string; period: number }[];
  // Who teaches which subject, anywhere in the week.
  teaches: readonly { teacher_user_id: string; subject_id: string }[];
  // The covers assigned on the date.
  covers: readonly { substitute_user_id: string; period: number }[];
  // The covers assigned in the date's week, by substitute.
  coversThatWeek: ReadonlyMap<string, number>;
};

// The free teachers for one period, in the order of the rule:
//   1. teaches that subject first,
//   2. then the fewest periods that day (own timetable plus covers on the date),
//   3. then the fewest covers that week,
//   4. then by name.
// THE ORDER IS FOR THIS ONE DECISION. It is made again for every period and kept nowhere: nothing here adds up a
// person's covers over time, and no screen may sort staff by how much they cover (docs/26 section 3 rule 4).
export function suggestFor(facts: DayFacts, slot: { period: number; subjectId: string }): Suggestion[] {
  const busy = new Set<string>();
  for (const e of facts.own) if (e.period === slot.period) busy.add(e.teacher_user_id);
  for (const c of facts.covers) if (c.period === slot.period) busy.add(c.substitute_user_id);
  const load = new Map<string, number>();
  for (const e of facts.own) load.set(e.teacher_user_id, (load.get(e.teacher_user_id) ?? 0) + 1);
  for (const c of facts.covers) load.set(c.substitute_user_id, (load.get(c.substitute_user_id) ?? 0) + 1);
  const subjectTeachers = new Set(facts.teaches.filter((x) => x.subject_id === slot.subjectId).map((x) => x.teacher_user_id));
  return facts.teachers
    .filter((p) => !busy.has(p.user_id) && !facts.away.has(p.user_id))
    .map((p): Suggestion => ({ user_id: p.user_id, name: p.name, freeThisPeriod: true, teachesSubject: subjectTeachers.has(p.user_id), periodsThatDay: load.get(p.user_id) ?? 0, coversThatWeek: facts.coversThatWeek.get(p.user_id) ?? 0 }))
    .sort((a, b) => Number(b.teachesSubject) - Number(a.teachesSubject) || a.periodsThatDay - b.periodsThatDay || a.coversThatWeek - b.coversThatWeek || a.name.localeCompare(b.name, 'en') || a.user_id.localeCompare(b.user_id));
}

// A cover as a screen is given it.
export type Cover = {
  substitution_id: string;
  on_date: string;
  period: number;
  class_id: string;
  class_name: string;
  subject_name: string;
  absent_user_id: string;
  absent_name: string;
  substitute_user_id: string;
  substitute_name: string;
  assigned_by: string;
  assigned_at: string;
};

// A cover as the teacher who holds it is given it: the day, the period, the class and the subject, and nothing
// else. Not who is away: leave is read by the person and the office (docs/26 section 3 rule 4, section 5).
export type MyCover = Pick<Cover, 'substitution_id' | 'on_date' | 'period' | 'class_id' | 'class_name' | 'subject_name'>;

// Why a cover that is still assigned no longer gives its class a teacher, because something changed after the tap:
//   'not_active'  the substitute is no longer an active teacher of the school (the account was switched off),
//   'on_leave'    the substitute's own leave was approved for that day,
//   'own_class'   the timetable now gives the substitute a class of their own in that period.
// The app undoes nothing by itself: the period is shown and counted as needing cover until a person undoes the
// cover and assigns someone else.
export type CoverProblem = 'not_active' | 'on_leave' | 'own_class';

// One period an absent teacher would have taught, with its cover when a person has assigned one.
export type PeriodToCover = {
  on_date: string;
  period: number;
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  absent_user_id: string;
  absent_name: string;
  // `problem`: why the substitute cannot take the period any more; null while the cover stands.
  cover: (Cover & { problem: CoverProblem | null }) | null;
};

// Does this period still need a person's tap? It has no cover, or its cover cannot be taken any more. The one
// rule the screen's badge and My Day's count both read, so they cannot disagree.
export const needsCover = (p: Pick<PeriodToCover, 'cover'>): boolean => !p.cover || p.cover.problem !== null;

// Why a date has nothing to cover whoever is on leave: the school is closed.
export type DayOff = { kind: 'holiday'; name: string } | { kind: 'not_working' };

// A date as the people who arrange cover see it.
export type ProxyDay = {
  date: string;
  weekday: number;
  dayOff: DayOff | null;
  // The teachers on approved leave that date, by name: one with no period that day is on it too.
  away: { user_id: string; name: string }[];
  periods: (PeriodToCover & { suggestions: Suggestion[] })[];
  // Covers still assigned on the date that no period needs any more: the leave was cancelled, the timetable
  // changed, or the day became a holiday. A person undoes them; the app does not.
  noLongerNeeded: Cover[];
  // May this date still be arranged (today up to PROXY_AHEAD_DAYS ahead)? When not, the rest is empty: a day
  // gone by, or one too far ahead, is not read at all.
  open: boolean;
};
