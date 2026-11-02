import { NextRequest, NextResponse } from 'next/server';
import { familyRun, jsonBody, requireFamily } from '@/lib/family/request';
import { submitQuiz } from '@/lib/family/quiz-play';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { tutorChild } from '@/lib/family/tutor';

// A Quick quiz made from a tutor session (W16-B1). The child is the one this phone chose, never one the body names.
//   POST { quizId, answers: [{ itemId, token, choice } | { itemId, text }] } sends the whole quiz. The server opens every sealed
//        token (the phone never holds an answer), scores the choice questions with the chapter test's own scorer and keeps the
//        take as an attempt under the quiz's id; a written answer is kept for the parent, never marked. The same answers as a
//        chapter test, so the same results. Needs the parent's study consent.
export const dynamic = 'force-dynamic';

const STATUS = { bad_request: 400, not_found: 404, incomplete: 422, item_expired: 410, text_unsuitable: 422, photo_not_ready: 409 } as const;

export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const who = await tutorChild(db, g.session.accountId, chosen);
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status });
    const done = await submitQuiz(db, { accountId: g.session.accountId, childId: who.child.childId }, body.quizId, body.answers);
    if (!done.ok) return NextResponse.json({ error: done.reason, ...(done.detail ? { item: done.detail } : {}) }, { status: STATUS[done.reason] });
    return NextResponse.json(done.result, { headers: { 'Cache-Control': 'no-store' } });
  });
}
