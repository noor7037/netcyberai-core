import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteSyllabus } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { isForeignKeyViolation, isRlsViolation } from '@/lib/db/pg-errors';
import { isRealIsoDate } from '@/lib/import/rules';
import { isUuid, parseSyllabusInput, todayInIndia } from '@/lib/academics/syllabus';
import { MAX_NOTE, coverage, recordTaught, taughtTapCoverage, unitsFor } from '@/lib/academics/taught';

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
    const { entries, assignments, units, tapCoverage } = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `select p.progress_id, p.date, p.topic, p.status, p.unit_id, p.note, p.class_id, c.name as class_name,
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
      // The syllabus map of those pairs, and (for the office) this week's
      // "taught" tap coverage against the timetable (C147).
      const units = await unitsFor(client, guard.claims.schoolId, pairs);
      const office = guard.claims.role !== 'teacher';
      const weekAgo = new Date(Date.parse(`${date}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
      return { entries: rows, assignments: pairs, units, tapCoverage: office ? await taughtTapCoverage(client, guard.claims.schoolId, weekAgo, date) : [] };
    });
    const byPair: Record<string, ReturnType<typeof coverage>> = {};
    for (const p of assignments) byPair[`${p.class_id}:${p.subject_id}`] = coverage(units.filter((u) => u.class_id === p.class_id && u.subject_id === p.subject_id));
    return NextResponse.json({ date, entries, assignments, units, coverage: byPair, tapCoverage });
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
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = parseSyllabusInput(body, todayInIndia());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  // The unit of the syllabus map this lesson covered, and the lesson note (C147).
  if (body?.unitId != null && !isUuid(body.unitId)) return NextResponse.json({ error: 'unitId must be a valid id' }, { status: 400 });
  const note = typeof body?.note === 'string' ? body.note.trim().replace(/\s+/g, ' ') : '';
  if (note.length > MAX_NOTE) return NextResponse.json({ error: `the note must be ${MAX_NOTE} characters or fewer` }, { status: 400 });
  const input = { ...parsed.value, unitId: (body?.unitId as string | undefined) ?? null, note: note || null };
  const isTeacher = guard.claims.role === 'teacher';
  if (!isTeacher && !input.teacherId) {
    return NextResponse.json({ error: 'teacherId is required when recording a lesson for another teacher' }, { status: 400 });
  }

  try {
    const outcome = await withTenantContext(guard.claims, (client) => recordTaught(client, { schoolId: guard.claims.schoolId, userId: guard.claims.sub, role: guard.claims.role }, input));
    if (outcome.kind === 'no_teacher_profile') {
      return NextResponse.json({ error: 'Your account has no teacher profile at this school yet. Ask your school admin.', code: 'no_teacher_profile' }, { status: 403 });
    }
    if (outcome.kind === 'unknown_unit') return NextResponse.json({ error: 'That topic is not on this class’s syllabus map.', code: 'unknown_unit' }, { status: 400 });
    return NextResponse.json({ entry: outcome.entry }, { status: outcome.created ? 201 : 200 });
  } catch (err) {
    if (isRlsViolation(err)) {
      return NextResponse.json({ error: 'You are not assigned to teach this subject to this class.', code: 'not_assigned' }, { status: 403 });
    }
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: 'classId, subjectId or teacherId does not belong to this school' }, { status: 400 });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
