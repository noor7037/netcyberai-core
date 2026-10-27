import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { endReportLink } from '@/lib/marking/report-links';

// Ends a family's private result link (C230-AG): a lost phone, or a link sent on to someone else. POST { studentId,
// why: 'lost' | 'forwarded' | 'other' }. The link opens nothing from now on; the child shows as not sent, and a new
// link goes only by the same Send after the same preview (../route.ts). The principal and the school admin only.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { examId: string; classId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || typeof b.studentId !== 'string' || !isUuid(b.studentId) || typeof b.why !== 'string') return ruleError(400, 'not_sent_properly');
    const r = await endReportLink(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.examId, params.classId, b.studentId, b.why);
    if (r.ok) return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
    if (r.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (r.reason === 'not_found') return ruleError(404, 'not_found');
    if (r.reason === 'why') return ruleError(400, 'not_sent_properly');
    return jsonError(409, 'the link was not ended', { code: r.reason });
  });
}
