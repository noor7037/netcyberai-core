import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { listDataCheck } from '@/lib/students/data-check';

// The student data check (C222).
//   GET ?class=<class id>   the children this person may see (the office: every class; a teacher: the class they are
//                           class teacher of), each with the free tool's findings and the requests asked about them
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const raw = req.nextUrl.searchParams.get('class');
    if (raw !== null && raw !== '' && !isUuid(raw)) return ruleError(400, 'not_sent_properly');
    const list = await listDataCheck(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { classId: raw ? raw : null });
    if (!list) return ruleError(403, 'not_allowed');
    return NextResponse.json(list, { headers: { 'Cache-Control': 'no-store' } });
  });
}
