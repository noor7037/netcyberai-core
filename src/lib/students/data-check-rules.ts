import { SEVERITY, compareDob, compareGender, compareName, looksLikeAadhaarNumber, readDate, showDate, type Finding } from '@/lib/free-tools/student-data-check';

// The student data check's pure rules (docs/28 row 10b, C222): what the screen and the server both need, and nothing
// that reads a database. The comparison is the website free tool's own (src/lib/free-tools/student-data-check.ts),
// imported, never copied: one rule in one place (docs/28 section 3 rule 2).
//
// NO AADHAAR NUMBER, EVER (rule 1): hasAadhaarNumber() is the app's refusal. It asks the free tool's
// looksLikeAadhaarNumber (a value that IS twelve digits), and also refuses a value that CONTAINS a run of twelve
// digits, which is the database's own check (public.no_aadhaar_number), so the app refuses first whatever the
// database would refuse. Devanagari digits are read as digits by both.

export const DATA_CHECK_FIELDS = ['name', 'dob', 'gender'] as const;
export type DataCheckField = (typeof DATA_CHECK_FIELDS)[number];
export const isDataCheckField = (v: unknown): v is DataCheckField => typeof v === 'string' && (DATA_CHECK_FIELDS as readonly string[]).includes(v);

// The school record's gender: Aadhaar's own set, as the free tool's readGender reads it, plus "not given".
export const RECORD_GENDERS = ['male', 'female', 'transgender', 'not_given'] as const;
export type RecordGender = (typeof RECORD_GENDERS)[number];
// What Aadhaar prints is always one of the three.
export const PRINTED_GENDERS = ['male', 'female', 'transgender'] as const;
export type PrintedGender = (typeof PRINTED_GENDERS)[number];
export const isPrintedGender = (v: unknown): v is PrintedGender => typeof v === 'string' && (PRINTED_GENDERS as readonly string[]).includes(v);

export type { Finding };
export const MAX_NAME = 120;
export const MAX_NOTE = 600;
export const MAX_CLOSING_NOTE = 300;

const asciiDigits = (v: string) => v.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));

export function hasAadhaarNumber(v: string): boolean {
  const ascii = asciiDigits(v);
  return looksLikeAadhaarNumber(ascii) || /\d{12}/.test(ascii.replace(/[\s-]/g, ''));
}

// A parent may write their child's Aadhaar number in a WhatsApp reply. It is never stored by the data check, and
// it is never shown on its screen either: a run of twelve digits (spaces and dashes between groups) is replaced.
export function hideAadhaarNumbers(text: string, hidden: string): string {
  return text.replace(/(?:[0-9०-९][\s-]?){11}[0-9०-९]/g, hidden);
}

// The record and the printed values as the free tool reads them: a date as yyyy-mm-dd (its readDate reads it), a
// gender as its word ("not given" is no value at all, so it is "missing", never a "real difference").
export type Details = { name: string | null; dob: string | null; gender: string | null };
const genderWord = (g: string | null) => (g && g !== 'not_given' ? g : '');

export type FieldFinding = { field: DataCheckField; school: string | null; printed: string | null; finding: Finding; severity: number };

export function compareDetails(record: Details, printed: Details): FieldFinding[] {
  const rows: [DataCheckField, Finding][] = [
    ['name', compareName(record.name ?? '', printed.name ?? '')],
    ['dob', compareDob(record.dob ?? '', printed.dob ?? '')],
    ['gender', compareGender(genderWord(record.gender), genderWord(printed.gender))],
  ];
  return rows.map(([field, finding]) => ({ field, school: record[field], printed: printed[field], finding, severity: SEVERITY[finding] }));
}

// The most serious finding of a child: the free tool's own order (a real difference first).
export const worstSeverity = (fields: readonly FieldFinding[]) => Math.max(0, ...fields.map((f) => f.severity));

// A date as the school and the parent read it: dd-mm-yyyy.
export function sayDob(iso: string | null): string | null {
  const d = iso ? readDate(iso) : null;
  return d ? showDate(d) : iso;
}

// The printed values as typed on the screen: each one checked, or why not. A blank value is "not typed".
export type PrintedInput = { name: string; dob: string; gender: string };
export type PrintedValues = { name: string | null; dob: string | null; gender: PrintedGender | null };
export type PrintedProblem = 'aadhaar_number' | 'name' | 'dob' | 'gender' | 'empty';
export function readPrinted(input: PrintedInput, today: string): { ok: true; values: PrintedValues } | { ok: false; reason: PrintedProblem } {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (hasAadhaarNumber(input.name)) return { ok: false, reason: 'aadhaar_number' };
  if (name.length > MAX_NAME) return { ok: false, reason: 'name' };
  const dob = input.dob.trim();
  const day = dob ? readDate(dob) : null;
  if (dob && (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || !day || dob > today)) return { ok: false, reason: 'dob' };
  const gender = input.gender.trim();
  if (gender && !isPrintedGender(gender)) return { ok: false, reason: 'gender' };
  if (!name && !dob && !gender) return { ok: false, reason: 'empty' };
  return { ok: true, values: { name: name || null, dob: dob || null, gender: gender ? (gender as PrintedGender) : null } };
}

// The value the school record is corrected to: a name, a date (not after today, in India), or one of the three
// printed genders.
export type Read = { ok: true; value: string } | { ok: false; reason: 'aadhaar_number' | 'value' };
export function readCorrection(field: DataCheckField, raw: string, today: string): Read {
  if (hasAadhaarNumber(raw)) return { ok: false, reason: 'aadhaar_number' };
  const v = raw.trim().replace(/\s+/g, ' ');
  const fits = field === 'name' ? v.length >= 1 && v.length <= MAX_NAME : field === 'dob' ? /^\d{4}-\d{2}-\d{2}$/.test(v) && readDate(v) !== null && v <= today : isPrintedGender(v);
  return fits ? { ok: true, value: v } : { ok: false, reason: 'value' };
}

// A short note: an answer that came another way, or why a request is closed.
export function readNote(raw: string, max: number): Read {
  if (hasAadhaarNumber(raw)) return { ok: false, reason: 'aadhaar_number' };
  const v = raw.trim();
  return v && v.length <= max ? { ok: true, value: v } : { ok: false, reason: 'value' };
}
