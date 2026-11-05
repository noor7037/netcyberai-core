import { REGISTER_OCR_FIELDS, type RegisterOcrField } from '@/lib/ai/prompts/students.register_ocr/v1';
import { hasAadhaarNumber } from '@/lib/privacy/aadhaar';
import { isRealIsoDate } from '@/lib/import/rules';

// A paper admission register read into the student import (W21-M5, docs/42 Medium: Students OCR). The AI's answer
// (students.register_ocr, src/lib/ai/prompts/students.register_ocr) is cleaned here field by field, then shown to the
// office beside the photo, with every field under the confidence floor marked. The office corrects the rows, and they
// go to the existing CSV import (src/app/api/app/students/import) as a file, through its own checks: nothing is written
// by the reading itself. Pure: no database, no Node APIs, so the review screen uses the same functions.

export const REGISTER_FIELDS = REGISTER_OCR_FIELDS;
export type RegisterField = RegisterOcrField;

// Under this, a field is marked for the office to check (the model's own word for how sure it is; a field the clean-up
// had to change or could not put into the import's shape is marked too).
export const CONFIDENCE_FLOOR = 0.8;
// One page of a register holds a few dozen rows; more than this is not a page, and the rest is dropped.
export const MAX_ROWS = 80;

const MAX_LENGTH: Record<RegisterField, number> = {
  admission_no: 40,
  name: 120,
  guardian_name: 120,
  dob: 40,
  class: 20,
  section: 10,
  gender: 20,
  phone: 20,
  address: 300,
};

export type RegisterCell = { value: string | null; confidence: number; low: boolean };
export type RegisterRow = Record<RegisterField, RegisterCell>;
export type RegisterParse = { ok: true; rows: RegisterRow[] } | { ok: false; reason: 'not_json' };

const CONTROL = /[\u0000-\u001f\u007f]+/g;
const clean = (raw: unknown, max: number): string | null => {
  if (typeof raw === 'number' && Number.isFinite(raw)) raw = String(raw);
  if (typeof raw !== 'string') return null;
  const s = raw.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  if (!s || /^[-–—_.?/\\x*]+$/i.test(s)) return null;
  return s.slice(0, max);
};
const confidenceOf = (raw: unknown): number => (typeof raw === 'number' && Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0);

// A date as Indian registers write it (day first, a four-digit year: 23/04/2015, 23-4-2015, 23.04.2015), or already
// YYYY-MM-DD, as the import's YYYY-MM-DD; null when it is not a real date that way.
export function isoDate(s: string): string | null {
  if (isRealIsoDate(s)) return s;
  const m = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4})$/.exec(s);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isRealIsoDate(iso) ? iso : null;
}

// Gender as written, to the import's own words (Aadhaar's set, C222); null when it is not one of them.
const GENDER_WORDS: Record<string, 'male' | 'female' | 'transgender'> = {
  m: 'male', male: 'male', b: 'male', boy: 'male', 'पुरुष': 'male', 'लड़का': 'male', 'बालक': 'male',
  f: 'female', female: 'female', g: 'female', girl: 'female', 'महिला': 'female', 'स्त्री': 'female', 'लड़की': 'female', 'बालिका': 'female',
  t: 'transgender', transgender: 'transgender', 'ट्रांसजेंडर': 'transgender',
};
export const genderOf = (s: string): 'male' | 'female' | 'transgender' | null => GENDER_WORDS[s.toLowerCase().replace(/[.\s]/g, '')] ?? null;

// An Indian mobile number as ten digits (a leading +91, 91 or 0 dropped); null when it is not one.
export function phoneOf(s: string): string | null {
  let d = s.replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(d)) return null;
  d = d.replace(/^\+/, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

function cellOf(field: RegisterField, raw: unknown): RegisterCell {
  const given = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : { value: raw, confidence: 0 };
  let value = clean(given.value, MAX_LENGTH[field]);
  let confidence = value === null ? 0 : confidenceOf(given.confidence);
  // Never an Aadhaar number, whatever the model copied (the one rule, src/lib/privacy/aadhaar.ts).
  if (value !== null && hasAadhaarNumber(value)) {
    value = null;
    confidence = 0;
  }
  // Put into the import's shape where it can be without guessing; a field that cannot be is kept as read, and marked.
  let fits = true;
  if (value !== null && field === 'dob') {
    const iso = isoDate(value);
    if (iso) value = iso;
    else fits = false;
  }
  if (value !== null && field === 'gender') {
    const g = genderOf(value);
    if (g) value = g;
    else fits = false;
  }
  if (value !== null && field === 'phone') {
    const p = phoneOf(value);
    if (p) value = p;
    else fits = false;
  }
  return { value, confidence, low: value !== null && (confidence < CONFIDENCE_FLOOR || !fits) };
}

// The model's answer as rows: one JSON array (or an object holding one under "rows"), a ```json fence allowed. A row
// with nothing readable is left out; a field outside the schema is dropped. Not JSON at all: a plain error.
export function parseRegister(text: string): RegisterParse {
  const body = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, reason: 'not_json' };
  }
  const list = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown }).rows) ? (parsed as { rows: unknown[] }).rows : null;
  if (!list) return { ok: false, reason: 'not_json' };
  const rows: RegisterRow[] = [];
  for (const item of list) {
    if (rows.length >= MAX_ROWS) break;
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = Object.fromEntries(REGISTER_FIELDS.map((f) => [f, cellOf(f, (item as Record<string, unknown>)[f])])) as RegisterRow;
    if (REGISTER_FIELDS.some((f) => row[f].value !== null)) rows.push(row);
  }
  return { ok: true, rows };
}

// ---- to the import -------------------------------------------------------------------------------------------------

// The import's columns the register fills (src/lib/import/rules.ts IMPORT_COLUMNS, and the optional gender and
// guardian_phone of run-import.ts). The guardian's name and the address are shown for the office to check, but the
// import has no column for them yet, so they are not sent.
export const IMPORT_HEADER = ['name', 'admission_no', 'class_name', 'dob', 'gender', 'guardian_phone'] as const;

// A class as the school names its classes: "5" and "A" → "5-A" (the import matches a class name exactly).
export const classNameOf = (row: Pick<RegisterRow, 'class' | 'section'>): string => [row.class.value, row.section.value].filter(Boolean).join('-');

// The import reads each cell back as written: quoted when it holds a comma, a quote or a line break.
const csvCell = (s: string): string => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

// The office's corrected rows as the import's CSV file. Every row goes, as the office left it: the import's own checks
// say what is still wrong, and nothing is written until every row passes.
export function registerCsv(rows: readonly RegisterRow[]): string {
  const lines = [IMPORT_HEADER.join(',')];
  for (const r of rows) {
    const values = [r.name.value ?? '', r.admission_no.value ?? '', classNameOf(r), r.dob.value ?? '', r.gender.value ?? '', r.phone.value ?? ''];
    lines.push(values.map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

// How many fields the office should look at: under the floor, or not read at all.
export const fieldsToCheck = (rows: readonly RegisterRow[]): number => rows.reduce((n, r) => n + REGISTER_FIELDS.filter((f) => r[f].low).length, 0);
