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
  homework: { steps: [{ slot: 'body' }, { slot: 'body' }] },
  recovery: { steps: [{ slot: 'body' }, { slot: 'body' }] },
  copilot: { steps: [{ slot: 'body' }, { slot: 'body' }] },
  fees: { steps: [{ slot: 'body' }, { slot: 'body' }] },
  compliance: { steps: [{ slot: 'body' }, { slot: 'body' }, { slot: 'body' }] },
  staff: { steps: [{ slot: 'body' }, { slot: 'body' }] },
  settings: { steps: [{ slot: 'body' }, {}] },
  help: { steps: [{ slot: 'body' }, {}] },
  tickets: { steps: [{ slot: 'primary' }, { slot: 'body' }, { slot: 'body' }] },
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
