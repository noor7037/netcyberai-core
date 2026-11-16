import { NextRequest, NextResponse } from 'next/server';
import { activeChild, listChildren, type FamilyChild } from '@/lib/family/children';
import { consentState } from '@/lib/family/consent';
import { familyModuleOn } from '@/lib/family/flags';
import { familyRead, requireFamily } from '@/lib/family/request';
import { syllabusLine, type Line } from '@/lib/family/resolver';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { topicVideos } from '@/lib/family/video-finder';
import type { VideoPick } from '@/lib/family/videos';

// The video finder (M2-5, C279): GET ?topic=<topic key> → { videos: [...] } for the child using the app now, at most
// three. A video is extra: anything missing — the module off, no key, the day's searches spent, the provider down —
// answers the pinned picks or an empty list, never an error the family sees. Needs the parent's study_core consent and
// (no plan or free-subject filter: videos work on free and paid alike).
//
// No database connection is held while YouTube answers (F1-3): the checks and the cached picks in one short
// transaction; when a refresh is due, Control's channel list (platform role) and the key and the day's searches in a
// second; the search with no connection; the ranked picks saved and read back in a third. A refresh is due when no
// automatic pick is fresh and fewer than three are pinned; the pinned are shown whatever happens to it.
export const dynamic = 'force-dynamic';

const TOPIC = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const NO_STORE = { 'Cache-Control': 'no-store' };
const answer = (videos: VideoPick[]) => NextResponse.json({ videos }, { headers: NO_STORE });

export async function GET(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const session = g.session;
  const topic = req.nextUrl.searchParams.get('topic') ?? '';
  if (!TOPIC.test(topic)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;

  // Who, whether videos are on and open to this child, and the topic line; then the finder's one path (video-finder.ts).
  const found = await familyRead(session, async (db): Promise<{ line: Line; child: FamilyChild } | null> => {
    const child = activeChild(await listChildren(db, session.accountId), chosen);
    if (!child) return null;
    if (!(await consentState(db, session.accountId)).study_core) return null;
    if (!(await familyModuleOn(db, 'videos', session.accountId))) return null;
    const line = await syllabusLine(db, child, { kind: 'topic', key: topic });
    // Videos work on every plan (Noor, 16 Nov 2026): a free child's one open subject is a limit on the tutor, not on videos.
    if (!line) return null;
    return { line, child };
  });
  if (!found) return answer([]);
  return answer(await topicVideos((fn) => familyRead(session, fn) as ReturnType<typeof fn>, found.line, found.child));
}
