import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { assertRowsAffected, NoRowsAffectedError } from '@/lib/db/rows';
import { isForeignKeyViolation, isUniqueViolation } from '@/lib/db/pg-errors';

export async function GET(req: NextRequest, { params }: { params: { studentId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  try {
    const guardians = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `select p.parent_id, p.name, p.phone, p.email, p.relation
         from parent_student_map psm
         join parents p on p.school_id = psm.school_id and p.parent_id = psm.parent_id
         where psm.school_id = $1 and psm.student_id = $2
         order by p.name asc`,
        [guard.claims.schoolId, params.studentId]
      );
      return rows;
    });
    return NextResponse.json({ guardians });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

// Two explicit modes, never inferred: link an EXISTING parent by
// parentId (the caller found them, e.g. a sibling's guardian already on
// record), or create-and-link a NEW one from name/phone/relation. No
// phone-based auto-matching here -- same "explicit data only, no fuzzy
// matching" discipline Task 2's CSV import is held to (05_BUSINESS_
// LOGIC.md §3.3: sibling concessions derive only from explicit
// parent_student_map links, never surname/phone matching).
export async function POST(req: NextRequest, { params }: { params: { studentId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const existingParentId = typeof body?.parentId === 'string' ? body.parentId : null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim() || null : null;
  const relation = typeof body?.relation === 'string' ? body.relation.trim() || null : null;

  if (!existingParentId && (!name || !phone)) {
    return NextResponse.json(
      { error: 'provide parentId to link an existing guardian, or name + phone to create a new one' },
      { status: 400 }
    );
  }

  try {
    const guardian = await withTenantContext(guard.claims, async (client) => {
      const studentCheck = await client.query(
        `select 1 from students where school_id = $1 and student_id = $2`,
        [guard.claims.schoolId, params.studentId]
      );
      if (!studentCheck.rows[0]) return null;

      let parentId = existingParentId;
      if (!parentId) {
        const { rows } = await client.query(
          `insert into parents (school_id, name, phone, email, relation)
           values ($1, $2, $3, $4, $5)
           returning parent_id`,
          [guard.claims.schoolId, name, phone, email, relation]
        );
        parentId = rows[0].parent_id;
      }

      await client.query(
        `insert into parent_student_map (school_id, parent_id, student_id) values ($1, $2, $3)`,
        [guard.claims.schoolId, parentId, params.studentId]
      );

      const { rows: parentRows } = await client.query(
        `select parent_id, name, phone, email, relation from parents where school_id = $1 and parent_id = $2`,
        [guard.claims.schoolId, parentId]
      );

      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'guardian.link',
        targetType: 'parent_student_map',
        targetId: `${parentId}:${params.studentId}`,
        afterState: { parentId, studentId: params.studentId },
      });
      return parentRows[0];
    });
    if (!guardian) return NextResponse.json({ error: 'student not found' }, { status: 404 });
    return NextResponse.json({ guardian }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: 'this guardian is already linked to this student' }, { status: 409 });
    }
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: 'parentId does not belong to this school' }, { status: 400 });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { studentId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parentId = req.nextUrl.searchParams.get('parentId');
  if (!parentId) {
    return NextResponse.json({ error: 'parentId query param is required' }, { status: 400 });
  }

  try {
    await withTenantContext(guard.claims, async (client) => {
      const result = await client.query(
        `delete from parent_student_map where school_id = $1 and parent_id = $2 and student_id = $3`,
        [guard.claims.schoolId, parentId, params.studentId]
      );
      assertRowsAffected(result, `guardian link ${parentId}:${params.studentId} delete matched 0 rows`);
      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'guardian.unlink',
        targetType: 'parent_student_map',
        targetId: `${parentId}:${params.studentId}`,
      });
    });
    return NextResponse.json({ status: 'unlinked' });
  } catch (err) {
    if (err instanceof NoRowsAffectedError) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
