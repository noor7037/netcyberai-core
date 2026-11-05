import { prepareVideoSearch, videoChannels, type PreparedVideos } from '@/lib/ai/platform';
import type { FamilyChild } from '@/lib/family/children';
import { setting } from '@/lib/family/learning';
import type { Line } from '@/lib/family/resolver';
import { noteSearch, rankVideos, readPicks, savePicks, searchedEmptyLately, videoPlan, type VideoLanguage, type VideoPick } from '@/lib/family/videos';
import { indiaDate } from '@/lib/time/india';

// The video finder's one path (M2-5, C279; W19-F, C472): the topic's picks while they are fresh, else a refresh from
// the provider, searched with the catalog line only (never a child's words), ranked in code, saved and read back. Used
// by the Study page's finder (/api/family/videos) and, since W19-F, by every tutor answer whose question matched a
// syllabus topic, so a video follows the answer without the child opening the finder. No database connection is held
// while the provider answers (F1-3): `withDb` opens one short transaction per step. Anything that fails gives the
// cached picks (pinned ones always), never an error.
// The family transaction's client (what prepareVideoSearch takes); the picks' own reads take any query function.
type Db = Parameters<typeof prepareVideoSearch>[0];
export type WithDb = <T>(fn: (db: Db) => Promise<T>) => Promise<T>;

type Refresh = { language: VideoLanguage; days: number; perDay: number; wider: boolean; cached: VideoPick[]; staleAuto: number };

export async function topicVideos(withDb: WithDb, line: Line, child: FamilyChild): Promise<VideoPick[]> {
  const language: VideoLanguage = child.language === 'hi' ? 'hi' : 'en';
  // 1. The cached picks, and whether a refresh is due.
  const found = await withDb(async (db): Promise<{ cached: VideoPick[] } | { refresh: Refresh }> => {
    const days = await setting(db, 'family.video_pick_days', 30);
    const cached = await readPicks(db, line.key, language, days);
    if (!cached.refreshDue || searchedEmptyLately(line.key, language)) return { cached: cached.picks };
    const perDay = await setting(db, 'family.video_searches_per_day', 90);
    // Videos from channels Control has not listed only when Control turns them on (C230-R; off unless set to 1).
    const wider = (await setting(db, 'family.video_wider_catalogue', 0)) === 1;
    return { refresh: { language, days, perDay, wider, cached: cached.picks, staleAuto: cached.staleAuto } };
  });
  if ('cached' in found) return found.cached;

  // 2. A refresh: the channels Control listed, then the key and the day's searches.
  const r = found.refresh;
  const channels = await videoChannels();
  const prepared = await withDb((db): Promise<PreparedVideos> => prepareVideoSearch(db, { day: indiaDate(), perDay: r.perDay, plan: videoPlan(line, child, channels) }));
  if (!prepared.ok) return dropStale(withDb, line, r);

  // 3. The provider, with no connection held.
  const result = await prepared.find();
  if (!result.ok) {
    noteSearch(line.key, r.language, { failed: true });
    return dropStale(withDb, line, r);
  }
  const ranked = rankVideos(result.candidates, { topicTitles: [line.topicEn ?? '', line.title], language: r.language, channels, wider: r.wider });
  noteSearch(line.key, r.language, { found: ranked.length });

  // 4. Saved (a reviewer's pinned and rejected picks stay as they are) and read back as the family sees them.
  return withDb(async (db) => {
    await savePicks(db, line.key, r.language, ranked);
    return (await readPicks(db, line.key, r.language, r.days)).picks;
  });
}

// No refresh could run (no key, the day's searches spent, the provider down): the pinned picks are still shown, and
// automatic picks older than family.video_pick_days are dropped (the provider's storage rules), spending no search.
async function dropStale(withDb: WithDb, line: Line, r: Refresh): Promise<VideoPick[]> {
  if (r.staleAuto > 0) await withDb((db) => savePicks(db, line.key, r.language, []));
  return r.cached;
}
