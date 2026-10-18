// What a new academic session is asked for, and the shape a session is read in (docs/28 slice 10g, C244). Plain
// data and rules, no database, so the Setup screen and the route read the same ones.

export const MAX_SESSION_LABEL = 30;

export type SessionRow = { sessionId: string; label: string; startDate: string; endDate: string; isCurrent: boolean };
export type SessionInput = { label: string; startDate: string; endDate: string };
// What is wrong with a session as asked for: the route answers with this code, the screen says it in words.
export type SessionRefusal = 'session_label' | 'session_dates' | 'session_order';

// A date written as year-month-day that is a day on the calendar.
export function isRealDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d;
}

// A name (1 to 30 characters, spaces tidied), a first and a last day that are real days, the last after the first
// (the table's own check says the same).
export function parseSessionInput(body: unknown): { ok: true; value: SessionInput } | { ok: false; code: SessionRefusal } {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const label = typeof b.label === 'string' ? b.label.trim().replace(/\s+/g, ' ') : '';
  if (!label || label.length > MAX_SESSION_LABEL) return { ok: false, code: 'session_label' };
  if (!isRealDate(b.startDate) || !isRealDate(b.endDate)) return { ok: false, code: 'session_dates' };
  if (b.endDate <= b.startDate) return { ok: false, code: 'session_order' };
  return { ok: true, value: { label, startDate: b.startDate, endDate: b.endDate } };
}
