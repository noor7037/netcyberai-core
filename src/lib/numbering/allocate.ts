import type { Sql } from '@/lib/jobs/types';
import { ADMISSION_START, nextNumbers, ROLL_START, STAFF_START } from './series';

// Giving out the next numbers inside the caller's transaction (C554). A lock for this school and this series is held
// until the transaction ends, so two people adding students at the same moment never get the same number; the database's
// own unique indexes (admission number and staff code per school, roll number per class) are the last word.

async function lock(db: Sql, key: string): Promise<void> {
  await db.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [key]);
}

// `alsoTaken`: numbers not yet saved but already spoken for (the rest of an import file).
export async function nextAdmissionNumbers(db: Sql, schoolId: string, count = 1, alsoTaken: readonly string[] = []): Promise<string[]> {
  await lock(db, `admission|${schoolId}`);
  const { rows } = await db.query(`select admission_no as v from students where school_id = $1 and admission_no is not null`, [schoolId]);
  return nextNumbers([...rows.map((r: { v: string }) => r.v), ...alsoTaken], count, ADMISSION_START);
}

export async function nextRollNumbers(db: Sql, schoolId: string, classId: string, count = 1, alsoTaken: readonly string[] = []): Promise<string[]> {
  await lock(db, `roll|${schoolId}|${classId}`);
  const { rows } = await db.query(
    `select roll_no as v from students where school_id = $1 and class_id = $2 and roll_no is not null and status in ('active', 'pending_consent')`,
    [schoolId, classId]
  );
  return nextNumbers([...rows.map((r: { v: string }) => r.v), ...alsoTaken], count, ROLL_START);
}

export async function nextStaffCodes(db: Sql, schoolId: string, count = 1): Promise<string[]> {
  await lock(db, `staff|${schoolId}`);
  const { rows } = await db.query(`select staff_code as v from staff_profiles where school_id = $1 and staff_code is not null`, [schoolId]);
  return nextNumbers(rows.map((r: { v: string }) => r.v), count, STAFF_START);
}

type Numbered = { admissionNo: string | null; classId: string | null; rollNo: string | null };

// The blanks of a whole import, in file order (C554): each student without an admission number gets the school's next,
// each student in a class without a roll number gets that class's next. Numbers the file gives itself are kept and
// never given again.
export async function fillBlankNumbers<T extends Numbered>(db: Sql, schoolId: string, rows: T[]): Promise<void> {
  const noAdmission = rows.filter((r) => !r.admissionNo);
  if (noAdmission.length) {
    const given = await nextAdmissionNumbers(db, schoolId, noAdmission.length, rows.map((r) => r.admissionNo).filter((v): v is string => !!v));
    noAdmission.forEach((r, i) => (r.admissionNo = given[i]));
  }
  const byClass = new Map<string, T[]>();
  for (const r of rows) if (r.classId) byClass.set(r.classId, [...(byClass.get(r.classId) ?? []), r]);
  for (const [classId, inClass] of [...byClass].sort(([a], [b]) => a.localeCompare(b))) {
    const noRoll = inClass.filter((r) => !r.rollNo);
    if (!noRoll.length) continue;
    const given = await nextRollNumbers(db, schoolId, classId, noRoll.length, inClass.map((r) => r.rollNo).filter((v): v is string => !!v));
    noRoll.forEach((r, i) => (r.rollNo = given[i]));
  }
}
