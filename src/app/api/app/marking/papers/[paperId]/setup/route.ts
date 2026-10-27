import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { actorOf, mayRead, refusal } from '@/lib/marking/http';
import { readSetup, saveSetup } from '@/lib/marking/setup';

// A paper's questions for AI marking (C347).
//   GET   the paper, its language and guidance, its questions, the problems in how they add up, and whether they are locked
//   POST  { setup: { language, guidance, choiceCounts }, questions: [...] }  the whole list; whoever may enter the
//         paper's marks (the database holds it too). Answers { ok, screen }.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.paperId)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const data = await readSetup(db, actorOf(claims), params.paperId);
    if (!data) return ruleError(404, 'not_found');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.paperId)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const r = await saveSetup(db, actorOf(claims), params.paperId, b);
    if (r.ok) return NextResponse.json({ ok: true, screen: r.screen });
    return refusal(r.reason, { ...(r.at === undefined ? {} : { at: r.at }), ...(r.field === undefined ? {} : { field: r.field }) });
  });
}
