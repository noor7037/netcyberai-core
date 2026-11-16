import type { WithDb } from '@/lib/family/video-finder';
import { CHECK_DAYS, KEEP, type VideoLanguage, type VideoPick } from '@/lib/family/videos';

// The video cache's extras (follow-up of 16 Nov 2026), on the tables the finder already has (content.video_picks,
// content.video_topic_searches): removed or private videos are marked dead and never served again, a pick is checked
// against YouTube's oEmbed only when it is served and was last checked over CHECK_DAYS ago, a free topic with no picks
// of its own is served from the same topic in the same class band, and every answer counts as a cache hit or miss.

// oEmbed needs no key and costs no quota. 404: removed. 401 or 403: private or not embeddable. Anything else (a network
// error, a 5xx) proves nothing: the pick stays and is checked again next time it is served.
const OEMBED = 'https://www.youtube.com/oembed?format=json&url=';
const OEMBED_MS = 2500;

export async function dropDead(withDb: WithDb, picks: VideoPick[], due: readonly string[], fetcher: typeof fetch = fetch): Promise<VideoPick[]> {
  const ids = picks.map((p) => p.videoId).filter((id) => due.includes(id));
  if (ids.length === 0) return picks;
  const dead = new Set<string>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const res = await fetcher(`${OEMBED}${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(OEMBED_MS) });
        if (res.status === 404 || res.status === 401 || res.status === 403) {
          dead.add(id);
          await withDb((db) => db.query(`select content.mark_video_dead($1)`, [id])).catch(() => {});
        } else if (res.ok) await withDb((db) => db.query(`select content.touch_video_checked($1)`, [id])).catch(() => {});
      } catch {
        // unknown: served as it is
      }
    })
  );
  if (dead.size > 0) console.info(`[videos] dead ${[...dead].join(',')}`);
  return picks.filter((p) => !dead.has(p.videoId));
}

// A free topic is `free.c<class>.<slug>`: the same slug in another class of the same band (1-2, 3-5, 6-8, 9-10, 11-12).
const BANDS: readonly (readonly number[])[] = [[1, 2], [3, 4, 5], [6, 7, 8], [9, 10], [11, 12]];
export const bandOf = (topicKey: string): { slug: string; classes: number[] } | null => {
  const m = /^free\.c(\d{1,2})\.([a-z0-9-]{2,100})$/.exec(topicKey);
  if (!m) return null;
  const band = BANDS.find((b) => b.includes(Number(m[1])));
  return band ? { slug: m[2], classes: band.filter((c) => c !== Number(m[1])) } : null;
};

type Q = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
export async function bandPicks(db: Q, topicKey: string, language: VideoLanguage, days: number): Promise<{ picks: VideoPick[]; due: string[] }> {
  const b = bandOf(topicKey);
  if (!b || b.classes.length === 0) return { picks: [], due: [] };
  const keys = b.classes.map((c) => `free.c${c}.${b.slug}`);
  const rows = await db
    .query(
      `select video_id, title, channel_title, duration_s, start_s, (checked_at is null or checked_at < now() - make_interval(days => $4::int)) as check_due
         from content.video_picks p
        where topic_key = any($1::text[]) and language = $2 and status <> 'rejected' and dead_at is null
          and (status = 'pinned' or fetched_at >= now() - make_interval(days => $3::int))
          and not content.video_hidden(p.video_id)
        order by (status = 'pinned') desc, score desc, video_id limit $5`,
      [keys, language, Math.max(0, Math.floor(days)), CHECK_DAYS, KEEP * 3]
    )
    .then((r) => r.rows, () => []);
  const seen = new Set<string>();
  const unique = rows.filter((r) => (seen.has(String(r.video_id)) ? false : (seen.add(String(r.video_id)), true))).slice(0, KEEP);
  return {
    picks: unique.map((r) => ({ videoId: String(r.video_id), title: String(r.title), channelTitle: String(r.channel_title), durationS: Number(r.duration_s), startS: Number(r.start_s) })),
    due: unique.filter((r) => r.check_due === true).map((r) => String(r.video_id)),
  };
}

// One cache hit (an answer served with no YouTube call) or miss (a YouTube search ran), counted for Control and logged.
export function noteCache(withDb: WithDb, kind: 'hit' | 'miss', topicKey: string, language: VideoLanguage): Promise<void> {
  console.info(`[videos] cache ${kind} ${topicKey} ${language}`);
  return withDb((db) => db.query(`select content.note_video_cache($1)`, [kind])).then(() => undefined, () => undefined);
}
