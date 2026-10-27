import { NextRequest, NextResponse } from 'next/server';
import { loadChapter } from '@/lib/family/chapter-store';
import { sendsPhoto, submitTest, listAttempts } from '@/lib/family/chapter-tests';
import { familyRun, jsonBody, requireFamily, requireParent } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { tutorChild } from '@/lib/family/tutor';

// A chapter test (S5, C378; docs/37 §4 Wave 2).
//   POST { chapterKey, blockId, answers: [{ itemId, token, choice } | { itemId, text } | { itemId, attachmentId }] }
//        sends the whole test once. The server opens every sealed token (the phone never holds an answer), records the
//        attempt for the child this phone chose (never one the body names) and answers with the multiple-choice result.
//        A written or photo answer is kept for the parent or teacher; it is never marked here. Needs the parent's study
//        consent, and for a photo the photo consent too.
//   GET  (parent mode, behind the PIN) the account's attempts, newest first, for the parent page.
export const dynamic = 'force-dynamic';

const STATUS = { bad_request: 400, not_found: 404, incomplete: 422, item_expired: 410, text_unsuitable: 422, photo_not_ready: 409 } as const;

export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  if (typeof body.chapterKey !== 'string') return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const chapterKey = body.chapterKey;
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const who = await tutorChild(db, g.session.accountId, chosen, sendsPhoto(body.answers));
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status });
    const chapter = await loadChapter(db, chapterKey);
    if (!chapter) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const done = await submitTest(db, { accountId: g.session.accountId, childId: who.child.childId }, chapter, who.child.language, { blockId: body.blockId, answers: body.answers });
    if (!done.ok) return NextResponse.json({ error: done.reason, ...(done.detail ? { item: done.detail } : {}) }, { status: STATUS[done.reason] });
    return NextResponse.json(done.result);
  });
}

export async function GET(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  return familyRun(g.session, async (db) => NextResponse.json({ attempts: await listAttempts(db, g.session.accountId) }));
}
