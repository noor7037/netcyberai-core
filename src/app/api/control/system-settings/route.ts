import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { listSystemSettings } from '@/lib/control/system-settings';

// GET: the platform's own settings, read only, each with the Control screen that edits it. Secret-looking keys
// come back without their value.
export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  try {
    return NextResponse.json({ settings: await withTenantContext(guard.claims, (client) => listSystemSettings(client)) });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
