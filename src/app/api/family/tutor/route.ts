import { NextRequest, NextResponse } from 'next/server';
import { familyRun, jsonBody, requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { isSubject } from '@/lib/family/subjects';
import { ownsBookChapter } from '@/lib/family/tutor-context';
import { listChats, newChat, readFeed, tutorChild } from '@/lib/family/tutor';
import { listConversations } from '@/lib/family/tutor-conversations';

// The shared tutor window's chats (S2, C375; W9-A, C406). The child is the one this phone chose, never one the request
// names: a sibling's chat is never read or made here.
//   GET  ?subject=<id>[&turns=0] → { chats, chatId, turns }: the child's chats in that subject (open and full, the most
//        recently used first; kept for the Vault and the tests, the screen lists none), the chat a new question
//        continues (the newest open one; null: the first answer opens one) and, W10-4 (C413), the subject's feed: every
//        turn of its chats, oldest first, each with its chat and the chat's subject (docs/39 §5).
//        W23-C: with &chapterKey=<a chapter of the child's book> the feed is that chapter's own chats only (the book page's
//        sheet); another book's or an unknown chapter is 404.
//   POST { subject } → { chatId }: a new chat ("New chat"; an empty one is reused); a sixteenth archives the least
//        recently used.
export const dynamic = 'force-dynamic';

//   GET  ?conversations=1 → { conversations }: the history (founder, 17 Nov 2026): every listed chat of this child in
//        every subject, with its subject, its book chapter (when all its questions were asked in one) and when it was
//        last used, newest first (src/lib/family/tutor-conversations.ts).
export async function GET(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  if (req.nextUrl.searchParams.get('conversations') === '1') {
    const chosenChild = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
    return familyRun(g.session, async (db) => {
      const who = await tutorChild(db, g.session.accountId, chosenChild);
      if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status });
      const res = NextResponse.json({ conversations: await listConversations(db, g.session.accountId, who.child.childId) });
      res.headers.set('Cache-Control', 'no-store');
      return res;
    });
  }
  const subject = req.nextUrl.searchParams.get('subject');
  if (!isSubject(subject)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const who = await tutorChild(db, g.session.accountId, chosen);
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status });
    const chats = await listChats(db, g.session.accountId, who.child.childId, subject);
    const chatId = chats.find((c) => c.status === 'open')?.chatId ?? null;
    // `turns=0`: the chats alone.
    const withTurns = req.nextUrl.searchParams.get('turns') !== '0';
    // W23-C: `chapterKey` (a chapter of this child's book): the feed of that chapter alone, for the book page's sheet.
    const scope = req.nextUrl.searchParams.get('chapterKey');
    if (scope !== null && !ownsBookChapter(who.child, scope)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const turns = withTurns ? await readFeed(db, g.session.accountId, who.child.childId, subject, scope) : [];
    const res = NextResponse.json({ chats, chatId, turns });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  });
}

export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  if (!isSubject(body.subject)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const subject = body.subject;
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const who = await tutorChild(db, g.session.accountId, chosen);
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status });
    // A chat with nothing asked yet is reused, so tapping "New chat" again never pushes a real chat out of the list.
    const empty = (await listChats(db, g.session.accountId, who.child.childId, subject)).find((c) => c.status === 'open' && c.turnCount === 0);
    return NextResponse.json({ chatId: empty?.chatId ?? (await newChat(db, g.session.accountId, who.child.childId, subject)) });
  });
}
