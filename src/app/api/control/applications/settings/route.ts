import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { setApprovalMode } from '@/lib/onboarding/applications';

// Approval mode (C98): 'manual' (the founder approves every school, the
// default) or 'auto' (a school is approved as soon as its email is
// confirmed). A setting, not code; every change is audited.
export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const body = await req.json().catch(() => null);
  const mode = body?.approvalMode;
  if (mode !== 'manual' && mode !== 'auto') return NextResponse.json({ error: 'approvalMode must be manual or auto' }, { status: 400 });
  try {
    await withTenantContext(guard.claims, (db) => setApprovalMode(db, mode, { userId: guard.claims.sub, role: guard.claims.role }));
    return NextResponse.json({ approvalMode: mode });
  } catch (err) {
    const res = sessionErrorResponse(err);
    if (res) return res;
    throw err;
  }
}
