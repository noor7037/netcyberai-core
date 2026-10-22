import { NextRequest, NextResponse } from 'next/server';
import { prepareVideoSearch, videoChannels, type PreparedVideos } from '@/lib/ai/platform';
import { activeChild, listChildren } from '@/lib/family/children';
import { consentState } from '@/lib/family/consent';
import { familyModuleOn } from '@/lib/family/flags';
import { setting } from '@/lib/family/learning';
import { subjectAccess } from '@/lib/family/modules';
import { familyRead, requireFamily } from '@/lib/family/request';
import { syllabusLine, type Line } from '@/lib/family/resolver';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import type { FamilyChild } from '@/lib/family/children';
import { noteSearch, rankVideos, readPicks, savePicks, searchedEmptyLately, videoPlan, type VideoLanguage, type VideoPick } from '@/lib/family/videos';
import { indiaDate } from '@/lib/time/india';

// The video finder (M2-5, C279): GET ?topic=<topic key> → { videos: [...] } for the child using the app now, at most
// three. A video is extra: anything missing — the module off, no key, the day's searches spent, the provider down —
// answers an empty list, never an error the family sees. Needs the parent's study_core consent and the subject open to
// this child (as Understand checks it; reading a video never claims a free subject).
//
// No database connection is held while YouTube answers (F1-3): the checks and the cached picks in one short
// transaction; when a refresh is due, Control's channel list (platform role) and the key and the day's searches in a
// second; the search with no connection; the ranked picks saved and read back in a third.
export const dynamic = 'force-dynamic';

const TOPIC = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const NO_STORE = { 'Cache-Control': 'no-store' };
const answer = (videos: VideoPick[]) => NextResponse.json({ videos }, { headers: NO_STORE });

type Found = { cached: VideoPick[] } | { refresh: { line: Line; child: FamilyChild; language: VideoLanguage; days: number; perDay: number } };

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
    if (cached.length || searchedEmptyLately(line.key, language)) return { cached };
    return { refresh: { line, child, language, days, perDay: await setting(db, 'family.video_searches_per_day', 90) } };
  });
  if (!found) return answer([]);
  if ('cached' in found) return answer(found.cached);

  // 2. A refresh: the channels Control listed, then the key and the day's searches.
  const { line, child, language, days, perDay } = found.refresh;
  const channels = await videoChannels();
  const prepared = await familyRead(session, (db): Promise<PreparedVideos> => prepareVideoSearch(db, { day: indiaDate(), perDay, plan: videoPlan(line, child, channels) }));
  if (!prepared?.ok) return answer([]);

  // 3. The provider, with no connection held.
  const result = await prepared.find();
  if (!result.ok) return answer([]);
  const ranked = rankVideos(result.candidates, { topicTitles: [line.topicEn ?? '', line.title], language, channels });
  noteSearch(line.key, language, ranked.length);

  // 4. Saved (a reviewer's pinned and rejected picks stay as they are) and read back as the family sees them.
  const videos = await familyRead(session, async (db) => {
    await savePicks(db, line.key, language, ranked);
    return readPicks(db, line.key, language, days);
  });
  return answer(videos ?? []);
}
