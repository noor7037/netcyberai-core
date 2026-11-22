import { oneAtATime } from './savepoint';
import { isLangCode, type LangCode } from './languages';
import { embedUrl } from './videos';

// C522: a child's tap on "See video" (POST /api/family/videos/click). Counted per child, video and India day in
// family.video_clicks (ids, the topic key and a time only), on the family's own transaction: the table's policies keep
// every row to its account and, on a child's own phone, that child. Only a video the cache actually offered for that
// topic and language (content.video_picks, not rejected; blocking a channel rejects its picks at once) is counted and
// given its embed; an id the
// phone made up is refused. A child's taps a day are capped (CLICKS_PER_DAY), like the other family limits.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export const CLICKS_PER_DAY = 300;
const TOPIC = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export type VideoClick = { topicKey: string; videoId: string; lang: LangCode };
export type ClickResult = { ok: true; embed: string; clicks: number } | { ok: false; reason: 'unknown' | 'too_many' | 'not_ready' };

// The body, exactly: { topicKey, videoId, lang }, each checked; anything else is null.
export function checkClick(body: Record<string, unknown>): VideoClick | null {
  const keys = Object.keys(body).sort().join(',');
  if (keys !== 'lang,topicKey,videoId') return null;
  const { topicKey, videoId, lang } = body;
  if (typeof topicKey !== 'string' || !TOPIC.test(topicKey) || typeof videoId !== 'string' || !VIDEO_ID.test(videoId) || !isLangCode(lang)) return null;
  return { topicKey, videoId, lang };
}

let seq = 0;
export function recordClick(db: Db, accountId: string, childId: string, c: VideoClick, day: string): Promise<ClickResult> {
  return oneAtATime(db, () => recordClickNow(db, accountId, childId, c, day));
}

async function recordClickNow(db: Db, accountId: string, childId: string, c: VideoClick, day: string): Promise<ClickResult> {
  const sp = `video_click_${++seq % 1_000_000}`;
  await db.query(`savepoint ${sp}`);
  try {
    const out = await record(db, accountId, childId, c, day);
    await db.query(`release savepoint ${sp}`);
    return out;
  } catch (err) {
    if ((err as { code?: string }).code !== '42P01') throw err;
    await db.query(`rollback to savepoint ${sp}`);
    return { ok: false, reason: 'not_ready' };
  }
}

async function record(db: Db, accountId: string, childId: string, c: VideoClick, day: string): Promise<ClickResult> {
  const offered = (
    await db.query(
      `select p.start_s from content.video_picks p
        where p.topic_key = $1 and p.language = $2 and p.video_id = $3 and p.status <> 'rejected'`,
      [c.topicKey, c.lang, c.videoId]
    )
  ).rows[0];
  if (!offered) return { ok: false, reason: 'unknown' };
  const today = Number((await db.query(`select coalesce(sum(clicks), 0)::int as n from family.video_clicks where child_id = $1 and day = $2::date`, [childId, day])).rows[0]?.n ?? 0);
  if (today >= CLICKS_PER_DAY) return { ok: false, reason: 'too_many' };
  const { rows } = await db.query(
    `insert into family.video_clicks as v (account_id, child_id, video_id, topic_key, day) values ($1, $2, $3, $4, $5::date)
     on conflict (child_id, video_id, day) do update set clicks = least(v.clicks + 1, 1000), topic_key = excluded.topic_key, last_at = now()
     returning clicks`,
    [accountId, childId, c.videoId, c.topicKey, day]
  );
  return { ok: true, embed: embedUrl({ videoId: c.videoId, startS: Number(offered.start_s ?? 0) }), clicks: Number(rows[0]?.clicks ?? 1) };
}
