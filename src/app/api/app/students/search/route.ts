import { NextRequest, NextResponse } from 'next/server';
import type { StudentSearchResponse } from '@/lib/contracts/student-search';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { appRoute, jsonError } from '@/lib/frameworks/route';
import { parseStudentSearch, searchStudents, STUDENT_SEARCH_ROLES } from '@/lib/frameworks/student-search';

// Student 360 search (C112): GET ?q=&limit=. Part of the Students module's
// entitlement; teachers may search without the Students module, and the
// database limits them to their own classes (teacher_scope_students).
export async function GET(req: NextRequest) {
  const started = performance.now();
  const parsed = parseStudentSearch(req.nextUrl.searchParams.get('q'), req.nextUrl.searchParams.get('limit'));
  if (!parsed) return jsonError(400, 'q needs at least 2 characters');
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, 'students', { roles: STUDENT_SEARCH_ROLES });
    if (!access.ok) return jsonError(access.status, access.error);
    const results = await searchStudents(db, claims.schoolId, parsed);
    const body: StudentSearchResponse = { results, tookMs: Math.round(performance.now() - started) };
    return NextResponse.json(body, { headers: { 'cache-control': 'no-store' } });
  });
}
