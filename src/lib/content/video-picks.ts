import { writeAuditLog } from '@/lib/audit/log';
import type { Sql } from '@/lib/jobs/types';
import { videoReviewHides } from '@/lib/ai/platform';
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
  // SponsorBlock's marked promotion share (0 to 1), when known.
  promoShare: number | null;
  // Gemini's review (src/lib/family/video-review.ts), or null before one; `hidden`: it keeps the video from families.
  review: { accuracy: number; clarity: number; classFit: number; clickbait: number; childSafety: number; reason: string; model: string; reviewedAt: string; hidden: boolean } | null;
};
// noAds: the channel runs no ads on its videos (Control's word); the finder ranks it first.
export type ControlVideoChannel = { channelId: string; title: string; kind: VideoChannelKind; noAds: boolean; addedAt: string };
export type VideoReview = { picks: ControlVideoPick[]; channels: ControlVideoChannel[]; searchesToday: number };
export type VideoChange = { ok: true } | { ok: false; reason: 'not_found' | 'bad_request' | 'blocked_channel' };

export const TOPIC_KEY = /^[a-z0-9][a-z0-9._-]{2,119}$/;
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const CHANNEL_ID = /^[A-Za-z0-9_-]{2,40}$/;
export const KINDS: readonly VideoChannelKind[] = ['official', 'approved', 'blocked'];
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

// The picks (filtered by a topic key or the start of one), the topics fetched most recently first, and the channel lists.
export async function listVideoReview(db: Sql, a: { topic?: string; today: string }): Promise<VideoReview> {
  const filter = a.topic && /^[a-z0-9._-]{1,120}$/.test(a.topic) ? a.topic : null;
  const picks = await db.query(
    `select p.topic_key, p.language, p.video_id, p.channel_id, p.channel_title, p.title, p.duration_s, p.start_s, p.captions, p.score, p.status, p.fetched_at, p.promo_share,
            r.accuracy, r.clarity, r.class_fit, r.clickbait, r.child_safety, r.reason, r.model, r.reviewed_at
       from content.video_picks p left join content.video_reviews r on r.video_id = p.video_id
      where ($1::text is null or p.topic_key like replace(replace($1, '_', '\\_'), '%', '\\%') || '%')
      order by max(p.fetched_at) over (partition by p.topic_key, p.language) desc, p.topic_key, p.language, (p.status = 'pinned') desc, (p.status = 'rejected'), p.score desc, p.video_id
      limit 300`,
    [filter]
  );
  const channels = await db.query(`select channel_id, title, kind, no_ads, added_at from content.video_channels order by kind, title`);
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
      promoShare: r.promo_share === null || r.promo_share === undefined ? null : Number(r.promo_share),
      review:
        r.child_safety === null || r.child_safety === undefined
          ? null
          : {
              accuracy: Number(r.accuracy),
              clarity: Number(r.clarity),
              classFit: Number(r.class_fit),
              clickbait: Number(r.clickbait),
              childSafety: Number(r.child_safety),
              reason: String(r.reason ?? ''),
              model: String(r.model ?? ''),
              reviewedAt: iso(r.reviewed_at),
              hidden: videoReviewHides({ child_safety: Number(r.child_safety), accuracy: Number(r.accuracy) }),
            },
    })),
    channels: channels.rows.map((r: Record<string, unknown>) => ({ channelId: String(r.channel_id), title: String(r.title), kind: r.kind as VideoChannelKind, noAds: r.no_ads === true, addedAt: iso(r.added_at) })),
    searchesToday: Number(searches.rows[0]?.searches ?? 0),
  };
}

// Pin or reject one pick. A pinned pick is served first and kept through refreshes; a rejected one is never shown.
export async function reviewVideoPick(db: Sql, actor: ContentActor, p: { topicKey: string; language: string; videoId: string; status: 'pinned' | 'rejected' }): Promise<VideoChange> {
  if (!TOPIC_KEY.test(p.topicKey) || (p.language !== 'en' && p.language !== 'hi') || !VIDEO_ID.test(p.videoId)) return { ok: false, reason: 'bad_request' };
  const before = (
    await db.query(`select status, channel_id from content.video_picks where topic_key = $1 and language = $2 and video_id = $3 for update`, [p.topicKey, p.language, p.videoId])
  ).rows[0] as { status: string; channel_id: string } | undefined;
  if (!before) return { ok: false, reason: 'not_found' };
  // A blocked channel is never shown: unblock it first.
  if (p.status === 'pinned' && (await db.query(`select 1 from content.video_channels where channel_id = $1 and kind = 'blocked'`, [before.channel_id])).rows.length) {
    return { ok: false, reason: 'blocked_channel' };
  }
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

// A reviewer's own pick for one chapter (S5, C378): a video chosen by a person, pinned at once, shown in the family's
// chapter reader and nowhere else. The reviewer types what the page shows (the video id, its title, its channel and
// length); the family sees no automatic pick for a chapter. A blocked channel cannot be pinned. A repeat of the same
// video updates it. The chapter key is any key a chapter can have; the reader looks the picks up by it.
export type ChapterVideo = { chapterKey: string; language: string; videoId: string; channelId: string; channelTitle: string; title: string; durationS: number; startS: number };
export async function pinChapterVideo(db: Sql, actor: ContentActor, p: ChapterVideo): Promise<VideoChange> {
  const channelTitle = typeof p.channelTitle === 'string' ? p.channelTitle.replace(/\s+/g, ' ').trim() : '';
  const title = typeof p.title === 'string' ? p.title.replace(/\s+/g, ' ').trim() : '';
  if (!TOPIC_KEY.test(p.chapterKey) || (p.language !== 'en' && p.language !== 'hi') || !VIDEO_ID.test(p.videoId) || !CHANNEL_ID.test(p.channelId)) return { ok: false, reason: 'bad_request' };
  if (channelTitle.length < 1 || channelTitle.length > 120 || title.length < 1 || title.length > 200) return { ok: false, reason: 'bad_request' };
  if (!Number.isInteger(p.durationS) || p.durationS < 1 || p.durationS > 36000 || !Number.isInteger(p.startS) || p.startS < 0 || p.startS >= p.durationS) return { ok: false, reason: 'bad_request' };
  if ((await db.query(`select 1 from content.video_channels where channel_id = $1 and kind = 'blocked'`, [p.channelId])).rows.length) return { ok: false, reason: 'blocked_channel' };
  await db.query(
    `insert into content.video_picks (topic_key, language, video_id, channel_id, channel_title, title, duration_s, start_s, captions, score, status, reviewed_by, reviewed_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, false, 100, 'pinned', $9, now())
     on conflict (topic_key, language, video_id) do update set channel_id = excluded.channel_id, channel_title = excluded.channel_title, title = excluded.title, duration_s = excluded.duration_s,
       start_s = excluded.start_s, status = 'pinned', reviewed_by = excluded.reviewed_by, reviewed_at = now()`,
    [p.chapterKey, p.language, p.videoId, p.channelId, channelTitle, title, p.durationS, p.startS, actor.userId]
  );
  await writeAuditLog(db, {
    schoolId: null,
    actorUserId: actor.userId,
    actorRole: 'super_admin',
    eventAction: 'content.video.chapter_pinned',
    targetType: 'content_video_pick',
    targetId: `${p.chapterKey}:${p.language}:${p.videoId}`,
    beforeState: null,
    afterState: { status: 'pinned' },
  });
  return { ok: true };
}

// Add a channel to a list, or move it to another. Blocking a channel rejects every pick of it at once.
// `noAds`: whether the channel runs no ads (left out: kept as it was; a new channel: no).
export async function setVideoChannel(db: Sql, actor: ContentActor, c: { channelId: string; title: string; kind: string; noAds?: boolean }): Promise<VideoChange> {
  const title = typeof c.title === 'string' ? c.title.replace(/\s+/g, ' ').trim() : '';
  if (!CHANNEL_ID.test(c.channelId) || !KINDS.includes(c.kind as VideoChannelKind) || title.length < 1 || title.length > 120) return { ok: false, reason: 'bad_request' };
  if (c.noAds !== undefined && typeof c.noAds !== 'boolean') return { ok: false, reason: 'bad_request' };
  const before = (await db.query(`select kind, no_ads from content.video_channels where channel_id = $1 for update`, [c.channelId])).rows[0] as { kind: VideoChannelKind; no_ads: boolean } | undefined;
  await db.query(
    `insert into content.video_channels (channel_id, title, kind, added_by, no_ads) values ($1, $2, $3, $4, coalesce($5::boolean, false))
     on conflict (channel_id) do update set title = excluded.title, kind = excluded.kind, added_by = excluded.added_by, added_at = now(),
       no_ads = coalesce($5::boolean, content.video_channels.no_ads)`,
    [c.channelId, title, c.kind, actor.userId, c.noAds ?? null]
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
    beforeState: before ? { kind: before.kind, noAds: before.no_ads === true } : null,
    afterState: { kind: c.kind === 'official' ? 'official' : c.kind === 'approved' ? 'approved' : 'blocked', noAds: c.noAds ?? before?.no_ads === true, picksRejected: rejected },
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

// Control's Re-review (the review itself runs after this transaction, src/lib/family/video-review.ts): the old
// judgement is removed and the change audited (ids only).
export async function clearVideoReview(db: Sql, actor: ContentActor, videoId: string): Promise<VideoChange> {
  if (!VIDEO_ID.test(videoId)) return { ok: false, reason: 'bad_request' };
  const gone = (await db.query(`delete from content.video_reviews where video_id = $1 returning child_safety, accuracy`, [videoId])).rows[0] as { child_safety: number; accuracy: number } | undefined;
  await writeAuditLog(db, {
    schoolId: null,
    actorUserId: actor.userId,
    actorRole: 'super_admin',
    eventAction: 'content.video.rereview',
    targetType: 'content_video_review',
    targetId: videoId,
    beforeState: gone ? { childSafety: Number(gone.child_safety), accuracy: Number(gone.accuracy) } : null,
    afterState: null,
  });
  return { ok: true };
}
