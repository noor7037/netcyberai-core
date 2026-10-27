import { NextRequest, NextResponse } from 'next/server';
import { outputsState, publishAndNotify, type OutputsProblem } from '@/lib/exams/publish-outputs';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { jobQueue } from '@/lib/jobs/pg-queue';

// "Publish and notify" for a published class (C230-AJ part 5). After the marks are approved and the class is published:
//   GET    whether its report cards and progress reports were made, and when
//   POST   makes them: shows the progress reports in the Family app, queues one WhatsApp message per guardian through the
//          send-gate's outbox (the previewed send of tell-parents, the same approved words) and lets the push job tell the
//          families. A second press queues nothing twice.
// The principal and the school admin only; nothing here calls a provider, and it changes neither approval nor publication.
export const dynamic = 'force-dynamic';

const refused = (reason: OutputsProblem) =>
  reason === 'not_allowed' ? ruleError(403, 'not_allowed') : reason === 'not_found' ? ruleError(404, 'not_found') : NextResponse.json({ error: 'not_published' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: NextRequest, { params }: { params: { examId: string; classId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const r = await outputsState(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.examId, params.classId);
    if (typeof r === 'string') return refused(r);
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest, { params }: { params: { examId: string; classId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const r = await publishAndNotify(db, jobQueue, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.examId, params.classId);
    if (!r.ok) return refused(r.reason);
    return NextResponse.json(r, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  });
}
