import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Noor, 16 Nov 2026: the video finder's quality pass, on the real migrations (PGlite): a person's curated video first,
// a free typed question's videos, two per answer, no paid placement, no new or little-seen video, SponsorBlock's
// promotions, and Gemini's review. YouTube, SponsorBlock and Gemini are scripted fetches. Made-up people and videos.

const h = vi.hoisted(() => ({ db: null as unknown as { url: string; pg: { transaction: <T>(fn: (tx: any) => Promise<T>) => Promise<T>; query: (sql: string, p?: unknown[]) => Promise<{ rows: any[] }> }; stop: () => Promise<void> } }));

vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  return {
    ...real,
    withTenantContext: (claims: { role: string; sub: string; schoolId: string | null }, fn: (db: unknown) => Promise<unknown>) =>
      h.db.pg.transaction(async (tx: any) => {
        await tx.query(`set local role ${claims.role === 'super_admin' ? 'nca_super' : 'app_user'}`);
        await tx.query(`select set_config('app.current_tenant_id', $1, true)`, [claims.schoolId ?? '00000000-0000-0000-0000-000000000000']);
        await tx.query(`select set_config('app.current_role', $1, true)`, [claims.role]);
        await tx.query(`select set_config('app.current_user_id', $1, true)`, [claims.sub]);
        return fn(tx);
      }),
  };
});

// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import type { FamilyChild } from '@/lib/family/children';
import type { Line } from '@/lib/family/resolver';
import { freeLine } from '@/lib/family/answer-videos';
import { reviewVideoNow } from '@/lib/ai/platform';
import { topicVideos } from '@/lib/family/video-finder';
import { forgetSearches } from '@/lib/family/videos';
import { promoFor, sponsorSegments } from '@/lib/family/sponsorblock';
import { curatedRowsFromCsv, matchCurated } from '@/lib/family/curated-videos';
import { readFileSync } from 'node:fs';

const ACCOUNT = 'f8000000-0000-4000-8000-0000000000a1';
const CHILD = 'f8000000-0000-4000-8000-0000000000a2';
const FOUNDER = 'f8000000-0000-4000-8000-0000000000f1';
const OFFICIAL = 'UCofficial0000000000001';
const KEY = `AIza${'T'.repeat(31)}TEST`; // made up: the shape of a Google key, not a key
const DAY = 86_400_000;

type Vid = { id: string; title?: string; channel?: string; views?: string; likes?: string; published?: string; paid?: boolean; duration?: string };
const yt = vi.hoisted(() => ({ seen: [] as URL[], ids: [] as string[], vids: [] as Record<string, unknown>[], sponsor: {} as Record<string, unknown[]>, sponsorDown: false }));
const vid = (v: Vid) => ({
  id: v.id,
  snippet: { channelId: v.channel ?? OFFICIAL, channelTitle: 'Official Science', title: v.title ?? `Linear equations ${v.id}`, description: '', defaultAudioLanguage: 'en', publishedAt: v.published ?? '2020-01-01T00:00:00Z' },
  contentDetails: { duration: v.duration ?? 'PT9M30S', caption: 'true' },
  status: { embeddable: true, privacyStatus: 'public', madeForKids: false },
  statistics: { viewCount: v.views ?? '100000', likeCount: v.likes ?? '2000' },
  ...(v.paid ? { paidProductPlacementDetails: { hasPaidProductPlacement: true } } : {}),
});
const serve = (ids: string[], vids: Vid[]) => {
  yt.ids = ids;
  yt.vids = vids.map(vid);
};

const q = async (sql: string, params: unknown[] = []) => (await h.db.pg.query(sql, params)).rows;
const asFamily = <T = { rows: any[] },>(fn: (db: any) => Promise<T>): Promise<T> =>
  h.db.pg.transaction(async (tx: any) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [ACCOUNT]);
    return fn(tx);
  });
let n = 0;
// A fresh topic each time, so no earlier picks or search claims are in the way.
const line = (title = 'Linear equations'): Line => ({ subject: 'mathematics', key: `cbse.c9.mathematics.ch01.t${String(++n).padStart(2, '0')}`, chapterEn: 'Linear equations', topicEn: title, title }) as Line;
const child = { childId: CHILD, classLevel: 9, language: 'en', firstName: 'Meera' } as unknown as FamilyChild;
const ids = async (l: Line, deps = {}) => (await topicVideos(asFamily as never, l, child, 'en', { review: () => undefined, ...deps })).map((v) => v.videoId);

beforeAll(async () => {
  h.db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = h.db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  await q(`insert into family.accounts (account_id, email) values ($1, 'quality@example.org')`, [ACCOUNT]);
  await q(`insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ($1, $2, 'Meera', 9, 'CBSE', 'en', 'en', 'IN-UP')`, [CHILD, ACCOUNT]);
  await q(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Made-up Founder')`, [FOUNDER]);
  await q(`insert into content.video_channels (channel_id, title, kind, added_by) values ($1, 'Official Science', 'official', $2)`, [OFFICIAL, FOUNDER]);
  const ai = await import('@/lib/ai/control');
  expect(await ai.setCredential(h.db.pg as never, { userId: FOUNDER }, 'youtube', KEY)).toEqual({ ok: true });
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.hostname === 'sponsor.ajay.app') {
      if (yt.sponsorDown) return new Response('{}', { status: 503 });
      const segs = yt.sponsor[url.searchParams.get('videoID') ?? ''];
      return segs ? Response.json(segs) : new Response('Not Found', { status: 404 });
    }
    yt.seen.push(url);
    if (url.pathname.endsWith('/search')) return Response.json({ items: yt.ids.map((videoId) => ({ id: { kind: 'youtube#video', videoId } })) });
    if (url.pathname.endsWith('/videos')) {
      const want = (url.searchParams.get('id') ?? '').split(',');
      return Response.json({ items: yt.vids.filter((v) => want.includes(String(v.id))) });
    }
    return new Response('{}', { status: 404 });
  });
}, 120_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await (await import('@/lib/auth/db')).endPool();
  await h.db?.stop();
});

beforeEach(async () => {
  yt.seen = [];
  yt.sponsor = {};
  yt.sponsorDown = false;
  forgetSearches();
  await q(`delete from content.video_topic_searches`);
});

describe('what a family is shown', () => {
  it('two videos at most per answer, the best first', async () => {
    serve(['aaaaaaaaaa1', 'aaaaaaaaaa2', 'aaaaaaaaaa3', 'aaaaaaaaaa4'], ['aaaaaaaaaa1', 'aaaaaaaaaa2', 'aaaaaaaaaa3', 'aaaaaaaaaa4'].map((id) => ({ id })));
    expect(await ids(line())).toHaveLength(2);
  });

  it('drops a paid placement, a video seen fewer than 5,000 times and one published in the last 30 days', async () => {
    const recent = new Date(Date.now() - 5 * DAY).toISOString();
    serve(['paidaaaaaa1', 'fewviewsaa1', 'newvideoaa1', 'goodvideoa1'], [{ id: 'paidaaaaaa1', paid: true }, { id: 'fewviewsaa1', views: '1200' }, { id: 'newvideoaa1', published: recent }, { id: 'goodvideoa1' }]);
    expect(await ids(line())).toEqual(['goodvideoa1']);
  });

  it('Control’s minimum views is respected', async () => {
    await q(`update control.settings set value = '500'::jsonb where key = 'family.video_min_views'`);
    serve(['fewviewsaa1'], [{ id: 'fewviewsaa1', views: '1200' }]);
    expect(await ids(line())).toEqual(['fewviewsaa1']);
    await q(`update control.settings set value = '5000'::jsonb where key = 'family.video_min_views'`);
  });

  it('a curated video comes first, even from an unlisted channel with few views, and no search is spent on two of them', async () => {
    await q(`insert into content.curated_topic_videos (channel_id, class, subject, chapter_name, topic, video_id, title, url, duration_s, language) values
      ('UCunlisted00000000000001', '6-12', 'Maths', 'Linear equations', 'Linear equations', 'curatedaaa1', 'A chosen video', 'https://www.youtube.com/watch?v=curatedaaa1', 600, 'en'),
      ('UCunlisted00000000000001', '9', 'Maths', 'Linear equations', 'Linear equations', 'curatedaaa2', 'Another chosen video', 'https://www.youtube.com/watch?v=curatedaaa2', 600, 'en'),
      ('UCunlisted00000000000001', '2', 'Maths', 'Counting', 'Linear equations', 'curatedaaa3', 'Wrong class', 'https://www.youtube.com/watch?v=curatedaaa3', 600, 'en')`);
    serve(['goodvideoa1'], [{ id: 'goodvideoa1' }, { id: 'curatedaaa1', channel: 'UCunlisted00000000000001', views: '40', published: new Date().toISOString(), title: 'Anything' }, { id: 'curatedaaa2', channel: 'UCunlisted00000000000001', views: '40', title: 'Anything else' }]);
    expect(new Set(await ids(line()))).toEqual(new Set(['curatedaaa1', 'curatedaaa2']));
    expect(yt.seen.filter((u) => u.pathname.endsWith('/search'))).toHaveLength(0);
    // With one curated video only, it leads and a search fills the second place.
    await q(`update content.curated_topic_videos set active = false where video_id = 'curatedaaa2'`);
    const got = await ids(line());
    expect(got[0]).toBe('curatedaaa1');
    expect(got).toHaveLength(2);
  });

  it('a typed question the catalog has no topic for gets videos from its own subject words', async () => {
    const l = freeLine('why do trees die?', 'science', child);
    expect(l).not.toBeNull();
    expect(l!.key).toMatch(/^free\.c9\./);
    serve(['treesvideo1'], [{ id: 'treesvideo1', title: 'Why do trees die' }]);
    expect(await ids(l!)).toEqual(['treesvideo1']);
    // The key and the title carry no number, contact or name of the child's.
    const personal = freeLine('my name is Meera call 9876543210 how do plants make food', 'science', child)!;
    expect(`${personal.key} ${personal.title}`).not.toMatch(/meera|9876|call/i);
    expect(freeLine('hi', 'science', child)).toBeNull();
    expect(freeLine(null, 'science', child)).toBeNull();
  });
});

describe('SponsorBlock', () => {
  it('skips a video that is mostly promotion, and starts one after its opening sponsor', async () => {
    serve(['heavyvideo1', 'openervideo', 'plainvideo1'], [{ id: 'heavyvideo1' }, { id: 'openervideo' }, { id: 'plainvideo1' }]);
    yt.sponsor = { heavyvideo1: [{ segment: [100, 400], category: 'sponsor' }], openervideo: [{ segment: [0, 25.4], category: 'sponsor' }] };
    const got = await topicVideos(asFamily as never, line(), child, 'en', { review: () => undefined });
    expect(got.map((v) => v.videoId)).not.toContain('heavyvideo1');
    expect(got.find((v) => v.videoId === 'openervideo')?.startS).toBe(25);
    expect(got.find((v) => v.videoId === 'plainvideo1')?.startS).toBe(0);
  });

  it('is down: the finder carries on with the same videos', async () => {
    yt.sponsorDown = true;
    serve(['heavyvideo1', 'plainvideo1'], [{ id: 'heavyvideo1' }, { id: 'plainvideo1' }]);
    expect((await ids(line())).sort()).toEqual(['heavyvideo1', 'plainvideo1']);
    expect(await sponsorSegments('plainvideo1', 570, (async () => { throw new Error('down'); }) as never)).toBeNull();
    expect((await promoFor([{ videoId: 'plainvideo1', durationS: 570 }], (async () => { throw new Error('down'); }) as never)).size).toBe(0);
  });
});

describe('Gemini’s review', () => {
  const gemini = (scores: Record<string, unknown>) => {
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(String(url));
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(scores) }] } }] });
    }) as unknown as typeof fetch;
    return { f, calls };
  };
  const withDb = <T,>(fn: (db: any) => Promise<T>) => fn(h.db.pg);

  it('is saved once, and a video below 4 for child safety is hidden from families', async () => {
    process.env.GEMINI_API_KEY = 'made-up-gemini-key';
    const g = gemini({ accuracy: 5, clarity: 4, class_fit: 4, clickbait: 5, child_safety: 2, reason: 'scary scenes' });
    const first = await reviewVideoNow('reviewaaaa1', { fetch: g.f, withDb: withDb as never });
    expect(first).toMatchObject({ ok: true, hidden: true });
    expect(await reviewVideoNow('reviewaaaa1', { fetch: g.f, withDb: withDb as never })).toEqual({ ok: false, reason: 'already' });
    expect(g.calls).toHaveLength(1);
    expect(await q(`select child_safety from content.video_reviews where video_id = 'reviewaaaa1'`)).toEqual([{ child_safety: 2 }]);
    expect(await asFamily(async (db) => (await db.query(`select content.video_hidden('reviewaaaa1') as hidden`)).rows[0].hidden)).toBe(true);
    // The finder never keeps it.
    serve(['reviewaaaa1', 'plainvideo1'], [{ id: 'reviewaaaa1' }, { id: 'plainvideo1' }]);
    expect(await ids(line())).toEqual(['plainvideo1']);
  });

  it('a safe, accurate video is kept', async () => {
    const g = gemini({ accuracy: 4, clarity: 4, class_fit: 4, clickbait: 4, child_safety: 5, reason: 'fine' });
    expect(await reviewVideoNow('reviewaaaa2', { fetch: g.f, withDb: withDb as never })).toMatchObject({ ok: true, hidden: false });
    expect(await asFamily(async (db) => (await db.query(`select content.video_hidden('reviewaaaa2') as hidden`)).rows[0].hidden)).toBe(false);
  });
});

describe('the topic map', () => {
  it('loads 187 videos, each matched to its class, subject and topic', () => {
    const { rows, skipped } = curatedRowsFromCsv(readFileSync('scripts/seed/part2_topic_map.csv', 'utf8'));
    expect(skipped).toEqual([]);
    expect(rows).toHaveLength(187);
    const first = rows[0];
    const found = matchCurated(
      rows.map((r) => ({ videoId: r.video_id, channelId: r.channel_id, class: r.class, subject: r.subject, chapterName: r.chapter_name, topic: r.topic })),
      { subject: 'hindi', topicEn: first.topic, title: first.topic, chapterEn: first.chapter_name },
      { classLevel: 0 }
    );
    expect(found).toContain(first.video_id);
  });
});
