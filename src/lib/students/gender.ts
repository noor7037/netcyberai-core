import { PRINTED_GENDERS, RECORD_GENDERS, type PrintedGender, type RecordGender } from './data-check-rules';

// A child's gender on the school record (C222, C224): Aadhaar's own set (male, female, transgender) or "not given".
// Only the office records it: the principal and the school admin, as the database's students_gender_office_only
// says. A teacher's form does not offer it and the app refuses it before the database would.

export const GENDER_OFFICE: readonly string[] = ['principal', 'school_admin'];
export const mayRecordGender = (role: string) => GENDER_OFFICE.includes(role);

export type GenderRead = { ok: true; value: RecordGender | null } | { ok: false; reason: 'gender' | 'not_allowed' };

// From a form: null when nothing was sent (the record keeps what it has); one of the four, for the office only.
export function readGender(raw: unknown, role: string): GenderRead {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string' || !(RECORD_GENDERS as readonly string[]).includes(raw)) return { ok: false, reason: 'gender' };
  if (!mayRecordGender(role)) return { ok: false, reason: 'not_allowed' };
  return { ok: true, value: raw as RecordGender };
}

// From a CSV column: Aadhaar's three values as Aadhaar prints them (any case), or empty for "not given".
export function readImportGender(raw: string | undefined): { ok: true; value: RecordGender } | { ok: false } {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) return { ok: true, value: 'not_given' };
  return (PRINTED_GENDERS as readonly string[]).includes(v) ? { ok: true, value: v as PrintedGender } : { ok: false };
}
