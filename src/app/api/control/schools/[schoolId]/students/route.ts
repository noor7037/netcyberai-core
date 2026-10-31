import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { listSchoolStudents, studentPage, studentSearch } from '@/lib/control/school-students';
import { isUuid } from '@/lib/frameworks/custom-fields';

// GET: a school's students for the founder (W13-A), read only. Counts, and 50 a page (?page=) with an optional name or
// admission number search (?q=). Name, admission number, class, section and status; nothing more about the child.
export async function GET(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!isUuid(params.schoolId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { searchParams } = req.nextUrl;
  try {
    const result = await withTenantContext(guard.claims, (client) => listSchoolStudents(client, params.schoolId, { page: studentPage(searchParams.get('page')), q: studentSearch(searchParams.get('q')) }));
    return NextResponse.json(result);
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
