import { parseCsv } from '@/lib/import/csv';
import { toCsv, type ReportStat, type ReportTone, type ToolReport } from './report';

// Student Data Check for UDISE+ and APAAR: the school's record of each
// student's name, date of birth and gender against the same details as
// printed on Aadhaar. Runs in the browser only; nothing is kept.
//
// The Aadhaar NUMBER is never asked for, read or kept. A column whose
// values look like 12-digit numbers is dropped before anything else is
// done with the file, and the school is told to remove it.

export type StudentKey =
  | 'admission_no'
  | 'class'
  | 'name_in_school'
  | 'dob_in_school'
  | 'gender_in_school'
  | 'name_in_aadhaar'
  | 'dob_in_aadhaar'
  | 'gender_in_aadhaar'
  | 'parent_name'
  | 'parent_phone';

export type StudentRecord = Record<StudentKey, string>;

export const SDC_COLUMNS: { key: StudentKey; required: boolean; hint: string }[] = [
  { key: 'admission_no', required: true, hint: 'The school’s admission number.' },
  { key: 'class', required: true, hint: 'Class and section, as printed on the letter.' },
  { key: 'name_in_school', required: true, hint: 'Name as in the school record (UDISE+).' },
  { key: 'dob_in_school', required: true, hint: 'dd-mm-yyyy, dd/mm/yyyy, dd.mm.yyyy or yyyy-mm-dd.' },
  { key: 'gender_in_school', required: true, hint: 'M, F, Male, Female, Boy, Girl, T, Transgender or Other.' },
  { key: 'name_in_aadhaar', required: true, hint: 'Name exactly as printed on Aadhaar.' },
  { key: 'dob_in_aadhaar', required: true, hint: 'Date of birth as printed on Aadhaar.' },
  { key: 'gender_in_aadhaar', required: true, hint: 'Gender as printed on Aadhaar.' },
  { key: 'parent_name', required: false, hint: 'Optional. Printed on the letter.' },
  { key: 'parent_phone', required: false, hint: 'Optional. A 10-digit mobile number, kept in the mismatches CSV for the office.' },
];

const KEYS = SDC_COLUMNS.map((c) => c.key);
export const SDC_TEMPLATE_CSV = `${KEYS.join(',')}\r\n`;
export const MAX_STUDENTS = 5000;
const MAX_CELL = 120;

export const AADHAAR_NOTICE = 'Aadhaar numbers are not needed for this check. Remove that column before sharing the file.';

export const emptyStudent = (): StudentRecord => Object.fromEntries(KEYS.map((k) => [k, ''])) as StudentRecord;

// ---- dates -------------------------------------------------------------------

export interface DayDate {
  y: number;
  m: number;
  d: number;
}

const DMY = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{4})$/;
const YMD = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Reads dd-mm-yyyy, dd/mm/yyyy, dd.mm.yyyy and yyyy-mm-dd. Anything else,
// or a date that does not exist (31-02-2015), is null.
export function readDate(s: string): DayDate | null {
  const t = s.trim();
  let y: number;
  let m: number;
  let d: number;
  const a = DMY.exec(t);
  const b = a ? null : YMD.exec(t);
  if (a) [d, m, y] = [Number(a[1]), Number(a[3]), Number(a[4])];
  else if (b) [y, m, d] = [Number(b[1]), Number(b[2]), Number(b[3])];
  else return null;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

const two = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: DayDate) => `${d.y}-${two(d.m)}-${two(d.d)}`;
export const showDate = (d: DayDate) => `${two(d.d)}-${two(d.m)}-${d.y}`;
export const dayNumber = (d: DayDate) => Date.UTC(d.y, d.m - 1, d.d) / 86_400_000;
export const daysBetween = (from: DayDate, to: DayDate) => dayNumber(to) - dayNumber(from);
export const sameDay = (a: DayDate, b: DayDate) => a.y === b.y && a.m === b.m && a.d === b.d;
export function dateOf(now: Date): DayDate {
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}
// A typed or imported date as yyyy-mm-dd for a date input; '' when unreadable.
export const toIso = (s: string) => {
  const d = readDate(s);
  return d ? isoDate(d) : '';
};

// ---- findings ------------------------------------------------------------------

export type FieldId = 'name' | 'dob' | 'gender';
export type Finding = 'exact' | 'format' | 'order' | 'spelling' | 'swapped' | 'missing' | 'unreadable' | 'different';

export const FIELD_LABEL: Record<FieldId, string> = { name: 'Name', dob: 'Date of birth', gender: 'Gender' };

export const FINDING_LABEL: Record<Finding, string> = {
  exact: 'Exact match',
  format: 'Spacing or capitals only',
  order: 'Another order, an initial or a short form',
  spelling: 'Likely spelling slip',
  swapped: 'Day and month swapped',
  missing: 'Missing or not recognised',
  unreadable: 'Date not readable',
  different: 'Real difference',
};

// Most serious first: a real difference needs the family; a missing or
// unreadable value needs the office; the rest are quick for a person.
export const SEVERITY: Record<Finding, number> = { exact: 0, format: 1, order: 2, spelling: 3, swapped: 3, missing: 4, unreadable: 4, different: 5 };

export const FINDING_TONE: Record<Finding, ReportTone> = {
  exact: 'good',
  format: 'warn',
  order: 'warn',
  spelling: 'warn',
  swapped: 'warn',
  missing: 'bad',
  unreadable: 'bad',
  different: 'bad',
};

// Short forms read as the same word (the list stays this small on purpose).
const ALIAS: Record<string, string> = { md: 'mohammad', mohd: 'mohammad', mohammad: 'mohammad', mohammed: 'mohammad', kr: 'kumar', kumar: 'kumar' };

function words(s: string): string[] {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

const letters = (s: string) => Array.from(s).length;

// Levenshtein distance, stopping early once it is past the limit.
export function editDistance(a: string, b: string, limit = 3): number {
  const x = Array.from(a);
  const y = Array.from(b);
  if (Math.abs(x.length - y.length) > limit) return limit + 1;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > limit) return limit + 1;
    prev = cur;
  }
  return prev[y.length];
}

function sameWords(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ');
}

// Same words once each single letter on one side is read as the initial of
// a whole word on the other ("R Kumar" and "Ravi Kumar").
function initialsMatch(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const ra = [...a];
  const rb = [...b];
  for (let i = ra.length - 1; i >= 0; i--) {
    const j = rb.indexOf(ra[i]);
    if (j >= 0) {
      ra.splice(i, 1);
      rb.splice(j, 1);
    }
  }
  const pairOff = (short: string[], long: string[]) => {
    for (let i = short.length - 1; i >= 0; i--) {
      if (letters(short[i]) !== 1) continue;
      const j = long.findIndex((w) => letters(w) > 1 && Array.from(w)[0] === short[i]);
      if (j >= 0) {
        short.splice(i, 1);
        long.splice(j, 1);
      }
    }
  };
  pairOff(ra, rb);
  pairOff(rb, ra);
  return ra.length === 0 && rb.length === 0;
}

export function compareName(school: string, aadhaar: string): Finding {
  const a = school.trim();
  const b = aadhaar.trim();
  if (!a || !b) return 'missing';
  if (a === b) return 'exact';
  const wa = words(a);
  const wb = words(b);
  if (wa.join('') === wb.join('')) return 'format';
  const ca = wa.map((w) => ALIAS[w] ?? w);
  const cb = wb.map((w) => ALIAS[w] ?? w);
  if (sameWords(ca, cb) || initialsMatch(ca, cb)) return 'order';
  const na = ca.join('');
  const nb = cb.join('');
  if (letters(na) > 3 && letters(nb) > 3) {
    const d = Math.min(editDistance(na, nb), editDistance([...ca].sort().join(''), [...cb].sort().join('')));
    if (d <= 2) return 'spelling';
  }
  return 'different';
}

export function compareDob(school: string, aadhaar: string): Finding {
  if (!school.trim() || !aadhaar.trim()) return 'missing';
  const a = readDate(school);
  const b = readDate(aadhaar);
  if (!a || !b) return 'unreadable';
  if (sameDay(a, b)) return 'exact';
  if (a.y === b.y && a.d === b.m && a.m === b.d) return 'swapped';
  return 'different';
}

const GENDER: Record<string, 'M' | 'F' | 'T'> = { m: 'M', male: 'M', boy: 'M', f: 'F', female: 'F', girl: 'F', t: 'T', transgender: 'T', other: 'T' };

export function readGender(s: string): 'M' | 'F' | 'T' | null {
  return GENDER[s.trim().toLowerCase()] ?? null;
}

export function compareGender(school: string, aadhaar: string): Finding {
  const a = readGender(school);
  const b = readGender(aadhaar);
  if (!a || !b) return 'missing';
  return a === b ? 'exact' : 'different';
}

// ---- reading the list ------------------------------------------------------------

export interface ParsedList {
  students: StudentRecord[];
  missingColumns: StudentKey[];
  // Columns left out because their values look like Aadhaar numbers.
  droppedColumns: string[];
  unknownColumns: string[];
  truncated: boolean;
}

// Twelve digits, with or without spaces or dashes between groups.
export function looksLikeAadhaarNumber(v: string): boolean {
  return /^\d{12}$/.test(v.replace(/[\s-]/g, ''));
}

// Our own saved CSV guards formula-looking cells with an apostrophe
// (report.ts csvCell); take it off again when the file comes back.
const unguard = (v: string) => v.trim().replace(/^'(?=[=+\-@])/, '').slice(0, MAX_CELL);

const REQUIRED = SDC_COLUMNS.filter((c) => c.required).map((c) => c.key);

export function parseStudentList(text: string): ParsedList {
  const table = parseCsv(text.replace(/^﻿/, ''));
  if (table.length === 0) return { students: [], missingColumns: [...REQUIRED], droppedColumns: [], unknownColumns: [], truncated: false };
  const head = table[0].map((h) => h.trim());
  const keys = head.map((h) => h.toLowerCase().replace(/[\s-]+/g, '_'));
  const body = table.slice(1).filter((r) => r.some((c) => c.trim() !== ''));
  const dropped = new Set<number>();
  head.forEach((_, i) => {
    if (body.some((r) => looksLikeAadhaarNumber(r[i] ?? ''))) dropped.add(i);
  });
  const at = new Map<StudentKey, number>();
  const unknownColumns: string[] = [];
  keys.forEach((k, i) => {
    if (dropped.has(i) || !k) return;
    if ((KEYS as string[]).includes(k) && !at.has(k as StudentKey)) at.set(k as StudentKey, i);
    else unknownColumns.push(head[i]);
  });
  const missingColumns = REQUIRED.filter((k) => !at.has(k));
  const students = body.slice(0, MAX_STUDENTS).map((r) => {
    const s = emptyStudent();
    for (const [k, i] of at) s[k] = unguard(r[i] ?? '');
    return s;
  });
  return {
    students,
    missingColumns,
    droppedColumns: [...dropped].map((i) => head[i] || `column ${i + 1}`),
    unknownColumns,
    truncated: body.length > MAX_STUDENTS,
  };
}

export function studentsToCsv(students: StudentRecord[]): string {
  return toCsv([KEYS, ...students.map((s) => KEYS.map((k) => s[k]))]);
}

// ---- checking -------------------------------------------------------------------

export interface FieldCheck {
  field: FieldId;
  school: string;
  aadhaar: string;
  finding: Finding;
}

export interface CheckedStudent {
  // 1-based position in the list, so a row can always be found again.
  row: number;
  student: StudentRecord;
  fields: FieldCheck[];
  severity: number;
}

export function checkStudent(s: StudentRecord, row: number): CheckedStudent {
  const fields: FieldCheck[] = [
    { field: 'name', school: s.name_in_school, aadhaar: s.name_in_aadhaar, finding: compareName(s.name_in_school, s.name_in_aadhaar) },
    { field: 'dob', school: s.dob_in_school, aadhaar: s.dob_in_aadhaar, finding: compareDob(s.dob_in_school, s.dob_in_aadhaar) },
    { field: 'gender', school: s.gender_in_school, aadhaar: s.gender_in_aadhaar, finding: compareGender(s.gender_in_school, s.gender_in_aadhaar) },
  ];
  return { row, student: s, fields, severity: Math.max(...fields.map((f) => SEVERITY[f.finding])) };
}

export const checkStudents = (students: StudentRecord[]) => students.map((s, i) => checkStudent(s, i + 1));

export const studentName = (s: StudentRecord) => s.name_in_school.trim() || s.name_in_aadhaar.trim() || 'Name missing';

// Students with at least one difference, most serious first, then in list order.
export function studentsWithMismatch(checked: CheckedStudent[]): CheckedStudent[] {
  return checked.filter((c) => c.severity > 0).sort((a, b) => b.severity - a.severity || a.row - b.row);
}

export interface MismatchRow {
  c: CheckedStudent;
  f: FieldCheck;
}

export function mismatchRows(checked: CheckedStudent[]): MismatchRow[] {
  return checked
    .flatMap((c) => c.fields.filter((f) => f.finding !== 'exact').map((f) => ({ c, f })))
    .sort((a, b) => SEVERITY[b.f.finding] - SEVERITY[a.f.finding] || a.c.row - b.c.row);
}

export function mismatchesCsv(checked: CheckedStudent[]): string {
  const head = ['admission_no', 'class', 'student', 'detail', 'in_school_record', 'on_aadhaar', 'finding', 'parent_name', 'parent_phone'];
  return toCsv([
    head,
    ...mismatchRows(checked).map(({ c, f }) => [
      c.student.admission_no,
      c.student.class,
      studentName(c.student),
      FIELD_LABEL[f.field],
      f.school,
      f.aadhaar,
      FINDING_LABEL[f.finding],
      c.student.parent_name,
      c.student.parent_phone,
    ]),
  ]);
}

export interface CheckCounts {
  rows: number;
  allMatching: number;
  needCheck: number;
  realDifferences: number;
}

export function countChecks(checked: CheckedStudent[]): CheckCounts {
  return {
    rows: checked.length,
    allMatching: checked.filter((c) => c.severity === 0).length,
    needCheck: checked.filter((c) => c.severity > 0 && c.severity < SEVERITY.different).length,
    realDifferences: checked.filter((c) => c.severity === SEVERITY.different).length,
  };
}

export const MAX_REPORT_ROWS = 1000;

export function dataCheckReport(checked: CheckedStudent[]): ToolReport {
  const k = countChecks(checked);
  const rows = mismatchRows(checked);
  const shown = rows.slice(0, MAX_REPORT_ROWS);
  const stats: ReportStat[] = [
    { label: 'Students checked', value: String(k.rows) },
    { label: 'All three details match', value: String(k.allMatching), tone: k.allMatching === k.rows ? 'good' : 'neutral' },
    { label: 'Needing a check', value: String(k.needCheck), tone: k.needCheck ? 'warn' : 'neutral', note: 'Spacing, order, a likely slip, or a value missing' },
    { label: 'Real differences', value: String(k.realDifferences), tone: k.realDifferences ? 'bad' : 'good', note: 'Students with at least one real difference' },
  ];
  return {
    title: 'Student data check: school record against Aadhaar',
    subtitle: 'Name, date of birth and gender, for UDISE+ and APAAR',
    sections: [
      { kind: 'stats', items: stats },
      rows.length
        ? {
            kind: 'table',
            heading: 'Differences, most serious first',
            columns: ['Finding', 'Adm. no.', 'Class', 'Student', 'Detail', 'School record', 'Aadhaar'],
            rows: shown.map(({ c, f }) => [FINDING_LABEL[f.finding], c.student.admission_no, c.student.class, studentName(c.student), FIELD_LABEL[f.field], f.school || '—', f.aadhaar || '—']),
            rowTones: shown.map(({ f }) => FINDING_TONE[f.finding]),
          }
        : { kind: 'notes', heading: 'Differences', items: ['Every student’s name, date of birth and gender match exactly.'], tone: 'good' },
      ...(rows.length > shown.length
        ? [{ kind: 'notes' as const, heading: 'More differences', items: [`The first ${shown.length} of ${rows.length} differences are shown. Save the mismatches CSV for the full list.`] }]
        : []),
    ],
    assumptions: [
      'Names are compared after ignoring capitals, spaces and full stops. Md, Mohd, Mohammad and Mohammed are read as the same word, and so are Kr and Kumar.',
      'A likely spelling slip is a name of more than three letters that differs by one or two letters. A person should still decide each one.',
      'Dates are read as dd-mm-yyyy, dd/mm/yyyy, dd.mm.yyyy or yyyy-mm-dd. A date written any other way is listed as not readable.',
      'Gender is read from M, F, Male, Female, Boy, Girl, T, Transgender or Other. T, Transgender and Other are read as the same.',
      'Aadhaar numbers are never read or kept. A column that looks like one is left out.',
    ],
    disclaimer: 'This check compares the two versions you entered. It does not connect to UDISE+, APAAR or UIDAI. Check each difference against the documents before any record is corrected.',
  };
}

// ---- correction letters ------------------------------------------------------------

export interface CorrectionLetter {
  row: number;
  student: string;
  className: string;
  admissionNo: string;
  salutation: string;
  paragraphs: string[];
  fields: { label: string; school: string; aadhaar: string; finding: string }[];
  choices: string[];
  closing: string[];
  signLines: string[];
}

export const LETTER_TITLE = 'Request to confirm your child’s details';
export const LETTER_CHOICES = ['School record is correct', 'Aadhaar is correct', 'Neither — the correct details are:'];

export function correctionLetter(c: CheckedStudent): CorrectionLetter {
  const s = c.student;
  const name = studentName(s);
  return {
    row: c.row,
    student: name,
    className: s.class.trim(),
    admissionNo: s.admission_no.trim(),
    salutation: s.parent_name.trim() ? `Dear ${s.parent_name.trim()},` : 'Dear parent or guardian,',
    paragraphs: [
      `Some details in the school’s record for ${name} do not match the details on the child’s Aadhaar. The APAAR ID is created only when the school’s UDISE+ record and Aadhaar match.`,
      'For each detail below, please tick the version that is correct, or write the correct details. Then sign this letter and return it to the school office.',
    ],
    fields: c.fields
      .filter((f) => f.finding !== 'exact')
      .map((f) => ({ label: FIELD_LABEL[f.field], school: f.school.trim() || 'Not recorded', aadhaar: f.aadhaar.trim() || 'Not recorded', finding: FINDING_LABEL[f.finding] })),
    choices: LETTER_CHOICES,
    closing: [
      'Please bring a supporting document for the correct details when you return this letter.',
      'If the school record is wrong, the school corrects it in UDISE+. If Aadhaar is wrong, the family corrects it with UIDAI.',
    ],
    signLines: ['Signature of parent or guardian', 'Name of parent or guardian', 'Date'],
  };
}

// Letters for one class, or every class when cls is ''.
export function lettersFor(checked: CheckedStudent[], cls = ''): CorrectionLetter[] {
  return studentsWithMismatch(checked)
    .filter((c) => !cls || c.student.class.trim() === cls)
    .map(correctionLetter);
}

export function mismatchClasses(checked: CheckedStudent[]): string[] {
  return [...new Set(studentsWithMismatch(checked).map((c) => c.student.class.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}
