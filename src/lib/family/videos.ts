import type { VideoCandidate, VideoChannel, VideoPlan } from '@/lib/ai/platform';
import { VIDEO_REVIEW_MIN, videoReviewHides } from '@/lib/ai/video-review-rule';
import type { FamilyChild } from './children';
import { languageInfo, type LangCode } from './languages';
import type { Line } from './resolver';

// The video finder's ranking and its cache (docs/family-app/02 §5, 03 §8; M2-5, C279). Ranked in code on what the
// provider gives — channel, embedding, duration, captions, language and the title's words — with no AI call. The best
// two (KEEP) per topic and language are kept in content.video_picks (through content.save_video_picks), served while fresh
// (family.video_pick_days; a reviewer's pinned pick always), refreshed when stale, and never shown when rejected or
// from a blocked channel. The search words come from the catalog line, never from a child.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

// C522: any language a child can choose (languages.ts); YouTube's relevanceLanguage takes the same ISO 639-1 codes.
export type VideoLanguage = LangCode;
// What the phone gets: enough to draw the card and the embed, nothing else.
export type VideoPick = { videoId: string; title: string; channelTitle: string; durationS: number; startS: number };
// YouTube's privacy-enhanced embed: no autoplay, no related videos from other channels, starting at the matched chapter.
export function embedUrl(p: Pick<VideoPick, 'videoId' | 'startS'>): string {
  const q = new URLSearchParams({ rel: '0', modestbranding: '1' });
  if (p.startS > 0) q.set('start', String(Math.floor(p.startS)));
  return `https://www.youtube-nocookie.com/embed/${p.videoId}?${q.toString()}`;
}
export type RankedPick = { video_id: string; channel_id: string; channel_title: string; title: string; duration_s: number; start_s: number; captions: boolean; score: number; promo_share?: number | null };

// Two per topic and language (Noor, 16 Nov 2026; four since C522, three before): an answer shows two.
export const KEEP = 2;
// The quality gate's defaults: Control's family.video_min_views, and the youngest video shown (a new upload has had no
// time to be seen, liked or reported).
export const MIN_VIEWS = 5000;
export const MIN_AGE_DAYS = 30;
// SponsorBlock (sponsorblock.ts): a video whose sponsor, self-promotion and "subscribe" segments are more than this
// share of it is skipped; a lighter one loses promoShare × PROMO_PENALTY points and starts after an opening sponsor.
export const PROMO_SKIP = 0.15;
export const PROMO_PENALTY = 50;
export type Promo = { promoShare: number; startAfterS: number };
const MIN_S = 120;
const MAX_S = 25 * 60;
const FOCUSED_MAX_S = 15 * 60;

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
// catalog has one, and the word "Hindi" so the provider prefers videos in it. C522: in another Indian language, the
// English title with that language's English name ("Tamil"), and the provider asked for that language.
// A topic with forms (a typed question the tutor named, src/lib/family/intent.ts): the search uses the term in the language's own script when there
// is one (Hindi: the Devanagari term), and the English term otherwise, never the typed letters when the tutor named the topic.
export function videoQuery(line: Pick<Line, 'subject' | 'topicEn' | 'title'> & { forms?: Line['forms'] }, child: Pick<FamilyChild, 'classLevel' | 'language'>, language: VideoLanguage = child.language): string {
  const hi = language === 'hi';
  const local = line.forms?.local;
  const scripted = !!local && (language === 'en' ? false : (SCRIPT[language] ?? /[ऀ-ॿ]/).test(local));
  const title = scripted ? local! : line.forms?.en ? line.forms.en : hi ? line.title : (line.topicEn ?? line.title);
  const subject = SUBJECT_WORDS[line.subject]?.[hi ? 'hi' : 'en'] ?? line.subject.replace(/_/g, ' ');
  const cls = child.classLevel >= 1 ? (hi ? `कक्षा ${child.classLevel}` : `class ${child.classLevel}`) : '';
  const named = hi ? 'Hindi' : language === 'en' ? '' : languageInfo(language).english;
  return [title, subject, cls, named].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

// The script each regional language is written in (Hindi and Marathi share Devanagari, Bengali and Assamese theirs).
const SCRIPT: Partial<Record<VideoLanguage, RegExp>> = {
  bn: /[\u0980-\u09FF]/, as: /[\u0980-\u09FF]/, te: /[\u0C00-\u0C7F]/, ta: /[\u0B80-\u0BFF]/, gu: /[\u0A80-\u0AFF]/, kn: /[\u0C80-\u0CFF]/,
  ml: /[\u0D00-\u0D7F]/, or: /[\u0B00-\u0B7F]/, pa: /[\u0A00-\u0A7F]/, ur: /[\u0600-\u06FF]/, mr: /[\u0900-\u097F]/,
};
// Whether a candidate is in a regional language: its audio or default language says so, or (with none given) its title
// is in that language's script (Marathi also names itself, as Devanagari alone may be Hindi). English and Hindi keep
// the ranking's own preference and filter nothing.
export function inLanguage(c: Pick<VideoCandidate, 'language' | 'title'>, language: VideoLanguage): boolean {
  if (language === 'en' || language === 'hi') return true;
  if (c.language) return c.language.startsWith(language);
  if (language === 'mr') return /marathi|मराठी/i.test(c.title);
  return SCRIPT[language]?.test(c.title) ?? false;
}

// Official channels first, then approved; each list turned by the topic, so with more listed channels than a refresh
// searches (CHANNEL_SEARCHES in the AI platform), different topics search different ones.
export function videoPlan(line: Line, child: FamilyChild, channels: VideoChannel[], language: VideoLanguage = child.language): VideoPlan {
  let h = 0;
  for (const ch of line.key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const turn = <T,>(list: T[]) => (list.length ? [...list.slice(h % list.length), ...list.slice(0, h % list.length)] : list);
  const preferred = [...turn(channels.filter((c) => c.kind === 'official')), ...turn(channels.filter((c) => c.kind === 'approved'))];
  return { query: videoQuery(line, child, language), language, channelIds: preferred.map((c) => c.channelId) };
}

// Ranks what the provider returned and keeps the best KEEP. Only official and approved channels, unless Control turns
// on the wider catalogue (family.video_wider_catalogue; off for the pilot, C230-R: an automatic pick reaches a child
// before any person has seen it, so an unlisted channel waits until it is listed). Never: a blocked channel, a video that may not be embedded,
// is not public or is age-restricted, one shorter than 30 seconds or longer than ten hours, or one whose title and
// chapters share no word with the topic.
//
// The quality gate (Noor, 16 Nov 2026): never a video with a declared paid product placement; never one published in
// the last MIN_AGE_DAYS days or seen fewer than `minViews` times (Control's family.video_min_views), unless a person
// chose it (`curated`, content.curated_topic_videos: listed or not, any title, always first). A video made for kids and
// one from a channel Control marked as running no ads rank first; a high like-to-view share ranks higher. `promo`:
// SponsorBlock's answer per video (looked up by the caller for the top few; none known is no change). `keep`: how many
// are kept (the caller ranks once wider, to look up the top few's promotions).
export function rankVideos(
  candidates: VideoCandidate[],
  a: { topicTitles: string[]; language: VideoLanguage; channels: VideoChannel[]; wider?: boolean; minViews?: number; curated?: ReadonlySet<string>; promo?: ReadonlyMap<string, Promo>; now?: number; keep?: number }
): RankedPick[] {
  const kind = new Map(a.channels.map((c) => [c.channelId, c.kind]));
  const noAds = new Set(a.channels.filter((c) => c.noAds && c.kind !== 'blocked').map((c) => c.channelId));
  const topicWords = Array.from(new Set(a.topicTitles.flatMap(words)));
  // A title that matches ANY form of the topic (English term, the child's script, the typed words) counts: they are all in topicTitles.
  const minViews = Math.max(0, a.minViews ?? MIN_VIEWS);
  const youngest = (a.now ?? Date.now()) - MIN_AGE_DAYS * 86_400_000;
  const ranked: RankedPick[] = [];
  for (const c of candidates) {
    const k = kind.get(c.channelId);
    const curated = a.curated?.has(c.videoId) === true;
    if (k === 'blocked' || !c.embeddable || !c.isPublic || c.ageRestricted || c.hasPaidPlacement) continue;
    if (!k && !a.wider && !curated) continue;
    if (c.durationS < 30 || c.durationS > 36000 || !c.title) continue;
    if (!curated) {
      if ((c.viewCount ?? 0) < minViews) continue;
      if (c.publishedAt && Date.parse(c.publishedAt) > youngest) continue;
    }
    const promo = a.promo?.get(c.videoId);
    if (promo && promo.promoShare > PROMO_SKIP) continue;
    const inTitle = overlap(topicWords, c.title);
    const chapters = c.chapters.filter((ch) => ch.s < c.durationS).map((ch) => ({ ...ch, fit: overlap(topicWords, ch.title) }));
    const best = chapters.reduce<(typeof chapters)[number] | null>((b, ch) => (ch.fit > (b?.fit ?? 0) ? ch : b), null);
    if (inTitle === 0 && !best && !curated) continue;
    let score = curated ? 200 : 0;
    score += k === 'official' ? 40 : k === 'approved' ? 25 : 0;
    score += 30 * inTitle + 10 * (best?.fit ?? 0);
    // Focused videos of about 2 to 15 minutes first; a long chapter lecture only as a last resort, unless it has a chapter that
    // matches the topic (then it starts there).
    score += c.durationS >= MIN_S && c.durationS <= FOCUSED_MAX_S ? 30 : c.durationS <= MAX_S && c.durationS >= 60 ? 8 : c.durationS < 60 ? -10 : best && best.fit > 0 ? 0 : c.durationS <= 45 * 60 ? -8 : -30;
    score += c.captions ? 8 : 0;
    if (c.language) score += c.language.startsWith(a.language) ? 8 : -6;
    // Ad-safe first: made for kids (YouTube shows no personalised ads on it) and a channel Control marked as ad-free.
    score += c.madeForKids ? 45 : 0;
    score += noAds.has(c.channelId) ? 35 : 0;
    // Liked by those who watched it: up to 10 points at one like in twenty views.
    if (c.viewCount && c.likeCount !== null && c.viewCount > 0) score += Math.min(10, (c.likeCount / c.viewCount) * 200);
    if (promo) score -= promo.promoShare * PROMO_PENALTY;
    const chapterStart = best && best.s > 0 ? best.s : 0;
    const start = Math.max(chapterStart, promo ? Math.floor(promo.startAfterS) : 0);
    ranked.push({
      video_id: c.videoId,
      channel_id: c.channelId,
      channel_title: (c.channelTitle || c.channelId).slice(0, 120),
      title: c.title.slice(0, 200),
      duration_s: c.durationS,
      start_s: start < c.durationS - 1 ? start : chapterStart,
      captions: c.captions,
      score: Math.round(score * 100) / 100,
      promo_share: promo ? Math.round(promo.promoShare * 1000) / 1000 : null,
    });
  }
  return ranked.sort((x, y) => y.score - x.score || x.video_id.localeCompare(y.video_id)).slice(0, Math.max(0, a.keep ?? KEEP));
}

// The topic's picks a family may see (a rejected one is hidden by the table's own rule): pinned first, then by score.
// Shown: the pinned and the automatic ones fetched within `days`, less any Gemini's review hides. An older automatic pick is never shown; it is replaced
// at the next refresh, or dropped when none can run. A refresh is due when no automatic pick is fresh and fewer than
// KEEP are pinned.
// Gemini's review (video-review.ts): a video judged less than safe for a child or wrong is never shown, pinned or not
// (the same rule as content.video_hidden, which the family's reads use).
export const REVIEW_MIN_SAFETY = VIDEO_REVIEW_MIN.childSafety;
export const REVIEW_MIN_ACCURACY = VIDEO_REVIEW_MIN.accuracy;
export const reviewHides = videoReviewHides;
// `checkDue`: served picks not checked against YouTube for CHECK_DAYS (checked lightly, when served, never in bulk).
export const CHECK_DAYS = 7;
export type CachedPicks = { picks: VideoPick[]; refreshDue: boolean; staleAuto: number; checkDue: string[] };
export async function readPicks(db: Db, topicKey: string, language: VideoLanguage, days: number): Promise<CachedPicks> {
  const { rows } = await db.query(
    `select video_id, title, channel_title, duration_s, start_s, status, (fetched_at >= now() - make_interval(days => $3::int)) as fresh,
            (checked_at is null or checked_at < now() - make_interval(days => $4::int)) as check_due
       from content.video_picks p
      where topic_key = $1 and language = $2 and status <> 'rejected' and dead_at is null
        and not content.video_hidden(p.video_id)
      order by (status = 'pinned') desc, score desc, video_id`,
    [topicKey, language, Math.max(0, Math.floor(days)), CHECK_DAYS]
  );
  const shown = rows.filter((r) => r.status === 'pinned' || r.fresh === true);
  const pinned = rows.filter((r) => r.status === 'pinned').length;
  const freshAuto = rows.filter((r) => r.status === 'auto' && r.fresh === true).length;
  return {
    picks: shown.slice(0, KEEP).map((r) => ({ videoId: String(r.video_id), title: String(r.title), channelTitle: String(r.channel_title), durationS: Number(r.duration_s), startS: Number(r.start_s) })),
    refreshDue: freshAuto === 0 && pinned < KEEP,
    staleAuto: rows.filter((r) => r.status === 'auto' && r.fresh !== true).length,
    checkDue: shown.slice(0, KEEP).filter((r) => r.check_due === true).map((r) => String(r.video_id)),
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

// The videos a reviewer chose for one chapter (S5, C378): only a pinned pick of the chapter's own key, which Control's
// Videos page adds (content/video-picks.ts). The finder's automatic picks are for syllabus topics and are not shown here.
// A rejected pick is hidden by the table's own rule. A table not created yet reads as none.
export async function readChapterVideos(db: Db, chapterKey: string, language: VideoLanguage): Promise<VideoPick[]> {
  await db.query('savepoint chapter_videos');
  try {
    const { rows } = await db.query(
      `select video_id, title, channel_title, duration_s, start_s from content.video_picks where topic_key = $1 and language = $2 and status = 'pinned' order by score desc, video_id limit $3`,
      [chapterKey, language, KEEP]
    );
    await db.query('release savepoint chapter_videos');
    return rows.map((r) => ({ videoId: String(r.video_id), title: String(r.title), channelTitle: String(r.channel_title), durationS: Number(r.duration_s), startS: Number(r.start_s) }));
  } catch (err) {
    if ((err as { code?: string }).code !== '42P01') throw err;
    await db.query('rollback to savepoint chapter_videos');
    return [];
  }
}
