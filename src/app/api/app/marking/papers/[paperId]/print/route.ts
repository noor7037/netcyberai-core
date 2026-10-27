import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { actorOf, mayRead } from '@/lib/marking/http';
import { paperRefusal } from '@/lib/papers/http';
import { printData } from '@/lib/papers/keep';

// A question paper and its marking scheme, for the browser to draw as PDFs (C362): the school's name, the exam, class
// and subject, the time and marks, and the questions with their sections, choices, answers and steps. Refused until
// the paper is kept and unchanged since (409, code: not_kept, changed, drafts, busy or no_questions): an AI-written
// question never prints unkept.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.paperId)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const r = await printData(db, actorOf(claims), params.paperId);
    if (!r.ok) return paperRefusal(r.reason);
    return NextResponse.json(r.data, { headers: { 'Cache-Control': 'no-store' } });
  });
}
