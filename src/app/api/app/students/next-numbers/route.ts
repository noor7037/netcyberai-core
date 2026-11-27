import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { nextAdmissionNumbers, nextRollNumbers } from '@/lib/numbering/allocate';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/app/students/next-numbers?classId= (C554): the admission number and the class's roll number a new student
// would be given now, shown in the Add student form. Only a preview: the numbers are given when the student is saved.
export async function GET(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const classId = req.nextUrl.searchParams.get('classId');
  try {
    const next = await withTenantContext(guard.claims, async (client) => ({
      admissionNo: (await nextAdmissionNumbers(client, guard.claims.schoolId))[0],
      rollNo: classId && UUID.test(classId) ? ((await nextRollNumbers(client, guard.claims.schoolId, classId))[0] ?? null) : null,
    }));
    return NextResponse.json(next);
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
