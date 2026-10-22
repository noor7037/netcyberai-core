import { writeAuditLog } from '@/lib/audit/log';
import type { Sql } from '@/lib/jobs/types';
import type { ContentActor } from './library';

// Control → Content → Videos (docs/family-app/03 §8; M2-5, C279). A reviewer reads the video finder's picks per topic,
// pins one (kept through every refresh and always served) or rejects one (never shown again for that topic), and keeps
// the channel lists: official and approved channels are searched first and ranked higher, a blocked channel is never
// shown (its picks are rejected at once). Run as the platform role in the request's own transaction, so each change and
// its audit row are written together; the audit holds ids and codes only. content.* holds no child's data.

export type VideoLanguage = 'en' | 'hi';
export type VideoChannelKind = 'official' | 'approved' | 'blocked';
export type ControlVideoPick = {
  topicKey: string;
  language: VideoLanguage;
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  durationS: number;
  startS: number;
  captions: boolean;
  score: number;
  status: 'auto' | 'pinned' | 'rejected';
  fetchedAt: string;
};
export type ControlVideoChannel = { channelId: string; title: string; kind: VideoChannelKind; addedAt: string };
export type VideoReview = { picks: ControlVideoPick[]; channels: ControlVideoChannel[]; searchesToday: number };
export type VideoChange = { ok: true } | { ok: false; reason: 'not_found' | 'bad_request' };

export const TOPIC_KEY = /^[a-z0-9][a-z0-9._-]{2,119}$/;
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const CHANNEL_ID = /^[A-Za-z0-9_-]{2,40}$/;
export const KINDS: readonly VideoChannelKind[] = ['official', 'approved', 'blocked'];
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

// The picks (filtered by a topic key or the start of one), newest topics first, and the channel lists.
export async function listVideoReview(db: Sql, a: { topic?: string; today: string }): Promise<VideoReview> {
  const filter = a.topic && /^[a-z0-9._-]{1,120}$/.test(a.topic) ? a.topic : null;
  const picks = await db.query(
    `select topic_key, language, video_id, channel_id, channel_title, title, duration_s, start_s, captions, score, status, fetched_at
       from content.video_picks
      where ($1::text is null or topic_key like replace(replace($1, '_', '\\_'), '%', '\\%') || '%')
      order by topic_key, language, (status = 'pinned') desc, (status = 'rejected'), score desc, video_id
      limit 300`,
    [filter]
  );
  const channels = await db.query(`select channel_id, title, kind, added_at from content.video_channels order by kind, title`);
  const searches = await db.query(`select searches from content.video_searches where day = $1::date`, [a.today]);
  return {
    picks: picks.rows.map((r: Record<string, unknown>) => ({
      topicKey: String(r.topic_key),
      language: r.language as VideoLanguage,
      videoId: String(r.video_id),
      channelId: String(r.channel_id),
      channelTitle: String(r.channel_title),
      title: String(r.title),
      durationS: Number(r.duration_s),
      startS: Number(r.start_s),
      captions: r.captions === true,
      score: Number(r.score),
      status: r.status as ControlVideoPick['status'],
      fetchedAt: iso(r.fetched_at),
    })),
    channels: channels.rows.map((r: Record<string, unknown>) => ({ channelId: String(r.channel_id), title: String(r.title), kind: r.kind as VideoChannelKind, addedAt: iso(r.added_at) })),
    searchesToday: Number(searches.rows[0]?.searches ?? 0),
  };
}

// Pin or reject one pick. A pinned pick is served first and kept through refreshes; a rejected one is never shown.
export async function reviewVideoPick(db: Sql, actor: ContentActor, p: { topicKey: string; language: string; videoId: string; status: 'pinned' | 'rejected' }): Promise<VideoChange> {
  if (!TOPIC_KEY.test(p.topicKey) || (p.language !== 'en' && p.language !== 'hi') || !VIDEO_ID.test(p.videoId)) return { ok: false, reason: 'bad_request' };
  const before = (
    await db.query(`select status from content.video_picks where topic_key = $1 and language = $2 and video_id = $3 for update`, [p.topicKey, p.language, p.videoId])
  ).rows[0] as { status: string } | undefined;
  if (!before) return { ok: false, reason: 'not_found' };
  await db.query(`update content.video_picks set status = $4, reviewed_by = $5, reviewed_at = now() where topic_key = $1 and language = $2 and video_id = $3`, [
    p.topicKey,
    p.language,
    p.videoId,
    p.status,
    actor.userId,
  ]);
  await writeAuditLog(db, {
    schoolId: null,
    actorUserId: actor.userId,
    actorRole: 'super_admin',
    eventAction: p.status === 'pinned' ? 'content.video.pinned' : 'content.video.rejected',
    targetType: 'content_video_pick',
    targetId: `${p.topicKey}:${p.language}:${p.videoId}`,
    beforeState: { status: before.status === 'pinned' ? 'pinned' : before.status === 'rejected' ? 'rejected' : 'auto' },
    afterState: { status: p.status },
  });
  return { ok: true };
}

// Add a channel to a list, or move it to another. Blocking a channel rejects every pick of it at once.
export async function setVideoChannel(db: Sql, actor: ContentActor, c: { channelId: string; title: string; kind: string }): Promise<VideoChange> {
  const title = typeof c.title === 'string' ? c.title.replace(/\s+/g, ' ').trim() : '';
  if (!CHANNEL_ID.test(c.channelId) || !KINDS.includes(c.kind as VideoChannelKind) || title.length < 1 || title.length > 120) return { ok: false, reason: 'bad_request' };
  const before = (await db.query(`select kind from content.video_channels where channel_id = $1 for update`, [c.channelId])).rows[0] as { kind: VideoChannelKind } | undefined;
  await db.query(
    `insert into content.video_channels (channel_id, title, kind, added_by) values ($1, $2, $3, $4)
     on conflict (channel_id) do update set title = excluded.title, kind = excluded.kind, added_by = excluded.added_by, added_at = now()`,
    [c.channelId, title, c.kind, actor.userId]
  );
  let rejected = 0;
  if (c.kind === 'blocked') {
    rejected = (
      await db.query(`update content.video_picks set status = 'rejected', reviewed_by = $2, reviewed_at = now() where channel_id = $1 and status <> 'rejected'`, [c.channelId, actor.userId])
    ).rowCount ?? 0;
  }
  await writeAuditLog(db, {
    schoolId: null,
    actorUserId: actor.userId,
    actorRole: 'super_admin',
    eventAction: 'content.video.channel_set',
    targetType: 'content_video_channel',
    targetId: c.channelId,
    beforeState: before ? { kind: before.kind } : null,
    afterState: { kind: c.kind === 'official' ? 'official' : c.kind === 'approved' ? 'approved' : 'blocked', picksRejected: rejected },
  });
  return { ok: true };
}

export async function removeVideoChannel(db: Sql, actor: ContentActor, channelId: string): Promise<VideoChange> {
  if (!CHANNEL_ID.test(channelId)) return { ok: false, reason: 'bad_request' };
  const gone = (await db.query(`delete from content.video_channels where channel_id = $1 returning kind`, [channelId])).rows[0] as { kind: VideoChannelKind } | undefined;
  if (!gone) return { ok: false, reason: 'not_found' };
  await writeAuditLog(db, {
    schoolId: null,
    actorUserId: actor.userId,
    actorRole: 'super_admin',
    eventAction: 'content.video.channel_removed',
    targetType: 'content_video_channel',
    targetId: channelId,
    beforeState: { kind: gone.kind === 'official' ? 'official' : gone.kind === 'approved' ? 'approved' : 'blocked' },
    afterState: null,
  });
  return { ok: true };
}
