import { NextRequest, NextResponse } from 'next/server';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { tellParentsPreview, tellParentsSend, type TellProblem } from '@/lib/marking/result-send';

// "Tell parents on WhatsApp" for a published class (C351). GET: who will get a private link to their own child's
// result and who will not (and why, by the send-gate's own rules), and the state of every message already queued for
// this publication. POST: makes each child's link and queues one message per guardian through the send-gate's outbox;
// a second press sends nothing twice. The principal and the school admin only (TELL_ROLES); nothing here calls a provider.
export const dynamic = 'force-dynamic';

const refused = (reason: TellProblem) =>
  reason === 'not_allowed' ? ruleError(403, 'not_allowed') : reason === 'not_found' ? ruleError(404, 'not_found') : NextResponse.json({ error: 'not_published' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: NextRequest, { params }: { params: { examId: string; classId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const r = await tellParentsPreview(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.examId, params.classId);
    if (typeof r === 'string') return refused(r);
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest, { params }: { params: { examId: string; classId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const r = await tellParentsSend(db, jobQueue, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.examId, params.classId);
    if (!r.ok) return refused(r.reason);
    return NextResponse.json(r, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  });
}
