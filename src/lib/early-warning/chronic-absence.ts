// Chronic absence (W20-B, docs/42 H2): who is becoming chronically absent, with the reason the rule gives. Pure: no
// database, no session. The list (src/lib/attendance/chronic.ts) and the tests read this one file.
//
// It sits beside the Early Warning attendance signal (rules.ts: in school on fewer than 75 of every 100 days) and does
// not replace it: that one is a rate for the flag; this one counts the days, so the office can tell the family sooner.
//
//   - A school day is a day on which the student's class has marks. The window is the class's last school days.
//   - A day on leave (sick, family, a school activity) is not a day for or against the student: it is left out.
//   - A day with no mark for the student is not counted either: nothing is guessed.
//   - Never a ranking and never a verdict: a reason to ask the family how the child is.

export const CHRONIC = {
  // 3 or more absences in the last 10 school days.
  recentDays: 10,
  recentAbsences: 3,
  // 3 school days absent in a row, up to the latest day marked.
  consecutiveDays: 3,
  // 20 in every 100 of the last 30 school days, counted only when at least 20 days were marked (so never on 2 or 3 days).
  rateDays: 30,
  ratePercent: 20,
  rateMinCounted: 20,
  // The family is told once in this many days for the same student.
  tellOnceInDays: 7,
} as const;
export type ChronicSettings = { -readonly [K in keyof typeof CHRONIC]: number };

export type DayStatus = 'present' | 'late' | 'absent' | 'leave';
// One school day of the student's class: the student's mark that day, or null when they have none.
export type SchoolDay = { date: string; status: DayStatus | null };

export type ChronicReason =
  | { kind: 'recent'; absent: number; of: number }
  | { kind: 'consecutive'; days: number; endedOn: string }
  | { kind: 'rate'; absent: number; of: number; percent: number };

export type ChronicResult = { chronic: boolean; reasons: ChronicReason[] };

// The latest first, leave and unmarked days dropped: the days that count.
function counted(days: readonly SchoolDay[], windowDays: number): { date: string; absent: boolean }[] {
  return [...days]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, windowDays)
    .filter((d) => d.status === 'present' || d.status === 'late' || d.status === 'absent')
    .map((d) => ({ date: d.date, absent: d.status === 'absent' }));
}

export function chronicAbsence(days: readonly SchoolDay[], settings: ChronicSettings = CHRONIC): ChronicResult {
  const reasons: ChronicReason[] = [];
  const recent = counted(days, settings.recentDays);
  const recentAbsent = recent.filter((d) => d.absent).length;
  // The run of absent days that ends at the latest day marked: the streak that is still going.
  const latest = counted(days, settings.rateDays);
  let run = 0;
  while (run < latest.length && latest[run].absent) run += 1;
  if (run >= settings.consecutiveDays) reasons.push({ kind: 'consecutive', days: run, endedOn: latest[0].date });
  if (recentAbsent >= settings.recentAbsences) reasons.push({ kind: 'recent', absent: recentAbsent, of: recent.length });
  const absent30 = latest.filter((d) => d.absent).length;
  if (latest.length >= settings.rateMinCounted && absent30 * 100 >= settings.ratePercent * latest.length) {
    reasons.push({ kind: 'rate', absent: absent30, of: latest.length, percent: Math.round((absent30 * 100) / latest.length) });
  }
  return { chronic: reasons.length > 0, reasons };
}

// The reason in words (English), for the audit line and the family notice. The screen says the same with its own words.
export function reasonText(r: ChronicReason): string {
  if (r.kind === 'recent') return `absent ${r.absent} of the last ${r.of} school days`;
  if (r.kind === 'consecutive') return `absent ${r.days} school days in a row`;
  return `absent ${r.absent} of the last ${r.of} school days (${r.percent} in every 100)`;
}
