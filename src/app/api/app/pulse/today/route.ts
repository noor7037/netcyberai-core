import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { canAccessApp } from '@/lib/auth/guards';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';

// Minimal, real demonstration of Task 2's rule: "a hidden-but-reachable
// endpoint is an open endpoint." Pulse itself isn't built yet (a later
// prompt's job) -- this route exists so the feature-flag gate has one
// concrete, directly-curl-able endpoint to prove blocks correctly when
// `daily_pulse` is off, rather than only checking whether a nav item is
// hidden (which this prompt's own VERIFY section explicitly rejects as
// sufficient proof).
export async function GET(req: NextRequest) {
  const claims = await requireSession(req);
  if (!claims || !canAccessApp(claims)) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  }

  let enabled: boolean;
  try {
    enabled = await withTenantContext(claims, async (client) => {
      const { rows } = await client.query(`select enabled_features from system_config where school_id = $1`, [
        claims.schoolId,
      ]);
      return rows[0]?.enabled_features?.daily_pulse === true;
    });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }

  if (!enabled) {
    return NextResponse.json({ error: 'feature_disabled', feature: 'daily_pulse' }, { status: 403 });
  }

  return NextResponse.json({ status: 'not_yet_built', feature: 'daily_pulse' });
}
