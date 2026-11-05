import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { loadIntegrations } from '@/lib/control/integrations';

// GET: Control → Integrations (W21-M6), every outside service's state in one table; keys as their last four only.
// The tests are the existing ones on Control → AI and Control → WhatsApp, called from the page.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  try {
    return NextResponse.json({ integrations: await withTenantContext(guard.claims, (db) => loadIntegrations(db)) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
