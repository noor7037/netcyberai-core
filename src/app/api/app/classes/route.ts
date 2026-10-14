import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { isForeignKeyViolation } from '@/lib/db/pg-errors';
import { classTeacherOptions, maySetClassTeacher } from '@/lib/classes/class-teacher';
import { deriveGradeSection } from '@/lib/classes/grade-section';
import { validationError } from '@/lib/errors/catalogue';
import { isUuid } from '@/lib/frameworks/custom-fields';

export async function GET(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  try {
    // For the principal and the school admin, also the teachers a class teacher may be chosen from (C210).
    const mayChangeClassTeacher = maySetClassTeacher(guard.claims.role);
    const { classes, teachers } = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `select c.class_id, c.name, c.grade, c.section, c.session_id, c.class_teacher_id,
                u.display_name as class_teacher_name,
                coalesce(u.role = 'teacher' and u.is_active, false) as class_teacher_active,
                (select count(*) from students s where s.school_id = c.school_id and s.class_id = c.class_id) as student_count
         from classes c
         left join users u on u.school_id = c.school_id and u.user_id = c.class_teacher_id
         where c.school_id = $1
         order by c.name asc`,
        [guard.claims.schoolId]
      );
      return { classes: rows, teachers: mayChangeClassTeacher ? await classTeacherOptions(client, guard.claims.schoolId) : [] };
    });
    return NextResponse.json({ classes, teachers, mayChangeClassTeacher });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const classTeacherId = typeof body?.classTeacherId === 'string' ? body.classTeacherId : null;
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : null;
  if (!name) {
    return NextResponse.json(validationError('required', { field: 'class_name' }), { status: 400 });
  }

  // grade/section are optional, explicit fields (added alongside academic_sessions,
  // Decision Log C68) -- callers that don't yet send them get a best-effort derived
  // split of `name` (deriveGradeSection, unit-tested). This keeps existing callers
  // working unchanged while letting new callers pass grade/section directly.
  const derived = deriveGradeSection(name);
  const grade = typeof body?.grade === 'string' && body.grade.trim() ? body.grade.trim() : derived.grade;
  const section = typeof body?.section === 'string' && body.section.trim() ? body.section.trim() : derived.section;

  if (classTeacherId !== null && !isUuid(classTeacherId)) {
    return NextResponse.json(validationError('not_sent_properly'), { status: 400 });
  }

  try {
    const created = await withTenantContext(guard.claims, async (client) => {
      // A class teacher given with a new class is an active teacher of this school, as when one is chosen later
      // on the Classes list (C210).
      if (classTeacherId !== null) {
        const teacher = await client.query(`select 1 from users where school_id = $1 and user_id = $2 and role = 'teacher' and is_active`, [guard.claims.schoolId, classTeacherId]);
        if (teacher.rowCount === 0) return null;
      }
      const { rows } = await client.query(
        `insert into classes (school_id, name, grade, section, session_id, class_teacher_id)
         values ($1, $2, $3, $4, $5, $6)
         returning class_id, name, grade, section, session_id, class_teacher_id`,
        [guard.claims.schoolId, name, grade, section, sessionId, classTeacherId]
      );
      const row = rows[0];
      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'class.create',
        targetType: 'classes',
        targetId: row.class_id,
        afterState: row,
      });
      return row;
    });
    if (!created) return NextResponse.json({ error: 'only an active teacher of this school can be a class teacher', code: 'not_a_teacher' }, { status: 400 });
    return NextResponse.json({ class: created }, { status: 201 });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return NextResponse.json(
        { error: 'classTeacherId or sessionId does not belong to this school' },
        { status: 400 }
      );
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
