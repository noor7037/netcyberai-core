import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { assertRowsAffected, NoRowsAffectedError } from '@/lib/db/rows';

const EDITABLE_FIELDS = ['name', 'phone', 'email', 'relation'] as const;

// Correcting a guardian's own details (a mistyped phone number, an
// added email) -- not for re-pointing which student(s) they're linked
// to, that's the guardians sub-route's link/unlink pair.
export async function PATCH(req: NextRequest, { params }: { params: { parentId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];
  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      if ((field === 'name' || field === 'phone') && !String(body[field] ?? '').trim()) {
        return NextResponse.json({ error: `${field} cannot be empty` }, { status: 400 });
      }
      values.push(body[field] === '' ? null : body[field]);
      setClauses.push(`${field} = $${values.length}`);
    }
  }
  if (setClauses.length === 0) {
    return NextResponse.json({ error: `no editable fields provided (${EDITABLE_FIELDS.join(', ')})` }, { status: 400 });
  }

  try {
    const guardian = await withTenantContext(guard.claims, async (client) => {
      const before = await client.query(
        `select parent_id, name, phone, email, relation from parents where school_id = $1 and parent_id = $2`,
        [guard.claims.schoolId, params.parentId]
      );
      if (!before.rows[0]) return null;

      values.push(guard.claims.schoolId, params.parentId);
      const result = await client.query(
        `update parents set ${setClauses.join(', ')}
         where school_id = $${values.length - 1} and parent_id = $${values.length}
         returning parent_id, name, phone, email, relation`,
        values
      );
      assertRowsAffected(result, `guardian ${params.parentId} update matched 0 rows`);
      const row = result.rows[0];
      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'guardian.update',
        targetType: 'parents',
        targetId: row.parent_id,
        beforeState: before.rows[0],
        afterState: row,
      });
      return row;
    });
    if (!guardian) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ guardian });
  } catch (err) {
    if (err instanceof NoRowsAffectedError) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
