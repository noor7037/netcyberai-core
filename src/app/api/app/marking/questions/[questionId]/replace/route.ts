import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { actorOf, mayRead } from '@/lib/marking/http';
import { aiWritingOn } from '@/lib/papers/context';
import { paperRefusal } from '@/lib/papers/http';
import { replaceFromBank } from '@/lib/papers/keep';
import { askToRewrite } from '@/lib/papers/make';

// "Replace" one question of a paper (C362, C363), keeping its number, part, marks and section:
//   POST { from: 'bank', bankId }   with a kept bank question of the same marks → { screen }
//   POST { from: 'ai' }             written anew by the AI for its chapter and topic: one job (papers.make), started by
//                                   the sweeper within the minute → 201 { generation }
// Whoever may mark the paper, while nothing is being made for it and no script of it is approved.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { questionId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.questionId) || (b.from !== 'bank' && b.from !== 'ai')) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    if (b.from === 'bank') {
      if (!isUuid(b.bankId)) return ruleError(400, 'not_sent_properly');
      const r = await replaceFromBank(db, actorOf(claims), params.questionId, b.bankId);
      if (!r.ok) return paperRefusal(r.reason);
      return NextResponse.json({ screen: r.screen });
    }
    if (!(await aiWritingOn(db))) return paperRefusal('ai_off');
    const r = await askToRewrite(db, jobQueue, actorOf(claims), params.questionId);
    if (!r.ok) return paperRefusal(r.reason);
    return NextResponse.json({ generation: r.generation }, { status: 201 });
  });
}
