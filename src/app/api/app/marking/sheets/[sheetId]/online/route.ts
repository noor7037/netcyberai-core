import { NextRequest, NextResponse } from 'next/server';
import { EXAM_READERS } from '@/lib/exams/exams';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { aiMarkingState } from '@/lib/marking/context';
import { actorOf, markingRefusal } from '@/lib/marking/http';
import { markOnlineAgain, scriptAnswers } from '@/lib/online/tests';

// An online test's script (AQ-4, C365), for the review screen.
//   GET   the child's typed answers, question by question, with when the test was sat and how often the screen was
//         left: 404 for a script that is not an online one the person may read (the review shows its pages instead)
//   POST  "Mark again": the review's own step (the teacher's changes cleared, the script waiting), then the online
//         script's marking queued (src/lib/online/mark.ts); refused while AI marking is off, before anything is cleared
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { sheetId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.sheetId)) return ruleError(400, 'not_sent_properly');
    if (!EXAM_READERS.includes(claims.role)) return ruleError(403, 'not_allowed');
    const answers = await scriptAnswers(db, actorOf(claims), params.sheetId);
    if (!answers) return ruleError(404, 'not_found');
    return NextResponse.json(answers, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest, { params }: { params: { sheetId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.sheetId)) return markingRefusal('not_sent_properly');
    if (!EXAM_READERS.includes(claims.role)) return markingRefusal('not_allowed');
    const ai = await aiMarkingState(db, claims.schoolId);
    if (!ai.on) return markingRefusal('ai_off', { why: ai.why });
    const r = await markOnlineAgain(db, actorOf(claims), params.sheetId);
    if (!r.ok) return markingRefusal(r.reason === 'marks' || r.reason === 'words' ? 'not_sent_properly' : (r.reason as Parameters<typeof markingRefusal>[0]));
    return NextResponse.json({ queued: r.queued });
  });
}
