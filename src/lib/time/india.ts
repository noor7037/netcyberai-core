// The school day is India's (C131, C144): one helper, so attendance, My Day
// and the dashboards never disagree between midnight and 05:30 India time,
// when the UTC date is still yesterday's.

// For SQL: today's date in India.
export const INDIA_TODAY_SQL = `(now() at time zone 'Asia/Kolkata')::date`;

const FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });

// The date in India at this moment, as YYYY-MM-DD.
export function indiaDate(at: Date = new Date()): string {
  return FORMAT.format(at);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}
