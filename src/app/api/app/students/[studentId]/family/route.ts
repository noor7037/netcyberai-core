import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { appRoute, jsonError, readJson } from '@/lib/frameworks/route';
import { STUDENT_SEARCH_ROLES } from '@/lib/frameworks/student-search';
import { getFamilyView, setStudentFamily } from '@/lib/families/families';

// A student's family (C116): GET the Siblings panel and Family view; PATCH
// { familyId } moves the student to another family, { familyId: null }
// removes them from theirs (office only). Teachers read it for students of
// their own classes and see only siblings in their own classes (RLS).
export async function GET(req: NextRequest, { params }: { params: { studentId: string } }) {
  if (!isUuid(params.studentId)) return jsonError(404, 'student not found');
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, 'students', { roles: STUDENT_SEARCH_ROLES });
    if (!access.ok) return jsonError(access.status, access.error);
    const view = await getFamilyView(db, claims.schoolId, params.studentId, claims.role);
    return view ? NextResponse.json(view) : jsonError(404, 'student not found');
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { studentId: string } }) {
  const body = await readJson(req);
  if (!body || !('familyId' in body)) return jsonError(400, 'familyId (a family id, or null to remove) is required');
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, 'students', { write: true });
    if (!access.ok) return jsonError(access.status, access.error);
    const r = await setStudentFamily(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.studentId, body.familyId);
    return r.ok ? NextResponse.json(await getFamilyView(db, claims.schoolId, params.studentId, claims.role)) : jsonError(r.status, r.error);
  });
}
