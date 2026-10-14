import type { SchoolRole } from './modules';

// First-visit tours (docs/19 rule 8, C138): the first time a person opens a
// screen, up to three short steps say what it is for and where the main
// things are. Skippable at any step, and shown once: "seen" is remembered
// on the person's own account (users.tours_seen), not in the browser, so on
// a shared office computer one person's tours are never another's, and a
// person is not shown them again on their phone.
//
// A tour's words live in the message files (`tour.<id>.<n>.title` and
// `.text`), in English and Hindi. A step may point at a part of the page
// (a ModulePage slot), which is outlined while the step is shown.

export const TOUR_MAX_STEPS = 3;

export type TourSlot = 'primary' | 'more' | 'search' | 'filters' | 'body' | 'tools';
export type TourDefinition = { steps: readonly { slot?: TourSlot }[] };

export const TOURS = {
  'my-day-teacher': { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'tools' }] },
  'my-day-office': { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'tools' }] },
  'my-day-principal': { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  'my-day': { steps: [{ slot: 'body' }, { slot: 'tools' }] },
  students: { steps: [{ slot: 'search' }, { slot: 'primary' }, { slot: 'body' }] },
  'student-profile': { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'primary' }] },
  'id-card': { steps: [{ slot: 'primary' }, { slot: 'body' }] },
  attendance: { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  'taught-today': { steps: [{ slot: 'body' }, { slot: 'body' }] },
  timetable: { steps: [{ slot: 'body' }, { slot: 'body' }] },
  pulse: { steps: [{ slot: 'body' }, { slot: 'body' }] },
  communication: { steps: [{ slot: 'body' }, { slot: 'body' }] },
  parents: { steps: [{ slot: 'body' }, { slot: 'body' }] },
  ptm: { steps: [{ slot: 'body' }, { slot: 'body' }] },
  events: { steps: [{ slot: 'body' }, { slot: 'body' }] },
  complaints: { steps: [{ slot: 'body' }, { slot: 'body' }] },
  'parent-ai': { steps: [{ slot: 'body' }, { slot: 'body' }] },
  homework: { steps: [{ slot: 'body' }, { slot: 'body' }] },
  recovery: { steps: [{ slot: 'body' }, { slot: 'body' }] },
  copilot: { steps: [{ slot: 'body' }, { slot: 'body' }] },
  fees: { steps: [{ slot: 'body' }, { slot: 'body' }] },
  compliance: { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  staff: { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  settings: { steps: [{ slot: 'body' }, {}] },
  help: { steps: [{ slot: 'body' }, {}] },
  tickets: { steps: [{ slot: 'primary' }, { slot: 'body' }, { slot: 'body' }] },
  // --- P5 (docs/26): one block a slice. A slice's lines go between its own two marker lines, nowhere else. ---
  // p5-8a begin
  // p5-8a end
  // p5-8b begin
  // p5-8b end
  // p5-8c begin
  proxy: { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  'proxy-covers': { steps: [{ slot: 'body' }, { slot: 'body' }] },
  // p5-8c end
  // p5-8d begin
  dashboard: { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'more' }] },
  // p5-8d end
  // p5-8e begin
  // p5-8e end
  // p5-8f begin
  // p5-8f end
  // p5-8g begin
  // p5-8g end
  // p5-8h begin
  reports: { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  // p5-8h end
  // p5-8i begin
  'school-auditor': { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  // p5-8i end
  // p5-8j begin
  'early-warning': { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  // p5-8j end
  // c210-rls begin
  // c210-rls end
  // c210-leave begin
  // c210-leave end
  // c210-jobs begin
  // c210-jobs end
  // c210-ui begin
  // c210-ui end
  // p6-9a begin
  'grading-scheme': { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  // p6-9a end
  // p6-9b begin
  exams: { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  'marks-entry': { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  'class-result': { steps: [{ slot: 'body' }, { slot: 'body' }] },
  // p6-9b end
  // p6-9c begin
  'report-cards': { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  // p6-9c end
  // p6-9d begin
  'curriculum-gap': { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  // p6-9d end
  // p6-9e begin
  'learning-genome': { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  // p6-9e end
  // p6-9f begin
  // p6-9f end
  // c212-pricing begin
  // c212-pricing end
  // p7-10a begin
  admissions: { steps: [{ slot: 'primary' }, { slot: 'body' }, { slot: 'body' }] },
  // p7-10a end
  // p7-10b begin
  'data-check': { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  // p7-10b end
  // p7-10c begin
  'fees-rte': { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  // p7-10c end
  // p7-10d begin
  'compliance-desk': { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  'compliance-disclosure': { steps: [{ slot: 'primary' }] },
  // p7-10d end
  // p7-10e begin
  certificates: { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  // p7-10e end
  // p7-10f begin
  'timetable-generator': { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  // p7-10f end
  // p7-10g begin
  // p7-10g end
  // c224 begin
  // c224 end
  // c225 begin
  // c225 end
  // c226 begin
  // c226 end
} as const satisfies Record<string, TourDefinition>;

export type TourId = keyof typeof TOURS;
export const TOUR_IDS = Object.keys(TOURS) as TourId[];

export function isTourId(v: unknown): v is TourId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TOURS, v);
}

// My Day's tour is the role's own: a teacher, the office and the principal
// are shown what their day is made of.
export function myDayTour(role: SchoolRole): TourId {
  return role === 'teacher' ? 'my-day-teacher' : role === 'school_admin' ? 'my-day-office' : role === 'principal' ? 'my-day-principal' : 'my-day';
}

// What is remembered, as a cookie value tied to the person (the same shape
// as the language cookie): "<user id>.<tour>,<tour>". A cookie written for
// anyone else is ignored.
export const TOURS_COOKIE = 'nca_tours';
export const TOURS_COOKIE_MAX_AGE = 60 * 60 * 12;

export function toursCookieValue(userId: string, seen: readonly string[]): string {
  return `${userId}.${seen.filter(isTourId).join(',')}`;
}

export function readToursCookie(value: string | undefined, userId: string): TourId[] | null {
  if (!value || !userId) return null;
  const at = value.indexOf('.');
  if (at < 0 || value.slice(0, at) !== userId) return null;
  return value
    .slice(at + 1)
    .split(',')
    .filter(isTourId);
}
