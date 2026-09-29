import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { listAllAccounts } from '@/lib/auth/staff-accounts';

// Every account on the platform, for super_admin (C89).
export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  try {
    const accounts = await withTenantContext(guard.claims, (client) => listAllAccounts(client));
    return NextResponse.json({ accounts });
  } catch (err) {
    const res = sessionErrorResponse(err);
    if (res) return res;
    throw err;
  }
}
