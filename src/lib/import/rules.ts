// The student-import row rules, shared by the real importer
// (run-import.ts, server) and the public Student Import Checker
// (/free-tools/student-import-checker, browser). One definition, so the
// free checker can never pass a file the real import would reject for
// these reasons. Pure functions only: no database, no Node APIs.

export const IMPORT_COLUMNS = [
  { key: 'name', required: true, hint: 'Full name of the student' },
  { key: 'admission_no', required: false, hint: 'Your school’s admission number' },
  { key: 'class_name', required: false, hint: 'Must match a class name set up in NetCyberAI, e.g. 5A' },
  { key: 'roll_no', required: false, hint: 'Roll number within the class' },
  { key: 'dob', required: false, hint: 'Date of birth as YYYY-MM-DD, e.g. 2015-04-23' },
] as const;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// A YYYY-MM-DD string that is also a real calendar date (no 2015-02-30).
export function isRealIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Row errors that need no school context. The class-exists check needs
// the school's classes and stays in run-import.ts.
export function basicRowErrors(rec: Record<string, string | undefined>): string[] {
  const errors: string[] = [];
  const name = rec.name?.trim() ?? '';
  const dob = rec.dob?.trim() || null;
  if (!name) errors.push('name is required');
  if (dob && !DATE_RE.test(dob)) errors.push('dob must be in YYYY-MM-DD format');
  else if (dob && !isRealIsoDate(dob)) errors.push('dob is not a real calendar date');
  return errors;
}
