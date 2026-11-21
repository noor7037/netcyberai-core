// The student-import row rules, shared by the real importer
// (run-import.ts, server) and the public Student Import Checker
// (/free-tools/student-import-checker, browser). One definition, so the
// free checker can never pass a file the real import would reject for
// these reasons. Pure functions only: no database, no Node APIs.

import { checkPhone } from '@/lib/errors/catalogue';

export const IMPORT_COLUMNS = [
  { key: 'name', required: true, hint: 'Full name of the student' },
  { key: 'admission_no', required: false, hint: 'Your school’s admission number' },
  { key: 'class_name', required: false, hint: 'Must match a class name set up in NetCyberAI exactly, e.g. 5-A' },
  { key: 'roll_no', required: false, hint: 'Roll number within the class' },
  { key: 'dob', required: false, hint: 'Date of birth as YYYY-MM-DD, e.g. 2015-04-23' },
  { key: 'guardian_name', required: false, hint: 'Parent or guardian’s full name: with a phone, the import adds this guardian and links them to the student' },
  { key: 'guardian_relation', required: false, hint: 'mother, father, guardian or other' },
  { key: 'guardian_phone', required: false, hint: 'Guardian’s 10-digit Indian mobile number, needed with any guardian column; brothers and sisters with the same number share one guardian' },
  { key: 'guardian_email', required: false, hint: 'Guardian’s email address (optional)' },
] as const;

// A guardian's relation as the import takes it (any case).
export const GUARDIAN_RELATIONS = ['mother', 'father', 'guardian', 'other'] as const;
export type GuardianRelation = (typeof GUARDIAN_RELATIONS)[number];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// The guardian a row names, read and checked. `guardian`: the row creates (or shares) a guardian, which needs a
// name and a valid phone. A row with only guardian_phone and/or guardian_email (no name, no relation) names no
// guardian: those columns only suggest siblings already on record, as before (C116). Consent is never part of
// this: a guardian the import adds is unverified, consent pending, as when the office adds one by hand.
export type RowGuardian = { name: string; relation: GuardianRelation | null; phone: string; email: string | null };
export function readRowGuardian(rec: Record<string, string | undefined>): { errors: string[]; guardian: RowGuardian | null } {
  const errors: string[] = [];
  const name = (rec.guardian_name ?? '').trim().replace(/\s+/g, ' ');
  const relationRaw = (rec.guardian_relation ?? '').trim().toLowerCase();
  const phoneRaw = (rec.guardian_phone ?? '').trim();
  const emailRaw = (rec.guardian_email ?? '').trim();
  let phone: string | null = null;
  if (phoneRaw) {
    const checked = checkPhone(phoneRaw);
    if (checked.ok && /^\d{10}$/.test(checked.digits)) phone = checked.digits;
    else errors.push('guardian_phone must be a 10-digit Indian mobile number starting 6, 7, 8 or 9');
  }
  const relation = relationRaw ? ((GUARDIAN_RELATIONS as readonly string[]).includes(relationRaw) ? (relationRaw as GuardianRelation) : null) : null;
  if (relationRaw && !relation) errors.push('guardian_relation must be mother, father, guardian or other');
  if (name.length > 200) errors.push('guardian_name is longer than 200 characters');
  const namesGuardian = Boolean(name || relationRaw);
  if (namesGuardian && !phoneRaw) errors.push('a guardian needs a guardian_phone');
  if (relationRaw && !name) errors.push('a guardian needs a guardian_name');
  // Checked only for a guardian the row adds: an email alone stays a sibling hint, as before.
  if (namesGuardian && emailRaw && !EMAIL_RE.test(emailRaw)) errors.push('guardian_email is not an email address');
  const guardian = namesGuardian && name && phone && errors.length === 0 ? { name, relation, phone, email: emailRaw ? emailRaw.toLowerCase() : null } : null;
  return { errors: [...new Set(errors)], guardian };
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// A YYYY-MM-DD string that is also a real calendar date (no 2015-02-30).
export function isRealIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Row errors that need no school context. The class-exists check needs
// the school's classes and stays in run-import.ts. `today` (YYYY-MM-DD,
// India's date): a date of birth after it is out of range (C235-A), as the
// Add student form already refuses.
export function basicRowErrors(rec: Record<string, string | undefined>, today?: string): string[] {
  const errors: string[] = [];
  const name = rec.name?.trim() ?? '';
  const dob = rec.dob?.trim() || null;
  if (!name) errors.push('name is required');
  if (dob && !DATE_RE.test(dob)) errors.push('dob must be in YYYY-MM-DD format');
  else if (dob && !isRealIsoDate(dob)) errors.push('dob is not a real calendar date');
  else if (dob && today && dob > today) errors.push('dob is after today');
  errors.push(...readRowGuardian(rec).errors);
  return errors;
}
