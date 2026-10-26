import { NextRequest, NextResponse } from 'next/server';
import { EXAM_READERS } from '@/lib/exams/exams';
import { appRoute } from '@/lib/frameworks/route';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { aiMarkingState } from '@/lib/marking/context';
import { markingRefusal } from '@/lib/marking/http';
import { queueMarking } from '@/lib/marking/queue';
import { askToMarkAgain } from '@/lib/marking/review';

// AI marking (C347): the teacher asks the AI to mark one script again (a failed one, or a marked one).
//   POST → { queued: true }
// Refused while AI marking is off for the school, before anything is cleared: asking again clears the teacher's own
// changes to the script (askToMarkAgain). Then the script waits, and its marking job is queued in the same
// transaction under a key with the script's tries, so a second press queues nothing more. The job is started by the
// sweeper within the minute (a request never waits for the AI: src/lib/jobs/runner.ts, LONG_JOB_TYPES).
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { sheetId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!EXAM_READERS.includes(claims.role)) return markingRefusal('not_allowed');
    const ai = await aiMarkingState(db, claims.schoolId);
    if (!ai.on) return markingRefusal('ai_off', { why: ai.why });
    const r = await askToMarkAgain(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.sheetId);
    if (!r.ok) return markingRefusal(r.reason === 'marks' || r.reason === 'words' ? 'not_sent_properly' : r.reason);
    await queueMarking(db, jobQueue, claims.schoolId, [params.sheetId]);
    return NextResponse.json({ queued: true });
  });
}
