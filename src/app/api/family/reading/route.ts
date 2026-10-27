import { NextRequest, NextResponse } from 'next/server';
import { loadChapter } from '@/lib/family/chapter-store';
import { isNarrationPlace } from '@/lib/family/chapters';
import { activeChild, isPrePrimary, listChildren } from '@/lib/family/children';
import { consentState } from '@/lib/family/consent';
import { savePlace } from '@/lib/family/reading';
import { familyRun, jsonBody, requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';

// The chapter reader's place (S1, C374): where the child using the app stopped listening. Body: { chapterKey, blockId,
// sentence }. Only a place that exists in that chapter's narration is kept; the child is the one this phone has
// chosen, never one the body names.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  const blockId = typeof body.blockId === 'string' ? body.blockId : '';
  const sentence = body.sentence;
  if (typeof body.chapterKey !== 'string' || typeof sentence !== 'number' || !Number.isInteger(sentence)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const chapterKey = body.chapterKey;
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const child = activeChild(await listChildren(db, g.session.accountId), chosen);
    if (!child || isPrePrimary(child.classLevel)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!(await consentState(db, g.session.accountId)).study_core) return NextResponse.json({ error: 'consent_required' }, { status: 403 });
    // The chapter is the database's published version (or the showcase file); only a place in its narration is kept.
    const chapter = await loadChapter(db, chapterKey);
    if (!chapter || !isNarrationPlace(chapter, blockId, sentence)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    const kept = await savePlace(db, g.session.accountId, child.childId, chapter.key, { blockId, sentence });
    return kept ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_ready' }, { status: 503 });
  });
}
