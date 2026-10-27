import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { actorOf, mayRead } from '@/lib/marking/http';
import { paperRefusal } from '@/lib/papers/http';
import { makeScreen } from '@/lib/papers/keep';
import { askToMake } from '@/lib/papers/make';

// Making a paper's questions from what was taught (docs/36 §1.1, C362).
//   GET   the exam type and its blueprint, the plan (which rule chose the chapters, each chapter's periods and marks,
//         the sections), the latest making and its progress, whether the paper is kept and prints
//   POST  { preview: true, sections?, chapterMarks? }   the plan with the teacher's sections or marks per chapter for this
//         paper; nothing is made
//   POST  { again?, sections?, chapterMarks? }   make it: one job (papers.make), started by the sweeper within the
//         minute (a request never waits for the AI). Whoever may mark the paper; "again" replaces its questions.
//         Answers 201 { generation }, or the reason it cannot be made (409, with the plan's problems).
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.paperId)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const data = await makeScreen(db, actorOf(claims), params.paperId);
    if (!data) return ruleError(404, 'not_found');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.paperId)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    if (b.preview === true) {
      const data = await makeScreen(db, actorOf(claims), params.paperId, { sections: b.sections, chapterMarks: b.chapterMarks });
      if (!data) return ruleError(404, 'not_found');
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    }
    const r = await askToMake(db, jobQueue, actorOf(claims), params.paperId, b);
    if (r.ok) return NextResponse.json({ generation: r.generation }, { status: 201 });
    return paperRefusal(r.reason, { ...(r.problems ? { problems: r.problems } : {}), ...(r.issues ? { issues: r.issues } : {}) });
  });
}
