import { rangeFor } from '@/lib/insights/screens';
import { RANGE_IDS, type RangeId } from '@/lib/insights/types';
import { REPORT_MAX_DAYS, type ReportRange } from './types';

// The days a report covers (docs/26 slice 8h, C207). India's dates, both ends
// included. Either one of the dashboard's own choices (?range=today|7d|30d:
// the same days the dashboard counts for that choice, so a report's total
// and the dashboard's number are about the same days), or two dates
// (?from=…&to=…): real days of the calendar, in order, at most 366 days.
// Anything else is no range, and the report is refused: it is never run on
// days the person did not ask for.

export const REPORT_RANGE_IDS = RANGE_IDS;
export const DEFAULT_REPORT_RANGE: RangeId = '30d';
export const isReportRangeId = (v: unknown): v is RangeId => typeof v === 'string' && (RANGE_IDS as readonly string[]).includes(v);

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
// A real day of the calendar, written YYYY-MM-DD (the thirty-first of February is not one).
export function isRealDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const at = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(at) && new Date(at).toISOString().slice(0, 10) === value;
}
// How many days from..to is, both included.
export const daysIn = (range: ReportRange): number => dayNumber(range.to) - dayNumber(range.from) + 1;

type Params = { get: (name: string) => string | null };
export type AskedRange = { ok: true; range: ReportRange; rangeId: RangeId | null } | { ok: false };

export function readReportRange(params: Params, today: string): AskedRange {
  const from = params.get('from');
  const to = params.get('to');
  const id = params.get('range');
  if (from !== null || to !== null) {
    // Two dates and a named choice together would be two answers to one question.
    if (id !== null || !isRealDay(from) || !isRealDay(to) || from > to) return { ok: false };
    const range = { from, to };
    return daysIn(range) > REPORT_MAX_DAYS ? { ok: false } : { ok: true, range, rangeId: null };
  }
  if (id !== null && !isReportRangeId(id)) return { ok: false };
  const rangeId = id ?? DEFAULT_REPORT_RANGE;
  return { ok: true, range: rangeFor(today, rangeId), rangeId };
}

// The same choice as an address's query: what the screen asks the server with, and the export link carries.
export const rangeQuery = (asked: { rangeId: RangeId } | { from: string; to: string }): string => ('rangeId' in asked ? `range=${asked.rangeId}` : `from=${asked.from}&to=${asked.to}`);
