import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { SchoolRole } from '@/lib/contracts/modules';

// The class teacher of a class (C210). The Classes list (Students, "Manage classes") sets and clears it for a
// class that already exists; before, only a class being made could be given one.
//
//   - WHO: the principal and the school admin, as for adding a class. The database holds the same two roles
//     (the classes_changed_by_office policy), so nobody else changes a class whatever they send.
//   - WHOM: an active teacher of this school, the same people the timetable offers (users of the school with the
//     role teacher whose account is switched on). The database holds it too (classes_class_teacher_rules).
//     "None" is allowed: a class may have no class teacher, and the School Health Auditor counts it.
//   - Every change is audited, with who it was before and after. Choosing the one already there changes nothing
//     and writes nothing.

type Sql = Pick<PoolClient, 'query'>;

export const CLASS_TEACHER_SETTERS: readonly SchoolRole[] = ['principal', 'school_admin'];
export const maySetClassTeacher = (role: string): boolean => (CLASS_TEACHER_SETTERS as readonly string[]).includes(role);

export type TeacherOption = { user_id: string; name: string };

// The teachers a class teacher may be chosen from, by name.
export async function classTeacherOptions(db: Sql, schoolId: string): Promise<TeacherOption[]> {
  const { rows } = await db.query(
    `select user_id, display_name as name from users where school_id = $1 and role = 'teacher' and is_active order by display_name, user_id`,
    [schoolId]
  );
  return rows as TeacherOption[];
}

export type ClassTeacherRow = { class_id: string; name: string; class_teacher_id: string | null; class_teacher_name: string | null };
export type SetClassTeacher = { ok: true; changed: boolean; class: ClassTeacherRow } | { ok: false; reason: 'not_allowed' | 'not_found' | 'not_a_teacher' };

export async function setClassTeacher(
  db: Sql,
  actor: { schoolId: string; userId: string; role: SchoolRole },
  classId: string,
  teacherId: string | null
): Promise<SetClassTeacher> {
  if (!maySetClassTeacher(actor.role)) return { ok: false, reason: 'not_allowed' };
  const before = (await db.query(`select class_id, name, class_teacher_id from classes where school_id = $1 and class_id = $2 for update`, [actor.schoolId, classId])).rows[0] as
    | { class_id: string; name: string; class_teacher_id: string | null }
    | undefined;
  if (!before) return { ok: false, reason: 'not_found' };
  if (teacherId !== null) {
    const teacher = await db.query(`select 1 from users where school_id = $1 and user_id = $2 and role = 'teacher' and is_active`, [actor.schoolId, teacherId]);
    if (teacher.rowCount === 0) return { ok: false, reason: 'not_a_teacher' };
  }
  const changed = before.class_teacher_id !== teacherId;
  if (changed) {
    await db.query(`update classes set class_teacher_id = $3 where school_id = $1 and class_id = $2`, [actor.schoolId, classId, teacherId]);
    await writeAuditLog(db, {
      schoolId: actor.schoolId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      eventAction: 'class.class_teacher',
      targetType: 'classes',
      targetId: classId,
      beforeState: { class_teacher_id: before.class_teacher_id },
      afterState: { class_teacher_id: teacherId },
    });
  }
  const after = (await db.query(
    `select c.class_id, c.name, c.class_teacher_id, u.display_name as class_teacher_name
       from classes c left join users u on u.school_id = c.school_id and u.user_id = c.class_teacher_id
      where c.school_id = $1 and c.class_id = $2`,
    [actor.schoolId, classId]
  )).rows[0] as ClassTeacherRow;
  return { ok: true, changed, class: after };
}
