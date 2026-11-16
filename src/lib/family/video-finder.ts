import { prepareVideoSearch, videoChannels, type PreparedVideos } from '@/lib/ai/platform';
import type { FamilyChild } from '@/lib/family/children';
import { setting } from '@/lib/family/learning';
import type { Line } from '@/lib/family/resolver';
import { curatedFor } from '@/lib/family/curated-videos';
import { promoFor } from '@/lib/family/sponsorblock';
import { scheduleReviews } from '@/lib/family/video-review';
import { KEEP, MIN_VIEWS, inLanguage, noteSearch, rankVideos, readPicks, savePicks, searchedEmptyLately, videoPlan, type VideoLanguage, type VideoPick } from '@/lib/family/videos';
import { indiaDate } from '@/lib/time/india';
import { bandPicks, dropDead, noteCache } from '@/lib/family/video-cache';

// The video finder's one path (M2-5, C279; W19-F, C472): the topic's picks while they are fresh, else a refresh from
// the provider, searched with the catalog line only (never a child's words), ranked in code, saved and read back. Used
// by the Study page's finder (/api/family/videos) and, since W19-F, by every tutor answer whose question matched a
// syllabus topic, so a video follows the answer without the child opening the finder. No database connection is held
// while the provider answers (F1-3): `withDb` opens one short transaction per step. Anything that fails gives the
// cached picks (pinned ones always), never an error.
//
// C522: in any language the child chose (`language`; the app's own by default), and shared by every family and school
// through content.video_topic_searches: a refresh runs only after this request claims the topic (so two children asking
// the same thing at once spend one search), and a topic whose search found nothing is not searched again for
// EMPTY_DAYS (the negative cache). Every path takes its searches from the same daily quota (prepareVideoSearch).
//
// The quality pass (Noor, 16 Nov 2026): a person's curated videos for the topic are read first (curated-videos.ts) and,
// with enough of them, no search is spent; the quality gate drops paid placements, new uploads and little-seen videos
// (family.video_min_views); SponsorBlock's marked promotions skip or lower the top few and start a video after an opening
// sponsor; a video Gemini judged unsafe or wrong is never kept; and Gemini judges the kept ones in the background.
// The family transaction's client (what prepareVideoSearch takes); the picks' own reads take any query function.
type Db = Parameters<typeof prepareVideoSearch>[0];
export type WithDb = <T>(fn: (db: Db) => Promise<T>) => Promise<T>;

export const EMPTY_DAYS = 7;

type Refresh = { checkDue: string[]; language: VideoLanguage; days: number; perDay: number; wider: boolean; minViews: number; curated: string[]; cached: VideoPick[]; staleAuto: number };
// The outside services, injectable for tests: SponsorBlock's fetch and the background review.
export type FinderDeps = { sponsorFetch?: typeof fetch; review?: (videoIds: string[]) => void; oembedFetch?: typeof fetch };
// SponsorBlock is asked about this many of the best candidates.
const PROMO_LOOKUPS = 6;

export async function topicVideos(withDb: WithDb, line: Line, child: FamilyChild, language: VideoLanguage = child.language, deps: FinderDeps = {}): Promise<VideoPick[]> {
  // 1. The cached picks, and whether a refresh is due and this request may run it.
  const found = await withDb(async (db): Promise<{ cached: VideoPick[]; due: string[]; days: number } | { refresh: Refresh }> => {
    const days = await setting(db, 'family.video_pick_days', 30);
    const cached = await readPicks(db, line.key, language, days);
    // A free topic with no picks of its own: the same topic in the same class band, if it has some (no search, no claim).
    if (cached.picks.length === 0 && cached.refreshDue) {
      const near = await bandPicks(db, line.key, language, days);
      if (near.picks.length > 0) return { cached: near.picks, due: near.due, days };
    }
    if (!cached.refreshDue || searchedEmptyLately(line.key, language)) return { cached: cached.picks, due: cached.checkDue, days };
    const perDay = await setting(db, 'family.video_searches_per_day', 90);
    // Videos from channels Control has not listed only when Control turns them on (C230-R; off unless set to 1).
    const wider = (await setting(db, 'family.video_wider_catalogue', 0)) === 1;
    const minViews = await setting(db, 'family.video_min_views', MIN_VIEWS);
    const claimed = (await db.query(`select content.claim_video_topic($1, $2, $3) as ok`, [line.key, language, EMPTY_DAYS])).rows[0]?.ok === true;
    if (!claimed) return { cached: cached.picks, due: cached.checkDue, days };
    const curated = await curatedFor(db, line, child, language).catch(() => []);
    return { refresh: { checkDue: cached.checkDue, language, days, perDay, wider, minViews, curated, cached: cached.picks, staleAuto: cached.staleAuto } };
  });
  if ('cached' in found) {
    // Served from the cache: no YouTube search. A pick not checked for a week is checked once now (oEmbed); a dead one is dropped.
    const picks = await dropDead(withDb, found.cached, found.due, deps.oembedFetch);
    if (picks.length > 0) await noteCache(withDb, 'hit', line.key, language);
    return picks;
  }

  // 2. A refresh: the channels Control listed, then the key and the day's searches.
  const r = found.refresh;
  const channels = await videoChannels();
  // With KEEP curated videos for the topic, they are only read (one details call): no search is spent.
  const plan = { ...videoPlan(line, child, channels, r.language), curatedIds: r.curated, searchOff: r.curated.length >= KEEP };
  const prepared = await withDb((db): Promise<PreparedVideos> => prepareVideoSearch(db, { day: indiaDate(), perDay: r.perDay, plan }));
  if (!prepared.ok) {
    await finish(withDb, line, r.language, null);
    return dropStale(withDb, line, r);
  }

  // 3. The provider, with no connection held. A cache miss: this one spends a YouTube search.
  await noteCache(withDb, 'miss', line.key, r.language);
  const result = await prepared.find();
  if (!result.ok) {
    noteSearch(line.key, r.language, { failed: true });
    // The claim is kept: no request searches this topic again for ten minutes while the provider is down.
    return dropStale(withDb, line, r);
  }
  // A video Gemini already judged unsafe or wrong is never kept (content.video_hidden).
  const ids = result.candidates.map((c) => c.videoId);
  const hidden = new Set(
    ids.length
      ? await withDb(async (db) => (await db.query(`select v as video_id from unnest($1::text[]) as v where content.video_hidden(v)`, [ids])).rows.map((x) => String(x.video_id))).catch(() => ids)
      : []
  );
  const curated = new Set(r.curated);
  const candidates = result.candidates.filter((c) => !hidden.has(c.videoId) && (curated.has(c.videoId) || inLanguage(c, r.language)));
  const how = { topicTitles: [line.topicEn ?? '', line.title, line.forms?.en ?? '', line.forms?.local ?? '', ...(line.forms?.typed ?? [])], language: r.language, channels, wider: r.wider, minViews: r.minViews, curated };
  // SponsorBlock for the best few at once (none known: unchanged), then the final ranking.
  const top = rankVideos(candidates, { ...how, keep: PROMO_LOOKUPS });
  const promo = await promoFor(top.map((p) => ({ videoId: p.video_id, durationS: p.duration_s })), deps.sponsorFetch).catch(() => new Map());
  const ranked = rankVideos(candidates, { ...how, promo });
  // A topic named only by romanised or untranslated words is never remembered as empty: its words may be the reason nothing matched.
  const raw = line.forms?.raw === true;
  if (!(raw && ranked.length === 0)) noteSearch(line.key, r.language, { found: ranked.length });

  // 4. Saved (a reviewer's pinned and rejected picks stay as they are) and read back as the family sees them.
  const saved = await withDb(async (db) => {
    await savePicks(db, line.key, r.language, ranked);
    // Raw and empty: the claim is left open (not written as found = 0), so it frees itself after ten minutes instead of staying empty for days.
    if (!(raw && ranked.length === 0)) await db.query(`select content.finish_video_topic($1, $2, $3)`, [line.key, r.language, ranked.length]);
    return (await readPicks(db, line.key, r.language, r.days)).picks;
  });
  // 5. Gemini judges what is shown, in the background: the child never waits, and nothing it does can fail this.
  try {
    (deps.review ?? scheduleReviews)(saved.map((p) => p.videoId));
  } catch {
    // never the child's problem
  }
  return saved;
}

// No refresh could run (no key, the day's searches spent, the provider down): the pinned picks are still shown, and
// automatic picks older than family.video_pick_days are dropped (the provider's storage rules), spending no search.
async function dropStale(withDb: WithDb, line: Line, r: Refresh): Promise<VideoPick[]> {
  if (r.staleAuto > 0) await withDb((db) => savePicks(db, line.key, r.language, []));
  return r.cached;
}

async function finish(withDb: WithDb, line: Line, language: VideoLanguage, found: number | null): Promise<void> {
  await withDb((db) => db.query(`select content.finish_video_topic($1, $2, $3)`, [line.key, language, found])).catch(() => {});
}
