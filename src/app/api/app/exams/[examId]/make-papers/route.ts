import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { actorOf, mayRead } from '@/lib/marking/http';
import { askToMakeAll } from '@/lib/papers/make';

// "Make every paper" of an exam (C362): one making a paper (papers.make), for every paper the person may mark that has
// no questions yet, by its exam type's blueprint and its class's taught log. A paper that cannot be made now is left as
// it is and named with the reason, so nothing is forced.
//   POST → { queued: [paperId], skipped: [{ paperId, reason }] }
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { examId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.examId)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const r = await askToMakeAll(db, jobQueue, actorOf(claims), params.examId);
    if (!r) return ruleError(404, 'not_found');
    return NextResponse.json({ queued: r.queued, skipped: r.skipped });
  });
}
