import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { listSchoolAccounts, SCHOOL_ACCOUNT_ADMINS } from '@/lib/auth/staff-accounts';

// Staff accounts of the current school, for principals and school admins (C89).
export async function GET(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!SCHOOL_ACCOUNT_ADMINS.includes(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    const accounts = await withTenantContext(guard.claims, (client) => listSchoolAccounts(client, guard.claims.schoolId));
    return NextResponse.json({ accounts });
  } catch (err) {
    const res = sessionErrorResponse(err);
    if (res) return res;
    throw err;
  }
}
