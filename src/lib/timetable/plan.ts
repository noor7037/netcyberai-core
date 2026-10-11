// The timetable's rules with no database in them (docs/20 5c, C145): the
// days, the clash guard, and the plan for a CSV import. A class cannot be in
// two places at once, and neither can a teacher.

export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const; // index + 1 is the ISO weekday
export type Weekday = (typeof WEEKDAYS)[number];
export const MAX_PERIODS = 12;
export const DEFAULT_PERIODS = 8;

export type Slot = { classId: string; weekday: number; period: number; subjectId: string; teacherUserId: string };

const at = (s: { weekday: number; period: number }) => `${s.weekday}:${s.period}`;

// The entry that stops `next` from being saved: the same teacher, at the
// same time, in another class. The entry already in the class's own slot is
// replaced by `next`, so it is not a clash.
export function teacherClash<T extends Slot>(existing: readonly T[], next: Slot): T | null {
  return existing.find((e) => e.teacherUserId === next.teacherUserId && at(e) === at(next) && e.classId !== next.classId) ?? null;
}

export function periodsFromSetting(value: unknown): number {
  const n = typeof value === 'number' ? Math.floor(value) : DEFAULT_PERIODS;
  return n >= 1 && n <= MAX_PERIODS ? n : DEFAULT_PERIODS;
}

// ---- CSV import -----------------------------------------------------

export const CSV_HEADER = ['class', 'day', 'period', 'subject', 'teacher'] as const;
export type CsvRow = { line: number; class: string; day: string; period: string; subject: string; teacher: string };
export type ImportProblem = {
  line: number;
  code: 'header' | 'columns' | 'unknown_class' | 'unknown_subject' | 'unknown_teacher' | 'bad_day' | 'bad_period' | 'class_clash' | 'teacher_clash';
  // The other line of the file it clashes with, or 'saved' for an entry already in the timetable.
  with?: number | 'saved';
  value?: string;
};
export const MAX_CSV_ROWS = 2000;

// class,day,period,subject,teacher: one line per period. `day` is MON..SUN
// or the day's English name; `teacher` is the teacher's sign-in email.
const unquote = (c: string) => (c.length >= 2 && c.startsWith('"') && c.endsWith('"') ? c.slice(1, -1).trim() : c);
export function parseTimetableCsv(text: string): { rows: CsvRow[]; problems: ImportProblem[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((l, i) => ({ line: i + 1, cells: l.split(',').map((c) => unquote(c.trim())) })).filter((l) => l.cells.some((c) => c !== ''));
  if (lines.length === 0 || lines[0].cells.map((c) => c.toLowerCase()).join(',') !== CSV_HEADER.join(',')) return { rows: [], problems: [{ line: 1, code: 'header' }] };
  const rows: CsvRow[] = [];
  const problems: ImportProblem[] = [];
  for (const l of lines.slice(1, MAX_CSV_ROWS + 1)) {
    if (l.cells.length !== CSV_HEADER.length || l.cells.some((c) => c === '')) problems.push({ line: l.line, code: 'columns' });
    else rows.push({ line: l.line, class: l.cells[0], day: l.cells[1], period: l.cells[2], subject: l.cells[3], teacher: l.cells[4] });
  }
  return { rows, problems };
}

export function weekdayOf(day: string): number | null {
  const d = day.trim().toUpperCase().slice(0, 3);
  const i = WEEKDAYS.indexOf(d as Weekday);
  return i === -1 ? null : i + 1;
}

export type Lookups = { classes: ReadonlyMap<string, string>; subjects: ReadonlyMap<string, string>; teachers: ReadonlyMap<string, string> };
export const lookupKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

// All or nothing: with any problem, nothing is imported and every problem
// is listed by its line. A line replaces what is saved in its own class
// slot; the clash guard is run on the timetable as it would be afterwards.
export function planImport(existing: readonly Slot[], rows: readonly CsvRow[], lookups: Lookups, periods: number): { ok: true; slots: (Slot & { line: number })[] } | { ok: false; problems: ImportProblem[] } {
  const problems: ImportProblem[] = [];
  const slots: (Slot & { line: number })[] = [];
  for (const r of rows) {
    const classId = lookups.classes.get(lookupKey(r.class));
    const subjectId = lookups.subjects.get(lookupKey(r.subject));
    const teacherUserId = lookups.teachers.get(lookupKey(r.teacher));
    const weekday = weekdayOf(r.day);
    const period = /^\d{1,2}$/.test(r.period) ? Number(r.period) : NaN;
    const before = problems.length;
    if (!classId) problems.push({ line: r.line, code: 'unknown_class', value: r.class });
    if (!subjectId) problems.push({ line: r.line, code: 'unknown_subject', value: r.subject });
    if (!teacherUserId) problems.push({ line: r.line, code: 'unknown_teacher', value: r.teacher });
    if (!weekday) problems.push({ line: r.line, code: 'bad_day', value: r.day });
    if (!(period >= 1 && period <= periods)) problems.push({ line: r.line, code: 'bad_period', value: r.period });
    if (problems.length === before) slots.push({ line: r.line, classId: classId!, subjectId: subjectId!, teacherUserId: teacherUserId!, weekday: weekday!, period });
  }

  // A class in two places: two lines for one class slot.
  const classSlot = new Map<string, number>();
  for (const s of slots) {
    const key = `${s.classId}:${at(s)}`;
    const first = classSlot.get(key);
    if (first !== undefined) problems.push({ line: s.line, code: 'class_clash', with: first });
    else classSlot.set(key, s.line);
  }
  // A teacher in two places, on the timetable as it would be after the import.
  const after = new Map<string, { line: number | 'saved'; classId: string }>();
  for (const e of existing) if (!classSlot.has(`${e.classId}:${at(e)}`)) after.set(`${e.teacherUserId}:${at(e)}`, { line: 'saved', classId: e.classId });
  for (const s of slots) {
    const key = `${s.teacherUserId}:${at(s)}`;
    const other = after.get(key);
    if (other && other.classId !== s.classId) problems.push({ line: s.line, code: 'teacher_clash', with: other.line });
    else if (!other) after.set(key, { line: s.line, classId: s.classId });
  }
  if (problems.length) return { ok: false, problems: problems.sort((a, b) => a.line - b.line) };
  return { ok: true, slots };
}
