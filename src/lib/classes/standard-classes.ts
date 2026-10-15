import { writeAuditLog } from '@/lib/audit/log';
import type { SchoolRole } from '@/lib/contracts/modules';
import type { Sql } from '@/lib/jobs/types';
import { classOrderSql, SCHOOL_GRADES } from './class-order';
import { maySetClassTeacher } from './class-teacher';

// The standard classes of an Indian school (C235-A): LKG, UKG and 1 to 12, each with sections A, B and C, named the
// way the school's classes already are ("LKG-A", "1-A" … "12-C"). 42 classes.
//
// "Add the standard classes" makes every one of them the school does not have yet, for the current academic
// session, in one step. A class the school already has is never touched and never made twice: it counts as there
// when its name, or its grade and section, match one of the 42, whatever its session ("5-A", "5A" and grade 5
// section A are all 5-A). The principal and the school admin only, as for adding one class; one audit row with the
// counts. Two people pressing it at once make each class once (a lock per school while it runs).

export const STANDARD_SECTIONS = ['A', 'B', 'C'] as const;
export const STANDARD_GRADES = SCHOOL_GRADES.filter((g) => g !== 'Nursery');

export type StandardClass = { name: string; grade: string; section: string };
export const STANDARD_CLASSES: readonly StandardClass[] = STANDARD_GRADES.flatMap((grade) => STANDARD_SECTIONS.map((section) => ({ name: `${grade}-${section}`, grade, section })));

// The key two classes share when they are the same class: capitals, letters and digits only.
export const classKey = (text: string | null | undefined): string => (text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Every key a class of the school answers to: its name, and its grade with its section.
export function existingClassKeys(rows: readonly { name: string; grade: string | null; section: string | null }[]): Set<string> {
  const keys = new Set<string>();
  for (const r of rows) {
    keys.add(classKey(r.name));
    if (r.grade?.trim() && r.section?.trim()) keys.add(classKey(`${r.grade}${r.section}`));
  }
  return keys;
}

// The lock that keeps two writers of a school's classes from making the same class twice.
export const lockSchoolClasses = (db: Sql, schoolId: string) => db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`classes:${schoolId}`]);

export const currentSessionId = async (db: Sql, schoolId: string): Promise<string | null> =>
  ((await db.query(`select session_id from academic_sessions where school_id = $1 and is_current`, [schoolId])).rows[0]?.session_id as string | undefined) ?? null;

export type AddedClass = { class_id: string; name: string; grade: string; section: string; session_id: string | null };
export type AddStandardClasses = { ok: true; created: AddedClass[]; alreadyThere: number; sessionId: string | null } | { ok: false; reason: 'not_allowed' };

export async function addStandardClasses(db: Sql, actor: { schoolId: string; userId: string; role: SchoolRole }): Promise<AddStandardClasses> {
  if (!maySetClassTeacher(actor.role)) return { ok: false, reason: 'not_allowed' };
  await lockSchoolClasses(db, actor.schoolId);
  const existing = existingClassKeys((await db.query(`select name, grade, section from classes where school_id = $1`, [actor.schoolId])).rows);
  const missing = STANDARD_CLASSES.filter((c) => !existing.has(classKey(c.name)));
  const sessionId = await currentSessionId(db, actor.schoolId);
  let created: AddedClass[] = [];
  if (missing.length > 0) {
    const params: unknown[] = [actor.schoolId, sessionId];
    const values = missing.map((c) => {
      params.push(c.name, c.grade, c.section);
      return `($1, $${params.length - 2}, $${params.length - 1}, $${params.length}, $2::uuid)`;
    });
    // `returning` keeps no order of its own: the rows are put in the class order here.
    created = (
      await db.query(
        `with added as (insert into classes (school_id, name, grade, section, session_id) values ${values.join(', ')} returning class_id, name, grade, section, session_id)
         select * from added c order by ${classOrderSql('c')}`,
        params
      )
    ).rows as AddedClass[];
  }
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'class.standard_set',
    targetType: 'classes',
    afterState: { created: created.length, already_there: STANDARD_CLASSES.length - missing.length, standard: STANDARD_CLASSES.length, session_id: sessionId },
  });
  return { ok: true, created, alreadyThere: STANDARD_CLASSES.length - missing.length, sessionId };
}
