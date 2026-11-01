import type { Sql } from '@/lib/jobs/types';

// A roll number belongs to one live student (active or waiting for consent) in a class (W14-H); a roll held by a
// student who has left or been transferred can be given again. Compared with spaces at the ends and letter case ignored,
// so "7 " and "7" are the same roll. The database's students_class_roll_unique index is the backstop.
export const ROLL_UNIQUE_INDEX = 'students_class_roll_unique';

export const rollKey = (roll: string) => roll.trim().toLowerCase();

// "roll 7 is already Aarav Example in 6-A": the clash, named, for a row of an import or for the Add / Edit routes.
export const rollClashText = (roll: string, name: string, className: string) => `roll ${roll.trim()} is already ${name} in ${className}`;
export const rollClashFileText = (roll: string, firstRow: number, className: string) => `roll ${roll.trim()} is also on row ${firstRow} of this file, for ${className}`;

// The student who already holds this roll in this class, if any (not `exceptStudentId`, who is being edited).
export async function findRollClash(client: Sql, schoolId: string, classId: string | null, rollNo: string | null, exceptStudentId?: string): Promise<string | null> {
  if (!classId || !rollNo || !rollNo.trim()) return null;
  const { rows } = await client.query(
    `select s.name, c.name as class_name
       from students s
       join classes c on c.school_id = s.school_id and c.class_id = s.class_id
      where s.school_id = $1 and s.class_id = $2 and lower(btrim(s.roll_no)) = $3
        and s.status in ('active', 'pending_consent')
        and ($4::uuid is null or s.student_id <> $4::uuid)
      order by s.created_at limit 1`,
    [schoolId, classId, rollKey(rollNo), exceptStudentId ?? null]
  );
  return rows[0] ? rollClashText(rollNo, rows[0].name, rows[0].class_name) : null;
}

export function isRollClashViolation(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string; message?: string } | null;
  return e?.code === '23505' && (e.constraint === ROLL_UNIQUE_INDEX || (e.message ?? '').includes(ROLL_UNIQUE_INDEX));
}

export const ROLL_RACE_TEXT = 'That roll number was just taken by another student in this class. Choose another roll number.';
