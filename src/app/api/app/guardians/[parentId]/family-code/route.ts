import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { CONNECT_CODE_ROLES, disconnectGuardian, issueConnectCode } from '@/lib/school-link';

// The guardian screen's Family app box (C230-AA): the principal or a school admin makes a connect code for this
// guardian (shown once; single use; 7 days), or disconnects the guardian's Family app. Both audited.
export async function POST(req: NextRequest, { params }: { params: { parentId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!CONNECT_CODE_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    if (!isUuid(params.parentId)) return ruleError(404, 'not_found', { field: 'guardian' });
    const r = await issueConnectCode(db, { userId: claims.sub, role: claims.role, schoolId: claims.schoolId }, params.parentId);
    if (r === 'not_found') return ruleError(404, 'not_found', { field: 'guardian' });
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { parentId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!CONNECT_CODE_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    if (!isUuid(params.parentId)) return ruleError(404, 'not_found', { field: 'guardian' });
    return NextResponse.json(await disconnectGuardian(db, { userId: claims.sub, role: claims.role, schoolId: claims.schoolId }, params.parentId));
  });
}
