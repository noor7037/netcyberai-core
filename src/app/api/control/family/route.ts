import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { loadFamilyCounts } from '@/lib/control/family-counts';

// Control → Family: counts only, through family.control_counts(). The founder only. Read-only.
export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  try {
    return NextResponse.json(await withTenantContext(guard.claims, (db) => loadFamilyCounts(db)));
  } catch (err) {
    const res = sessionErrorResponse(err);
    if (res) return res;
    throw err;
  }
}
