import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteSyllabus } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { isForeignKeyViolation, isRlsViolation } from '@/lib/db/pg-errors';
import { isRealIsoDate } from '@/lib/import/rules';
import { isUuid, parseSyllabusInput, todayInIndia } from '@/lib/academics/syllabus';

// "Taught today": the one thing a teacher records for the Daily Learning
// Pulse. One record per class + subject + day (unique index); recording
// it again updates the same record. RLS (teacher_scope_syllabus_progress)
// limits a teacher to their own assigned class+subject pairs, for both
// reading and writing; this route never re-implements that rule.

export async function GET(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  const url = new URL(req.url);
  const date = url.searchParams.get('date') || todayInIndia();
  const classId = url.searchParams.get('classId');
  if (!isRealIsoDate(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  if (classId !== null && !isUuid(classId)) return NextResponse.json({ error: 'classId must be a valid id' }, { status: 400 });

  try {
    const { entries, assignments } = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `select p.progress_id, p.date, p.topic, p.status, p.class_id, c.name as class_name,
                p.subject_id, s.name as subject_name, p.teacher_id, t.name as teacher_name, p.created_at
         from syllabus_progress p
         join classes c on c.school_id = p.school_id and c.class_id = p.class_id
         join subjects s on s.school_id = p.school_id and s.subject_id = p.subject_id
         join teachers t on t.school_id = p.school_id and t.teacher_id = p.teacher_id
         where p.school_id = $1 and p.date = $2 and ($3::uuid is null or p.class_id = $3::uuid)
         order by c.name, s.name`,
        [guard.claims.schoolId, date, classId]
      );
      // What the caller can record: a teacher's own class+subject pairs,
      // every pair for office and academic roles.
      const { rows: pairs } = await client.query(
        `select ts.class_id, c.name as class_name, ts.subject_id, s.name as subject_name, t.teacher_id, t.name as teacher_name
         from teacher_subjects ts
         join teachers t on t.school_id = ts.school_id and t.teacher_id = ts.teacher_id
         join classes c on c.school_id = ts.school_id and c.class_id = ts.class_id
         join subjects s on s.school_id = ts.school_id and s.subject_id = ts.subject_id
         where ts.school_id = $1 and ($2::text <> 'teacher' or t.user_id = $3::uuid)
         order by c.name, s.name, t.name`,
        [guard.claims.schoolId, guard.claims.role, guard.claims.sub]
      );
      return { entries: rows, assignments: pairs };
    });
    return NextResponse.json({ date, entries, assignments });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

export async function PUT(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteSyllabus(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const parsed = parseSyllabusInput(await req.json().catch(() => null), todayInIndia());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;
  const isTeacher = guard.claims.role === 'teacher';
  if (!isTeacher && !input.teacherId) {
    return NextResponse.json({ error: 'teacherId is required when recording a lesson for another teacher' }, { status: 400 });
  }

  try {
    const outcome = await withTenantContext(guard.claims, async (client) => {
      // A teacher always records as themselves; the id is never taken
      // from the request body for this role.
      let teacherId = input.teacherId;
      if (isTeacher) {
        const { rows } = await client.query(`select teacher_id from teachers where school_id = $1 and user_id = $2`, [
          guard.claims.schoolId,
          guard.claims.sub,
        ]);
        if (!rows[0]) return { kind: 'no_teacher_profile' as const };
        teacherId = rows[0].teacher_id;
      }

      const { rows: before } = await client.query(
        `select progress_id, topic, status, teacher_id from syllabus_progress
         where school_id = $1 and class_id = $2 and subject_id = $3 and date = $4`,
        [guard.claims.schoolId, input.classId, input.subjectId, input.date]
      );
      const { rows } = await client.query(
        `insert into syllabus_progress (school_id, teacher_id, class_id, subject_id, topic, status, date)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (school_id, class_id, subject_id, date)
         do update set topic = excluded.topic, status = excluded.status, teacher_id = excluded.teacher_id
         returning progress_id, date, topic, status, class_id, subject_id, teacher_id`,
        [guard.claims.schoolId, teacherId, input.classId, input.subjectId, input.topic, input.status, input.date]
      );
      if (!rows[0]) throw new Error('syllabus upsert affected no rows');
      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: before[0] ? 'syllabus.update' : 'syllabus.record',
        targetType: 'syllabus_progress',
        targetId: rows[0].progress_id,
        beforeState: before[0] ?? undefined,
        afterState: rows[0],
      });
      return { kind: 'ok' as const, entry: rows[0], created: !before[0] };
    });

    if (outcome.kind === 'no_teacher_profile') {
      return NextResponse.json({ error: 'Your account has no teacher profile at this school yet. Ask your school admin.' }, { status: 403 });
    }
    return NextResponse.json({ entry: outcome.entry }, { status: outcome.created ? 201 : 200 });
  } catch (err) {
    if (isRlsViolation(err)) {
      return NextResponse.json({ error: 'You are not assigned to teach this subject to this class.' }, { status: 403 });
    }
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: 'classId, subjectId or teacherId does not belong to this school' }, { status: 400 });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
