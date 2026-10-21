import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { liveBuild, loadControlApps } from '@/lib/control/apps';

// Control → Apps, read: the flags, banners, versions, preview accounts and recent changes. The founder only.
export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  try {
    const data = await withTenantContext(guard.claims, (db) => loadControlApps(db));
    return NextResponse.json({ ...data, build: liveBuild() });
  } catch (err) {
    const res = sessionErrorResponse(err);
    if (res) return res;
    throw err;
  }
}
