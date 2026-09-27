import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { isForeignKeyViolation, isUniqueViolation } from '@/lib/db/pg-errors';
import { isUuid } from '@/lib/academics/syllabus';

// Who teaches which subject to which class (teacher_subjects). This table
// is what the teacher_scope_* RLS policies read, so it decides what each
// teacher can mark: an office-only write, audited both ways.

function parseAssignment(body: unknown): { teacherId: string; subjectId: string; classId: string } | null {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (!isUuid(b.teacherId) || !isUuid(b.subjectId) || !isUuid(b.classId)) return null;
  return { teacherId: b.teacherId, subjectId: b.subjectId, classId: b.classId };
}

export async function POST(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const a = parseAssignment(await req.json().catch(() => null));
  if (!a) return NextResponse.json({ error: 'teacherId, subjectId and classId are required' }, { status: 400 });

  try {
    await withTenantContext(guard.claims, async (client) => {
      const { rowCount } = await client.query(
        `insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ($1, $2, $3, $4)`,
        [guard.claims.schoolId, a.teacherId, a.subjectId, a.classId]
      );
      if (rowCount !== 1) throw new Error('assignment insert affected no rows');
      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'teacher_subject.assign',
        targetType: 'teacher_subjects',
        targetId: a.teacherId,
        afterState: a,
      });
    });
    return NextResponse.json({ assignment: a }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) return NextResponse.json({ error: 'This teacher already teaches that subject to that class.' }, { status: 409 });
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: 'teacherId, subjectId or classId does not belong to this school' }, { status: 400 });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const a = parseAssignment(await req.json().catch(() => null));
  if (!a) return NextResponse.json({ error: 'teacherId, subjectId and classId are required' }, { status: 400 });

  try {
    const removed = await withTenantContext(guard.claims, async (client) => {
      const { rowCount } = await client.query(
        `delete from teacher_subjects where school_id = $1 and teacher_id = $2 and subject_id = $3 and class_id = $4`,
        [guard.claims.schoolId, a.teacherId, a.subjectId, a.classId]
      );
      // Zero rows is a real outcome (nothing to remove), reported as 404,
      // never as success (Pre-F Stage 2e rule).
      if (rowCount === 0) return false;
      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'teacher_subject.unassign',
        targetType: 'teacher_subjects',
        targetId: a.teacherId,
        beforeState: a,
      });
      return true;
    });
    if (!removed) return NextResponse.json({ error: 'No such assignment at this school.' }, { status: 404 });
    return NextResponse.json({ removed: a });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
