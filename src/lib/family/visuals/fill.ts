import { FILLED_TYPES, checkStoredBlock, type Block, type ImagePhoto, type ImageQuery, type VideoItem, type Videos } from '@/lib/family/blocks';
import { setting } from '@/lib/family/learning';
import { searchCommons, type CommonsPhoto } from './commons';
import { answerVideos, type AnswerVideos, type VideoTopic } from '@/lib/family/answer-videos';
import { familyModuleOn } from '@/lib/family/flags';

// The server's half of the visual blocks (W9-C, docs/39 §3), run once on an answer's checked blocks before they are
// kept: an `image` block becomes its licensed photograph (content.image_picks, else one Commons search) or is dropped,
// and a `videos` block becomes up to four of the chapter's checked picks (content.video_picks) or is dropped.
//
// No database connection is held while Commons answers (as the video finder, F1-3): the cached photograph and the
// videos in one short transaction, the search with none, the new photograph saved in a second. Anything that fails
// drops the photograph or the videos, never the answer. `emit`: each filled block is sent to the phone as it is ready
// (the phone puts it where the model's unfilled block stood).

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
export type WithDb = <T>(fn: (db: Db) => Promise<T>) => Promise<T>;
export type FillOptions = {
  chapterKey: string | null;
  lang: string;
  // W19-F (C472), C522: the answer's topic (answer-videos.ts: the matched syllabus line, a drawing template, or the best
  // passage's chapter), the child and the language: a `videos` block follows the answer whether or not the model asked
  // for one, two to four of the topic's picks, refreshed from the provider when they are stale. Only with Control's
  // `videos` module on for this family; never from a child's words (the search is our own catalog text).
  videos?: VideoTopic;
  emit?: (b: ImagePhoto | Videos) => void;
  search?: (query: string) => Promise<CommonsPhoto | null>;
};

export const IMAGE_PICK_DAYS = 30;
export const VIDEO_ITEMS = 4;
const TOPIC = /^[a-z0-9][a-z0-9._-]{2,119}$/;

// One cache line per query, however it was spaced or capitalised.
export const queryKey = (q: string): string => q.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);

async function readImagePick(db: Db, key: string): Promise<CommonsPhoto | null> {
  const { rows } = await db.query(
    `select url, page_url, author, licence, licence_url from content.image_picks where query_key = $1 and fetched_at >= now() - make_interval(days => $2::int)`,
    [key, IMAGE_PICK_DAYS]
  );
  const r = rows[0];
  return r ? { url: String(r.url), pageUrl: String(r.page_url), author: String(r.author), licence: String(r.licence), licenceUrl: r.licence_url ? String(r.licence_url) : null } : null;
}

async function readVideoItems(db: Db, topicKey: string, language: 'en' | 'hi'): Promise<VideoItem[]> {
  const days = await setting(db, 'family.video_pick_days', 30);
  const { rows } = await db.query(
    `select video_id, title, channel_title, duration_s from content.video_picks
      where topic_key = $1 and language = $2 and status <> 'rejected' and (status = 'pinned' or fetched_at >= now() - make_interval(days => $3::int))
      order by (status = 'pinned') desc, score desc, video_id
      limit $4`,
    [topicKey, language, Math.max(0, Math.floor(days)), VIDEO_ITEMS]
  );
  return rows.map((r) => ({ videoId: String(r.video_id), title: String(r.title), channel: String(r.channel_title), seconds: Number(r.duration_s) }));
}

// The photograph as a block, checked again as any kept block is (host, page, licence, credit), or null.
const photoBlock = (q: ImageQuery, p: CommonsPhoto): ImagePhoto | null =>
  checkStoredBlock({ type: 'image', url: p.url, caption: q.caption, credit: p.author, licence: p.licence, source: p.pageUrl }) as ImagePhoto | null;
const videosBlock = (items: VideoItem[]): Videos | null => (items.length ? (checkStoredBlock({ type: 'videos', items }) as Videos | null) : null);

const withoutVisuals = (blocks: Block[]) => blocks.filter((b) => !FILLED_TYPES.includes(b.type));

export async function fillVisuals(withDb: WithDb, blocks: Block[], opts: FillOptions): Promise<Block[]> {
  const image = blocks.find((b): b is ImageQuery & Block => b.type === 'image' && 'query' in b);
  const asked = blocks.some((b) => b.type === 'videos');
  const follow = !!opts.videos;
  if (!blocks.some((b) => FILLED_TYPES.includes(b.type)) && !follow) return blocks;
  try {
    const language = opts.lang === 'hi' ? 'hi' : 'en';
    const key = image ? queryKey(image.query) : null;
    // The model asked for videos and no answer topic was named: the open chapter's picks, as before (W9-C).
    const topic = asked && !follow && opts.chapterKey && TOPIC.test(opts.chapterKey) ? opts.chapterKey : null;
    const first = await withDb(async (db) => ({
      cached: key ? await readImagePick(db, key) : null,
      on: opts.videos ? await familyModuleOn(db, 'videos', opts.videos.accountId) : false,
      items: topic ? await readVideoItems(db, topic, language) : [],
    }));
    // The answer's topic: its picks in the child's language, else the fallback (a search from the day's quota when due).
    // The fill's `withDb` opens the family's own transaction client, which is what the finder's provider step takes.
    const answered: AnswerVideos | null = opts.videos && first.on ? await answerVideos(withDb as unknown as Parameters<typeof answerVideos>[0], opts.videos).catch(() => null) : null;
    let photo = first.cached;
    if (image && key && !photo) {
      photo = await (opts.search ?? searchCommons)(image.query).catch(() => null);
      const found = photo;
      // A photograph that cannot be kept is still shown this once; the next answer searches again.
      if (found) await withDb((db) => db.query(`select content.save_image_pick($1, $2, $3, $4, $5, $6)`, [key, found.url, found.pageUrl, found.author, found.licence, found.licenceUrl])).catch(() => {});
    }
    const filledImage = image && photo ? photoBlock(image, photo) : null;
    const filledVideos = answered ? answerBlock(answered) : topic ? videosBlock(first.items) : null;
    const out: Block[] = [];
    for (const b of blocks) {
      if (b.type === 'image') {
        if (b === image && filledImage) out.push({ ...filledImage, ...(b.id ? { id: b.id } : {}) });
      } else if (b.type === 'videos') {
        if (filledVideos && !out.some((x) => x.type === 'videos')) out.push({ ...filledVideos, ...(b.id ? { id: b.id } : {}) });
      } else out.push(b);
    }
    // The answer did not ask for videos: the topic's follow the last block.
    if (!asked && filledVideos) out.push(filledVideos);
    if (filledImage) opts.emit?.(filledImage);
    if (filledVideos) opts.emit?.(filledVideos);
    return out;
  } catch {
    return withoutVisuals(blocks);
  }
}

// The answer's picks as a block, with the cache line they came from (the "See video" tap is checked against it).
function answerBlock(a: AnswerVideos): Videos | null {
  const items = a.picks.slice(0, VIDEO_ITEMS).map((p) => ({ videoId: p.videoId, title: p.title, channel: p.channelTitle, seconds: p.durationS, ...(p.startS > 0 ? { start: p.startS } : {}) }));
  if (!items.length) return null;
  return checkStoredBlock({ type: 'videos', items, topicKey: a.topicKey, lang: a.language, ...(a.wanted ? { wanted: a.wanted } : {}) }) as Videos | null;
}
