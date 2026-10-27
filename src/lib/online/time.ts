// An online test's times as people read and type them (C365): India's date and time, "2026-10-28T10:00" (a
// datetime-local field), whatever the device's own zone. India keeps one offset all year (+05:30). Pure: safe in the
// browser and on the server.

const IST_MS = (5 * 60 + 30) * 60_000;
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// India's "YYYY-MM-DDTHH:MM" as an ISO instant; null for anything else (a day that does not exist included).
export function indiaLocalToIso(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = LOCAL.exec(v);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const utc = Date.UTC(y, mo - 1, d, h, mi);
  const back = new Date(utc);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return new Date(utc - IST_MS).toISOString();
}

// An instant as India's "YYYY-MM-DDTHH:MM".
export function isoToIndiaLocal(iso: string): string {
  return new Date(new Date(iso).getTime() + IST_MS).toISOString().slice(0, 16);
}
