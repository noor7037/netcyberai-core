import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { actorOf, mayRead } from '@/lib/marking/http';
import { paperRefusal } from '@/lib/papers/http';
import { keepPaper, makeScreen } from '@/lib/papers/keep';

// "Keep the paper" (C363): the paper becomes the teacher's. Its AI-written questions become kept bank questions, its
// own worded questions enter the bank, and it may print. Only whoever may mark the paper, when its questions make up
// the paper and each has its words (keep_paper() holds the same).
//   POST → { banked, screen }
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.paperId)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const r = await keepPaper(db, actorOf(claims), params.paperId);
    if (!r.ok) return paperRefusal(r.reason);
    return NextResponse.json({ banked: r.banked, screen: await makeScreen(db, actorOf(claims), params.paperId) });
  });
}
