import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';

export async function GET(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;

  try {
    const enabledFeatures = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(`select enabled_features from system_config where school_id = $1`, [
        params.schoolId,
      ]);
      return rows[0]?.enabled_features ?? {};
    });
    return NextResponse.json({ enabledFeatures });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

// Task 2: flags gate at the API authorization layer, not the UI. This
// route only ever changes system_config.enabled_features -- every other
// route/endpoint that a flag is meant to gate must read this same
// column itself (see src/app/api/app/pulse/today/route.ts for the
// pattern) rather than trusting the caller's own claim that a feature
// is on. A hidden-but-reachable endpoint is an open endpoint either way.
export async function POST(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;

  const body = await req.json().catch(() => null);
  const feature = typeof body?.feature === 'string' ? body.feature.trim() : '';
  const enabled = typeof body?.enabled === 'boolean' ? body.enabled : null;
  if (!feature || enabled === null) {
    return NextResponse.json({ error: 'feature (string) and enabled (boolean) are required' }, { status: 400 });
  }

  try {
    const result = await withTenantContext(guard.claims, async (client) => {
      const { rows: before } = await client.query(`select enabled_features from system_config where school_id = $1`, [
        params.schoolId,
      ]);
      const beforeFeatures = before[0]?.enabled_features ?? {};

      const { rows } = await client.query(
        `insert into system_config (school_id, enabled_features)
         values ($1, jsonb_build_object($2::text, $3::boolean))
         on conflict (school_id) do update
           set enabled_features = system_config.enabled_features || jsonb_build_object($2::text, $3::boolean),
               updated_at = now()
         returning enabled_features`,
        [params.schoolId, feature, enabled]
      );

      await writeAuditLog(client, {
        schoolId: params.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'school.feature_flag_changed',
        targetType: 'system_config',
        targetId: params.schoolId,
        beforeState: beforeFeatures,
        afterState: rows[0].enabled_features,
      });

      return rows[0].enabled_features;
    });
    return NextResponse.json({ enabledFeatures: result });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
