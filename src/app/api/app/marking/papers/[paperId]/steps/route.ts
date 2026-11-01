import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { actorOf, mayRead, refusal } from '@/lib/marking/http';
import { suggestSteps } from '@/lib/marking/steps';

// Marking steps suggested for one question of the setup form (W14-C).
//   POST  { kind, maxMarks, prompt, answerKey }   whoever may mark the paper, while AI marking is on. Answers
//         { steps: [{ step, marks }] } for the form to fill; nothing is kept until the teacher saves the questions.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.paperId)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const r = await suggestSteps(db, actorOf(claims), params.paperId, b);
    if (r.ok) return NextResponse.json({ steps: r.steps }, { headers: { 'Cache-Control': 'no-store' } });
    if (r.reason === 'not_sent_properly') return ruleError(400, 'not_sent_properly');
    return refusal(r.reason);
  });
}
