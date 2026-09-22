import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { computeForm6Advisory, muteForm6Advisory, unmuteForm6Advisory } from '@/lib/compliance/form6';

// Task 5: advisory only, never blocking. Renders only for
// jurisdiction = 'IN-HR' -- the route itself computes and returns
// jurisdictionApplies so the UI can honor that gate; a non-Haryana
// school gets a real, correct "does not apply" rather than the advisory
// silently showing anyway.
export async function GET(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  try {
    const advisory = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(`select jurisdiction from schools where school_id = $1`, [guard.claims.schoolId]);
      const jurisdiction = rows[0]?.jurisdiction ?? '';
      return computeForm6Advisory(client, guard.claims.schoolId, jurisdiction);
    });
    return NextResponse.json(advisory);
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

// POST: mute/unmute. Always audited -- actor, timestamp, and the field
// that changed only, never raw PII (Decision Log C41's rule). The UI
// label this backs is neutral ("Hide fee advisory notices"), per
// Business Logic §3's own instruction that a silent mute is a silent
// failure and is banned.
export async function POST(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const muted = body?.muted;
  if (typeof muted !== 'boolean') {
    return NextResponse.json({ error: 'muted (boolean) is required' }, { status: 400 });
  }

  try {
    await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(`select jurisdiction from schools where school_id = $1`, [guard.claims.schoolId]);
      const jurisdiction = rows[0]?.jurisdiction ?? '';
      if (muted) {
        await muteForm6Advisory(client, guard.claims.schoolId, jurisdiction, guard.claims.sub);
      } else {
        await unmuteForm6Advisory(client, guard.claims.schoolId, jurisdiction, guard.claims.sub);
      }
      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'form6_advisory.mute_toggled',
        targetType: 'compliance_config',
        targetId: guard.claims.schoolId,
        afterState: { advisoryMuted: muted },
      });
    });
    return NextResponse.json({ advisoryMuted: muted });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
