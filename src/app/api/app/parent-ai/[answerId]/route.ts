import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { approveAnswer, discardAnswer } from '@/lib/parent-ai/answers';

// POST { action: 'approve', words } | { action: 'discard' }: a person has read the draft (C196). Approving is what
// sends it, with the words approved; nothing else sends it.
export async function POST(req: NextRequest, { params }: { params: { answerId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.answerId)) return ruleError(400, 'not_sent_properly');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const done = b.action === 'approve' && typeof b.words === 'string' && b.words.length <= 2000 ? await approveAnswer(db, jobQueue, actor, params.answerId, b.words) : b.action === 'discard' ? await discardAnswer(db, actor, params.answerId) : null;
    if (!done) return ruleError(400, 'not_sent_properly');
    if (done.ok) return NextResponse.json({ status: 'status' in done ? done.status : null });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return done.reason === 'not_found' ? ruleError(404, 'not_found') : jsonError(409, 'that was not done', { code: done.reason });
  });
}
