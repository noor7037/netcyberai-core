import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';

const RETENTION_CATEGORIES = [
  'financial',
  'academic_record',
  'attendance',
  'communication_log',
  'audit_trail',
  'capture_document',
  'pulse_message',
  'consent_record',
] as const;

// Task 4: per-category retention configuration. Read-only surface plus
// a per-category update -- no purge job exists yet (nothing calls this
// config to actually enforce it), same as the consent gate this
// prompt also builds without wiring a caller.
export async function GET(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  try {
    const policies = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `select policy_id, category, retention_years, notes, updated_at
         from retention_policy where school_id = $1 order by category`,
        [guard.claims.schoolId]
      );
      return rows;
    });
    return NextResponse.json({ policies });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const category = body?.category;
  if (!(RETENTION_CATEGORIES as readonly string[]).includes(category)) {
    return NextResponse.json({ error: `category must be one of ${RETENTION_CATEGORIES.join(', ')}` }, { status: 400 });
  }
  const retentionYears = body?.retentionYears === null ? null : Number(body?.retentionYears);
  if (retentionYears !== null && (!Number.isFinite(retentionYears) || retentionYears <= 0)) {
    return NextResponse.json({ error: 'retentionYears must be a positive number, or null for indefinite retention' }, { status: 400 });
  }
  const notes = typeof body?.notes === 'string' ? body.notes.slice(0, 1000) : null;

  try {
    const row = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `update retention_policy set retention_years = $3, notes = coalesce($4, notes), updated_by = $5, updated_at = now()
         where school_id = $1 and category = $2
         returning policy_id, category, retention_years, notes, updated_at`,
        [guard.claims.schoolId, category, retentionYears, notes, guard.claims.sub]
      );
      if (rows[0]) {
        await writeAuditLog(client, {
          schoolId: guard.claims.schoolId,
          actorUserId: guard.claims.sub,
          actorRole: guard.claims.role,
          eventAction: 'retention_policy.updated',
          targetType: 'retention_policy',
          targetId: rows[0].policy_id,
          afterState: { category, retentionYears },
        });
      }
      return rows[0] ?? null;
    });
    if (!row) return NextResponse.json({ error: 'not found -- this school has no policy row for that category yet' }, { status: 404 });
    return NextResponse.json(row);
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
