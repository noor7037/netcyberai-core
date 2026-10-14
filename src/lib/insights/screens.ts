import type { AttendanceShow } from '@/lib/attendance/day';
import type { ComplaintShow } from '@/lib/complaints/complaints';
import type { TicketShow } from '@/lib/contracts/tickets';
import type { DueList } from '@/lib/fees/overdue';
import type { HomeworkShow } from '@/lib/homework/homework';
import { isIsoDate } from '@/lib/time/india';
import type { MessageState } from '@/lib/whatsapp/delivery';
import { RANGE_IDS, type FactRange, type RangeId } from './types';

// Where a number's rows are shown (docs/26 slice 8d, C203). A fact names the
// screen and the filter that lists exactly its rows; the address is built
// here and read back here, so the tile, the screen that opens and the test
// that compares them all speak one format:
//
//   /app/attendance?show=unmarked       /app/attendance?show=days&from=…&to=… (the marks of each day, and the rate)
//   /app/students?status=active         /app/admissions (the students waiting for consent)
//   /app/fees?show=overdue        /app/fees?show=collected&from=…&to=…
//   /app/homework?show=unchecked&from=…&to=…
//   /app/pulse?show=sent&from=…&to=…
//   /app/communication?state=held&from=…&to=…        /app/communication?show=notices (waiting for approval)
//   /app/events?show=coming       /app/parent-ai?show=drafts       /app/help/ticket?show=open | waiting
//   /app/complaints?show=open | overdue       /app/ptm?show=coming
//   /app/staff?show=leave-waiting | on-leave-today       /app/proxy?show=needs-cover (today's periods with no teacher)
//
// Dates are India's, both ends included.
//
// A number has an address only when that screen lists exactly its rows. A fact whose screen cannot do that yet is
// named in facts.ts (NO_LIST_YET, empty today) and its tile is drawn without a link rather than open a page that
// lists other rows too. Proxy Auto as it stands draws every period to cover, the covered ones among them, so its
// number carries a filter like the rest.

const DAY_MS = 86_400_000;
const daysBefore = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);

export const isRangeId = (v: unknown): v is RangeId => typeof v === 'string' && (RANGE_IDS as readonly string[]).includes(v);
export const DEFAULT_RANGE: RangeId = 'today';
const RANGE_DAYS: Record<RangeId, number> = { today: 1, '7d': 7, '30d': 30 };

// The chosen days, ending today: "7 days" is today and the six days before it.
export function rangeFor(today: string, id: RangeId): FactRange {
  return { from: daysBefore(today, RANGE_DAYS[id] - 1), to: today };
}

// Every date from..to, in order.
export function datesIn(range: FactRange): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${range.from}T00:00:00Z`), end = Date.parse(`${range.to}T00:00:00Z`); t <= end && out.length < 400; t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

type Params = { get: (name: string) => string | null } | Record<string, string | string[] | undefined>;
const read = (params: Params, name: string): string | null => {
  if (typeof (params as { get?: unknown }).get === 'function') return (params as { get: (n: string) => string | null }).get(name);
  const v = (params as Record<string, string | string[] | undefined>)[name];
  return typeof v === 'string' ? v : null;
};

// ?from=&to= as a range: two real dates in order, at most a year apart. Anything else is no range.
export function readRange(params: Params): FactRange | null {
  const from = read(params, 'from');
  const to = read(params, 'to');
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return null;
  return Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 366 * DAY_MS ? null : { from, to };
}
export const readShow = (params: Params): string | null => read(params, 'show');
export const readState = (params: Params): string | null => read(params, 'state');

const days = (range: FactRange) => `from=${range.from}&to=${range.to}`;

export const FEES_SHOWS = ['collected', 'owed', 'overdue', 'promises', 'verify'] as const;
export type FeesShow = (typeof FEES_SHOWS)[number];
export const isFeesShow = (v: unknown): v is FeesShow => typeof v === 'string' && (FEES_SHOWS as readonly string[]).includes(v);

// What /app/communication?show=, /app/events?show=, /app/parent-ai?show= and /app/ptm?show= accept: one list each.
export const NOTICES_SHOW = 'notices';
export const EVENTS_SHOW = 'coming';
export const ANSWERS_SHOW = 'drafts';
export const PTM_SHOW = 'coming';
export const ATTENDANCE_DAYS_SHOW = 'days';

// The two lists of leave /app/staff?show= opens on: the requests waiting for the office, and who is on leave today.
export const STAFF_SHOWS = ['leave-waiting', 'on-leave-today'] as const;
export type StaffShow = (typeof STAFF_SHOWS)[number];
export const isStaffShow = (v: unknown): v is StaffShow => typeof v === 'string' && (STAFF_SHOWS as readonly string[]).includes(v);

// The one filter /app/proxy?show= accepts: today's periods that still need cover, and no others.
export const PROXY_SHOW = 'needs-cover';
export type ProxyShow = typeof PROXY_SHOW;

export const screenFor = {
  attendance: (show: AttendanceShow) => `/app/attendance?show=${show}`,
  // The marks saved on each day of the range, and the present rate over all of them.
  attendanceDays: (range: FactRange) => `/app/attendance?show=${ATTENDANCE_DAYS_SHOW}&${days(range)}`,
  // The students waiting for consent are the Admissions screen's own list.
  students: (status: 'active' | 'pending_consent') => (status === 'pending_consent' ? '/app/admissions' : `/app/students?status=${status}`),
  dues: (which: DueList) => `/app/fees?show=${which}`,
  collected: (range: FactRange) => `/app/fees?show=collected&${days(range)}`,
  fees: (show: 'promises' | 'verify') => `/app/fees?show=${show}`,
  homework: (show: HomeworkShow, range: FactRange) => `/app/homework?show=${show}&${days(range)}`,
  pulseSent: (range: FactRange) => `/app/pulse?show=sent&${days(range)}`,
  messages: (state: MessageState | null, range: FactRange) => `/app/communication?${state ? `state=${state}&` : ''}${days(range)}`,
  noticesWaiting: () => `/app/communication?show=${NOTICES_SHOW}`,
  eventsComing: () => `/app/events?show=${EVENTS_SHOW}`,
  answerDrafts: () => `/app/parent-ai?show=${ANSWERS_SHOW}`,
  tickets: (show: TicketShow) => `/app/help/ticket?show=${show}`,
  complaints: (show: ComplaintShow) => `/app/complaints?show=${show}`,
  ptmComing: () => `/app/ptm?show=${PTM_SHOW}`,
  staffLeave: (show: StaffShow) => `/app/staff?show=${show}`,
  // Proxy Auto opened on today's periods that still need cover: it draws those periods and no others, under a
  // title that says how many of the day's periods they are. (Without the filter it draws the covered periods too.)
  coverToday: () => `/app/proxy?show=${PROXY_SHOW}`,
} as const;
