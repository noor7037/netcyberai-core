// Today's date in India as YYYY-MM-DD: the day a school means by "today".
export function indiaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

// The last `days` calendar days ending today, each with its value. A day
// the database returned no row for gets `missing`: null where no row means
// "nothing was recorded" (attendance), 0 where it means "none" (messages).
// The chart then shows the gap instead of drawing a line across it.
export const lastDays = <T extends number | null>(rows: readonly { date: string; value: number }[], days: number, missing: T, now: Date = new Date()): { t: string; v: number | T }[] => {
  const byDate = new Map(rows.map((r) => [r.date.slice(0, 10), r.value]));
  const end = Date.parse(`${indiaToday(now)}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(end - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
    return { t: day, v: byDate.get(day) ?? missing };
  });
};
