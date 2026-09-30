import { NextRequest, NextResponse } from 'next/server';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { appRoute, jsonError, readJson } from '@/lib/frameworks/route';
import { confirmSuggestion } from '@/lib/families/families';

// Confirm a sibling suggestion (C116): { studentId, parentId } links the
// student to that guardian and to the family of the guardian's other
// children. Office only, audited.
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (!body) return jsonError(400, 'studentId and parentId are required');
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, 'students', { write: true });
    if (!access.ok) return jsonError(access.status, access.error);
    const r = await confirmSuggestion(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, body.studentId, body.parentId);
    return r.ok ? NextResponse.json({ family: r.family }) : jsonError(r.status, r.error);
  });
}
