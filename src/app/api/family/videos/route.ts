import { NextRequest, NextResponse } from 'next/server';
import { prepareVideoSearch, videoChannels, type PreparedVideos } from '@/lib/ai/platform';
import { activeChild, listChildren, type FamilyChild } from '@/lib/family/children';
import { consentState } from '@/lib/family/consent';
import { familyModuleOn } from '@/lib/family/flags';
import { setting } from '@/lib/family/learning';
import { subjectAccess } from '@/lib/family/modules';
import { familyRead, requireFamily } from '@/lib/family/request';
import { syllabusLine, type Line } from '@/lib/family/resolver';
import { FAMILY_CHILD_COOKIE, type FamilySession } from '@/lib/family/session';
import { noteSearch, rankVideos, readPicks, savePicks, searchedEmptyLately, videoPlan, type VideoLanguage, type VideoPick } from '@/lib/family/videos';
import { indiaDate } from '@/lib/time/india';

// The video finder (M2-5, C279): GET ?topic=<topic key> → { videos: [...] } for the child using the app now, at most
// three. A video is extra: anything missing — the module off, no key, the day's searches spent, the provider down —
// answers the pinned picks or an empty list, never an error the family sees. Needs the parent's study_core consent and
// the subject open to this child (as Understand checks it; reading a video never claims a free subject).
//
// No database connection is held while YouTube answers (F1-3): the checks and the cached picks in one short
// transaction; when a refresh is due, Control's channel list (platform role) and the key and the day's searches in a
// second; the search with no connection; the ranked picks saved and read back in a third. A refresh is due when no
// automatic pick is fresh and fewer than three are pinned; the pinned are shown whatever happens to it.
export const dynamic = 'force-dynamic';

const TOPIC = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const NO_STORE = { 'Cache-Control': 'no-store' };
const answer = (videos: VideoPick[]) => NextResponse.json({ videos }, { headers: NO_STORE });

type Refresh = { line: Line; child: FamilyChild; language: VideoLanguage; days: number; perDay: number; wider: boolean; cached: VideoPick[]; staleAuto: number };
type Found = { cached: VideoPick[] } | { refresh: Refresh };

export async function GET(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const session = g.session;
  const topic = req.nextUrl.searchParams.get('topic') ?? '';
  if (!TOPIC.test(topic)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;

  // 1. Who, whether videos are on and open to this child, and the cached picks.
  const found = await familyRead(session, async (db): Promise<Found | null> => {
    const child = activeChild(await listChildren(db, session.accountId), chosen);
    if (!child) return null;
    if (!(await consentState(db, session.accountId)).study_core) return null;
    if (!(await familyModuleOn(db, 'videos', session.accountId))) return null;
    const line = await syllabusLine(db, child, { kind: 'topic', key: topic });
    if (!line || !subjectAccess(child, line.subject).open) return null;
    const language: VideoLanguage = child.language === 'hi' ? 'hi' : 'en';
    const days = await setting(db, 'family.video_pick_days', 30);
    const cached = await readPicks(db, line.key, language, days);
    if (!cached.refreshDue || searchedEmptyLately(line.key, language)) return { cached: cached.picks };
    const perDay = await setting(db, 'family.video_searches_per_day', 90);
    // Videos from channels Control has not listed only when Control turns them on (C230-R; off unless set to 1).
    const wider = (await setting(db, 'family.video_wider_catalogue', 0)) === 1;
    return { refresh: { line, child, language, days, perDay, wider, cached: cached.picks, staleAuto: cached.staleAuto } };
  });
  if (!found) return answer([]);
  if ('cached' in found) return answer(found.cached);

  // 2. A refresh: the channels Control listed, then the key and the day's searches.
  const r = found.refresh;
  const channels = await videoChannels();
  const prepared = await familyRead(session, (db): Promise<PreparedVideos> => prepareVideoSearch(db, { day: indiaDate(), perDay: r.perDay, plan: videoPlan(r.line, r.child, channels) }));
  if (!prepared?.ok) return answer(await dropStale(session, r));

  // 3. The provider, with no connection held.
  const result = await prepared.find();
  if (!result.ok) {
    noteSearch(r.line.key, r.language, { failed: true });
    return answer(await dropStale(session, r));
  }
  const ranked = rankVideos(result.candidates, { topicTitles: [r.line.topicEn ?? '', r.line.title], language: r.language, channels, wider: r.wider });
  noteSearch(r.line.key, r.language, { found: ranked.length });

  // 4. Saved (a reviewer's pinned and rejected picks stay as they are) and read back as the family sees them.
  const read = await familyRead(session, async (db) => {
    await savePicks(db, r.line.key, r.language, ranked);
    return readPicks(db, r.line.key, r.language, r.days);
  });
  return answer(read?.picks ?? []);
}

// No refresh could run (no key, the day's searches spent, the provider down): the pinned picks are still shown, and
// automatic picks older than family.video_pick_days are dropped (the provider's storage rules), spending no search.
async function dropStale(session: FamilySession, r: Refresh): Promise<VideoPick[]> {
  if (r.staleAuto > 0) await familyRead(session, (db) => savePicks(db, r.line.key, r.language, []));
  return r.cached;
}
