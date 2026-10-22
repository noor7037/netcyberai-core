import type { VideoCandidate, VideoChannel, VideoPlan } from '@/lib/ai/platform';
import type { FamilyChild } from './children';
import type { Line } from './resolver';

// The video finder's ranking and its cache (docs/family-app/02 §5, 03 §8; M2-5, C279). Ranked in code on what the
// provider gives — channel, embedding, duration, captions, language and the title's words — with no AI call. The best
// three per topic and language are kept in content.video_picks (through content.save_video_picks), served while fresh
// (family.video_pick_days; a reviewer's pinned pick always), refreshed when stale, and never shown when rejected or
// from a blocked channel. The search words come from the catalog line, never from a child.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export type VideoLanguage = 'en' | 'hi';
// What the phone gets: enough to draw the card and the embed, nothing else.
export type VideoPick = { videoId: string; title: string; channelTitle: string; durationS: number; startS: number };
export type RankedPick = { video_id: string; channel_id: string; channel_title: string; title: string; duration_s: number; start_s: number; captions: boolean; score: number };

export const KEEP = 3;
const MIN_S = 120;
const MAX_S = 25 * 60;

const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'its', 'their', 'our', 'your', 'are', 'was', 'were', 'how', 'what', 'why', 'when', 'which', 'who',
  'this', 'that', 'these', 'those', 'part', 'class', 'chapter', 'lesson', 'ncert', 'cbse', 'explained', 'explanation', 'introduction', 'intro',
  'full', 'video', 'hindi', 'english', 'easy', 'best', 'all', 'one', 'two', 'about', 'more', 'other', 'some', 'them', 'they', 'you',
  'का', 'की', 'के', 'में', 'और', 'से', 'को', 'है', 'हैं', 'एक', 'पर', 'यह', 'वह', 'भाग', 'अध्याय', 'कक्षा',
]);

// The meaningful words of a text, lower-case, in any script.
export function words(text: string): string[] {
  return (text.toLowerCase().normalize('NFC').match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).filter((w) => w.length >= 3 || (/[ऀ-ॿ]/.test(w) && w.length >= 2)).filter((w) => !STOP.has(w));
}

// The share of the topic's words found in a text (0 to 1). A word matches its plural or a longer form ("fraction"
// in "fractions").
export function overlap(topicWords: string[], text: string): number {
  const topic = Array.from(new Set(topicWords));
  if (!topic.length) return 0;
  const seen = words(text);
  const hit = topic.filter((t) => seen.some((w) => w === t || (t.length >= 4 && (w.startsWith(t) || t.startsWith(w)) && Math.min(w.length, t.length) >= 4)));
  return hit.length / topic.length;
}

const SUBJECT_WORDS: Record<string, { en: string; hi: string }> = {
  mathematics: { en: 'maths', hi: 'गणित' },
  science: { en: 'science', hi: 'विज्ञान' },
  evs: { en: 'EVS', hi: 'पर्यावरण' },
  social_science: { en: 'social science', hi: 'सामाजिक विज्ञान' },
  english: { en: 'English', hi: 'English' },
  hindi: { en: 'Hindi', hi: 'हिंदी' },
};

// The search: the topic's title, its subject and the class, from the catalog only. In Hindi, the Hindi title when the
// catalog has one, and the word "Hindi" so the provider prefers videos in it.
export function videoQuery(line: Pick<Line, 'subject' | 'topicEn' | 'title'>, child: Pick<FamilyChild, 'classLevel' | 'language'>): string {
  const hi = child.language === 'hi';
  const title = hi ? line.title : (line.topicEn ?? line.title);
  const subject = SUBJECT_WORDS[line.subject]?.[hi ? 'hi' : 'en'] ?? line.subject.replace(/_/g, ' ');
  const cls = child.classLevel >= 1 ? (hi ? `कक्षा ${child.classLevel}` : `class ${child.classLevel}`) : '';
  return [title, subject, cls, hi ? 'Hindi' : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

// Official channels first, then approved; each list turned by the topic, so with more listed channels than a refresh
// searches (CHANNEL_SEARCHES in the AI platform), different topics search different ones.
export function videoPlan(line: Line, child: FamilyChild, channels: VideoChannel[]): VideoPlan {
  let h = 0;
  for (const ch of line.key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const turn = <T,>(list: T[]) => (list.length ? [...list.slice(h % list.length), ...list.slice(0, h % list.length)] : list);
  const preferred = [...turn(channels.filter((c) => c.kind === 'official')), ...turn(channels.filter((c) => c.kind === 'approved'))];
  return { query: videoQuery(line, child), language: child.language === 'hi' ? 'hi' : 'en', channelIds: preferred.map((c) => c.channelId) };
}

// Ranks what the provider returned and keeps the best three. Never: a blocked channel, a video that may not be embedded,
// is not public or is age-restricted, one shorter than 30 seconds or longer than ten hours, or one whose title and
// chapters share no word with the topic.
export function rankVideos(candidates: VideoCandidate[], a: { topicTitles: string[]; language: VideoLanguage; channels: VideoChannel[] }): RankedPick[] {
  const kind = new Map(a.channels.map((c) => [c.channelId, c.kind]));
  const topicWords = Array.from(new Set(a.topicTitles.flatMap(words)));
  const ranked: RankedPick[] = [];
  for (const c of candidates) {
    const k = kind.get(c.channelId);
    if (k === 'blocked' || !c.embeddable || !c.isPublic || c.ageRestricted) continue;
    if (c.durationS < 30 || c.durationS > 36000 || !c.title) continue;
    const inTitle = overlap(topicWords, c.title);
    const chapters = c.chapters.filter((ch) => ch.s < c.durationS).map((ch) => ({ ...ch, fit: overlap(topicWords, ch.title) }));
    const best = chapters.reduce<(typeof chapters)[number] | null>((b, ch) => (ch.fit > (b?.fit ?? 0) ? ch : b), null);
    if (inTitle === 0 && !best) continue;
    let score = 0;
    score += k === 'official' ? 40 : k === 'approved' ? 25 : 0;
    score += 30 * inTitle + 10 * (best?.fit ?? 0);
    score += c.durationS >= MIN_S && c.durationS <= MAX_S ? 15 : c.durationS >= 60 && c.durationS <= 45 * 60 ? 3 : -10;
    score += c.captions ? 8 : 0;
    if (c.language) score += c.language.startsWith(a.language) ? 8 : -6;
    score += c.madeForKids ? 2 : 0;
    ranked.push({
      video_id: c.videoId,
      channel_id: c.channelId,
      channel_title: (c.channelTitle || c.channelId).slice(0, 120),
      title: c.title.slice(0, 200),
      duration_s: c.durationS,
      start_s: best && best.s > 0 ? best.s : 0,
      captions: c.captions,
      score: Math.round(score * 100) / 100,
    });
  }
  return ranked.sort((x, y) => y.score - x.score || x.video_id.localeCompare(y.video_id)).slice(0, KEEP);
}

// The topic's picks a family may see (a rejected one is hidden by the table's own rule): pinned first, then by score.
// Shown: the pinned and the automatic ones fetched within `days`. An older automatic pick is never shown; it is replaced
// at the next refresh, or dropped when none can run. A refresh is due when no automatic pick is fresh and fewer than
// three are pinned.
export type CachedPicks = { picks: VideoPick[]; refreshDue: boolean; staleAuto: number };
export async function readPicks(db: Db, topicKey: string, language: VideoLanguage, days: number): Promise<CachedPicks> {
  const { rows } = await db.query(
    `select video_id, title, channel_title, duration_s, start_s, status, (fetched_at >= now() - make_interval(days => $3::int)) as fresh
       from content.video_picks
      where topic_key = $1 and language = $2 and status <> 'rejected'
      order by (status = 'pinned') desc, score desc, video_id`,
    [topicKey, language, Math.max(0, Math.floor(days))]
  );
  const shown = rows.filter((r) => r.status === 'pinned' || r.fresh === true);
  const pinned = rows.filter((r) => r.status === 'pinned').length;
  const freshAuto = rows.filter((r) => r.status === 'auto' && r.fresh === true).length;
  return {
    picks: shown.slice(0, KEEP).map((r) => ({ videoId: String(r.video_id), title: String(r.title), channelTitle: String(r.channel_title), durationS: Number(r.duration_s), startS: Number(r.start_s) })),
    refreshDue: freshAuto === 0 && pinned < KEEP,
    staleAuto: rows.filter((r) => r.status === 'auto' && r.fresh !== true).length,
  };
}

export async function savePicks(db: Db, topicKey: string, language: VideoLanguage, picks: RankedPick[]): Promise<void> {
  await db.query(`select content.save_video_picks($1, $2, $3::jsonb)`, [topicKey, language, JSON.stringify(picks.slice(0, KEEP))]);
}

// A topic whose search found nothing suitable is not searched again for a while by this server process, and after the
// provider fails (a revoked key, its own quota spent) no topic is searched for a while, so neither can spend the day's
// searches on every visit (best effort per process: the daily quota is the hard limit).
const EMPTY_FOR_MS = 6 * 60 * 60 * 1000;
const FAILED_FOR_MS = 30 * 60 * 1000;
const recentlyEmpty = new Map<string, number>();
let failedAt: number | null = null;
export function searchedEmptyLately(topicKey: string, language: VideoLanguage, now = Date.now()): boolean {
  if (failedAt !== null && now - failedAt < FAILED_FOR_MS) return true;
  const at = recentlyEmpty.get(`${topicKey}:${language}`);
  return at !== undefined && now - at < EMPTY_FOR_MS;
}
export function noteSearch(topicKey: string, language: VideoLanguage, outcome: { failed: true } | { found: number }, now = Date.now()): void {
  if ('failed' in outcome) {
    failedAt = now;
    return;
  }
  failedAt = null;
  const key = `${topicKey}:${language}`;
  if (outcome.found > 0) recentlyEmpty.delete(key);
  else {
    if (recentlyEmpty.size > 5000) recentlyEmpty.clear();
    recentlyEmpty.set(key, now);
  }
}
// For tests: forget what this process noted.
export function forgetSearches(): void {
  recentlyEmpty.clear();
  failedAt = null;
}
