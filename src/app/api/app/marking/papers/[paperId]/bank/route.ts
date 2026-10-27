import { NextRequest, NextResponse } from 'next/server';
import { QUESTION_KINDS } from '@/lib/contracts/marking';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { actorOf, mayRead } from '@/lib/marking/http';
import { paperRefusal } from '@/lib/papers/http';
import { bankFor, pickIntoPaper } from '@/lib/papers/keep';

// The school's question bank for a paper (C363): kept questions of the class's grade and subject, in the paper's
// language, never one already on the paper; those the class had in its last two papers of the subject are left out
// and counted.
//   GET   ?chapter=&kind=&marks=   → { questions, skipped, chapters }
//   POST  { bankIds: [...] }       "Pick from the bank": added at the end of the paper → { screen }
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.paperId)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const q = req.nextUrl.searchParams;
    const chapter = q.get('chapter')?.trim().slice(0, 120) || null;
    const kind = q.get('kind');
    const marks = q.get('marks');
    if (kind !== null && !(QUESTION_KINDS as readonly string[]).includes(kind)) return ruleError(400, 'not_sent_properly');
    if (marks !== null && !(Number(marks) > 0 && Number(marks) <= 100)) return ruleError(400, 'not_sent_properly');
    const data = await bankFor(db, actorOf(claims), params.paperId, { chapter, kind, marks: marks === null ? null : Number(marks) });
    if (!data) return ruleError(404, 'not_found');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.paperId)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const r = await pickIntoPaper(db, actorOf(claims), params.paperId, b.bankIds);
    if (!r.ok) return paperRefusal(r.reason);
    return NextResponse.json({ screen: r.screen });
  });
}
