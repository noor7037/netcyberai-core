import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// M2-5 (C279): the video finder, the honest player's data and Control → Content → Videos, on the real migrations
// (PGlite). The family route runs through the real connection pool as family_app; Control's routes through the same
// role switch as src/lib/auth/db.ts. YouTube is a scripted fetch: the request's address is checked for the topic's
// title and no child's name. Made-up people, channels and videos only; the key is made up.

const h = vi.hoisted(() => ({ db: null as unknown as { url: string; pg: { transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>; query: (sql: string, p?: unknown[]) => Promise<{ rows: any[] }> }; stop: () => Promise<void> } }));

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
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { parseChapters, parseDuration, type VideoCandidate } from '@/lib/ai/adapters/youtube';
import { forgetSearches, rankVideos, videoQuery } from '@/lib/family/videos';
import { indiaDate } from '@/lib/time/india';

const ACCOUNT = 'f7000000-0000-4000-8000-0000000000a1';
const CHILD = 'f7000000-0000-4000-8000-0000000000a2';
const VERSION = 'f7000000-0000-4000-8000-0000000000c1';
const FOUNDER = 'f7000000-0000-4000-8000-0000000000f1';
const TOPIC = 'cbse.c9.mathematics.u1.ch01.t01';
const TOPIC2 = 'cbse.c9.mathematics.u1.ch01.t02';
const KEY = `AIza${'T'.repeat(31)}TEST`; // made up: the shape of a Google key, not a key
const OFFICIAL = 'UCofficial0000000000001';
const OTHER = 'UCother000000000000000002';
const BAD = 'UCbad00000000000000000003';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let R: Record<string, any>;
let jar = '';
let founder = '';
const q = async (sql: string, params: unknown[] = []) => (await h.db.pg.query(sql, params)).rows;

const cand = (videoId: string, o: Partial<VideoCandidate> = {}): VideoCandidate => ({
  videoId,
  channelId: OTHER,
  channelTitle: 'Some Channel',
  title: 'Rational numbers explained',
  durationS: 600,
  captions: true,
  embeddable: true,
  madeForKids: false,
  isPublic: true,
  ageRestricted: false,
  language: 'en',
  chapters: [],
  ...o,
});

// The scripted YouTube: each search answers the ids for its channel (or the wider catalogue), then one details batch.
const yt = vi.hoisted(() => ({ seen: [] as { url: URL; key: string | null }[], videos: [] as Record<string, unknown>[], byChannel: {} as Record<string, string[]>, wide: [] as string[], fail: false }));
const item = (id: string, channelId: string, title: string, extra: { duration?: string; description?: string; embeddable?: boolean } = {}) => ({
  id,
  snippet: { channelId, channelTitle: channelId === OFFICIAL ? 'Official Maths' : 'Other Maths', title, description: extra.description ?? '', defaultAudioLanguage: 'en' },
  contentDetails: { duration: extra.duration ?? 'PT9M30S', caption: 'true' },
  status: { embeddable: extra.embeddable ?? true, privacyStatus: 'public', madeForKids: false },
});

beforeAll(async () => {
  h.db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = h.db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-m2-video-tests-0123456789abcdef';
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  await h.db.pg.query(`insert into family.accounts (account_id, email) values ($1, 'videos@example.org')`, [ACCOUNT]);
  await h.db.pg.query(`insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ($1, 'study_core', true, 'parent_tap', 'v1')`, [ACCOUNT]);
  await h.db.pg.query(
    `insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ($1, $2, 'Meera', 9, 'CBSE', 'en', 'en', 'IN-UP')`,
    [CHILD, ACCOUNT]
  );
  await h.db.pg.query(
    `insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at)
     values ($1, 'CBSE', 9, 'mathematics', '2026-27', 1, 'published', 'everyone', 'repository', 'test', $2, now())`,
    [VERSION, FOUNDER]
  );
  await h.db.pg.query(
    `insert into content.chapters (chapter_id, version_id, chapter_key, position, title_en, source_url, source_page, checked_on) values ('f7000000-0000-4000-8000-0000000000d1', $1, 'cbse.c9.mathematics.u1.ch01', 1, 'Number System', 'https://cbseacademic.nic.in/', '4', '2026-10-21')`,
    [VERSION]
  );
  await h.db.pg.query(
    `insert into content.topics (version_id, chapter_id, topic_key, position, title_en, source_url, source_page, checked_on) values
       ($1, 'f7000000-0000-4000-8000-0000000000d1', $2, 1, 'Rational numbers', 'https://cbseacademic.nic.in/', '4', '2026-10-21'),
       ($1, 'f7000000-0000-4000-8000-0000000000d1', $3, 2, 'Irrational numbers', 'https://cbseacademic.nic.in/', '4', '2026-10-21')`,
    [VERSION, TOPIC, TOPIC2]
  );
  await h.db.pg.query(`insert into control.app_flags (app, module, enabled, reason) values ('family', 'videos', true, 'M2-5 test') on conflict (app, module) do update set enabled = true`);
  await h.db.pg.query(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Made-up Founder')`, [FOUNDER]);
  const { signFamilySession } = await import('@/lib/family/session');
  jar = `ncf_session=${await signFamilySession({ accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' })}; ncf_child=${CHILD}`;
  const token = await signAccessToken({ sub: FOUNDER, role: 'super_admin' as never, schoolId: null, membershipId: null, tokenVersion: 0, aal: 'aal2', sessionId: randomUUID() });
  founder = `${ACCESS_COOKIE}=${token}`;
  R = { videos: await import('@/app/api/family/videos/route'), control: await import('@/app/api/control/content/videos/route'), ai: await import('@/lib/ai/control') };

  vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const key = new Headers(init?.headers).get('x-goog-api-key');
    yt.seen.push({ url, key });
    if (yt.fail) return new Response('{}', { status: 503 });
    if (url.pathname.endsWith('/search')) {
      const ids = url.searchParams.get('channelId') ? (yt.byChannel[url.searchParams.get('channelId')!] ?? []) : yt.wide;
      return Response.json({ items: ids.map((videoId) => ({ id: { kind: 'youtube#video', videoId } })) });
    }
    if (url.pathname.endsWith('/videos')) {
      const ids = (url.searchParams.get('id') ?? '').split(',');
      return Response.json({ items: url.searchParams.get('chart') ? [{ id: 'aaaaaaaaaaa' }] : yt.videos.filter((v) => ids.includes(String(v.id))) });
    }
    return new Response('{}', { status: 404 });
  });
}, 120_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await (await import('@/lib/auth/db')).endPool();
  await h.db?.stop();
});

beforeEach(() => {
  yt.seen = [];
  yt.fail = false;
  forgetSearches();
});

const get = (topic: string, cookie = jar) => new NextRequest(`http://localhost/api/family/videos?topic=${topic}`, { headers: { cookie } });
const videos = async (topic = TOPIC) => {
  const res = await R.videos.GET(get(topic));
  expect(res.status).toBe(200);
  return (await res.json()).videos as { videoId: string; startS: number }[];
};
const control = (body?: unknown, cookie = founder, path = '/api/control/content/videos') =>
  new NextRequest(`https://www.netcyberai.test${path}`, { method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', cookie } });
const searchesToday = async () => Number((await q(`select searches from content.video_searches where day = $1::date`, [indiaDate()]))[0]?.searches ?? 0);
async function saveKey() {
  expect(await R.ai.setCredential(h.db.pg as never, { userId: FOUNDER }, 'youtube', KEY)).toEqual({ ok: true });
}

describe('reading the provider', () => {
  it('parses ISO-8601 durations and chapter timestamps', () => {
    expect(parseDuration('PT9M30S')).toBe(570);
    expect(parseDuration('PT1H2M3S')).toBe(3723);
    expect(parseDuration('P1DT1S')).toBe(86401);
    expect(parseDuration('P0D')).toBe(0);
    expect(parseDuration('nonsense')).toBe(0);
    expect(parseChapters('Intro text\n0:00 Introduction\n1:30 - Natural numbers\n4:05 Rational numbers\n12:00 Practice')).toEqual([
      { s: 0, title: 'Introduction' },
      { s: 90, title: 'Natural numbers' },
      { s: 245, title: 'Rational numbers' },
      { s: 720, title: 'Practice' },
    ]);
    // Chapters must start at 0:00 and rise, as YouTube reads them.
    expect(parseChapters('1:00 One\n2:00 Two')).toEqual([]);
    expect(parseChapters('0:00 One\n2:00 Two\n1:00 Back')).toEqual([{ s: 0, title: 'One' }, { s: 120, title: 'Two' }]);
  });
});

describe('ranking, on metadata only', () => {
  const channels = [
    { channelId: OFFICIAL, kind: 'official' as const },
    { channelId: 'UCapproved000000000004', kind: 'approved' as const },
    { channelId: BAD, kind: 'blocked' as const },
  ];
  const rank = (c: VideoCandidate[], language: 'en' | 'hi' = 'en') => rankVideos(c, { topicTitles: ['Rational numbers'], language, channels, wider: true });

  it('keeps only listed channels unless Control turns on the wider catalogue (C230-R)', () => {
    const c = [cand('ooooooooooo'), cand('aaaaaaaaaaa', { channelId: 'UCapproved000000000004' }), cand('fffffffffff', { channelId: OFFICIAL })];
    expect(rankVideos(c, { topicTitles: ['Rational numbers'], language: 'en', channels }).map((p) => p.video_id)).toEqual(['fffffffffff', 'aaaaaaaaaaa']);
    expect(rankVideos([cand('ooooooooooo')], { topicTitles: ['Rational numbers'], language: 'en', channels: [] })).toEqual([]);
  });

  it('puts official before approved before others, and keeps three', () => {
    const r = rank([cand('ooooooooooo'), cand('aaaaaaaaaaa', { channelId: 'UCapproved000000000004' }), cand('fffffffffff', { channelId: OFFICIAL }), cand('ppppppppppp')]);
    expect(r.map((p) => p.video_id)).toEqual(['fffffffffff', 'aaaaaaaaaaa', 'ooooooooooo']);
  });

  it('never keeps a blocked channel, a video that may not be embedded, is private or age-restricted, or does not match the topic', () => {
    const r = rank([
      cand('bbbbbbbbbbb', { channelId: BAD }),
      cand('eeeeeeeeeee', { embeddable: false }),
      cand('ppppppppppp', { isPublic: false }),
      cand('rrrrrrrrrrr', { ageRestricted: true }),
      cand('uuuuuuuuuuu', { title: 'Cooking pasta at home' }),
      cand('ttttttttttt', { durationS: 10 }),
      cand('kkkkkkkkkkk'),
    ]);
    expect(r.map((p) => p.video_id)).toEqual(['kkkkkkkkkkk']);
  });

  it('prefers 2 to 25 minutes, captions and the child’s language', () => {
    const r = rank([cand('lllllllllll', { durationS: 3600 }), cand('nnnnnnnnnnn', { captions: false }), cand('hhhhhhhhhhh', { language: 'hi' }), cand('ggggggggggg')]);
    expect(r[0].video_id).toBe('ggggggggggg');
    expect(r.map((p) => p.video_id)).not.toContain('lllllllllll');
    expect(rank([cand('hhhhhhhhhhh', { language: 'hi' }), cand('ggggggggggg')], 'hi')[0].video_id).toBe('hhhhhhhhhhh');
  });

  it('starts at the chapter that matches the topic', () => {
    const chapters = [{ s: 0, title: 'Introduction' }, { s: 95, title: 'Natural numbers' }, { s: 300, title: 'Rational numbers on the number line' }];
    expect(rank([cand('ccccccccccc', { title: 'Number system full chapter', chapters })])[0]).toMatchObject({ video_id: 'ccccccccccc', start_s: 300 });
  });

  it('searches with the catalog line, never a child’s words', () => {
    expect(videoQuery({ subject: 'mathematics', topicEn: 'Rational numbers', title: 'Rational numbers' }, { classLevel: 9, language: 'en' })).toBe('Rational numbers maths class 9');
  });
});

describe('the family route', () => {
  it('without a key: no video, no error, no search spent', async () => {
    expect(await videos()).toEqual([]);
    expect(yt.seen).toHaveLength(0);
    expect(await searchesToday()).toBe(0);
  });

  it('shows only the channels Control listed until it turns on the wider catalogue (C230-R)', async () => {
    await saveKey();
    await q(`insert into content.video_channels (channel_id, title, kind, added_by) values ($1, 'Official Maths', 'official', $2)`, [OFFICIAL, FOUNDER]);
    yt.byChannel = { [OFFICIAL]: ['fffffffffff'] };
    yt.wide = ['ooooooooooo'];
    yt.videos = [item('fffffffffff', OFFICIAL, 'Rational numbers | Class 9'), item('ooooooooooo', OTHER, 'Rational numbers in 10 minutes')];
    expect((await videos()).map((v) => v.videoId)).toEqual(['fffffffffff']);
    await q(`delete from content.video_picks where topic_key = $1`, [TOPIC]);
    await q(`delete from content.video_channels`);
    await q(`delete from content.video_searches`);
  });

  it('searches official channels first, then the wider catalogue, with the topic’s title and no child’s name', async () => {
    await saveKey();
    await q(`insert into control.settings (key, value) values ('family.video_wider_catalogue', '1'::jsonb) on conflict (key) do update set value = excluded.value`);
    await q(`insert into content.video_channels (channel_id, title, kind, added_by) values ($1, 'Official Maths', 'official', $3), ($2, 'Bad Maths', 'blocked', $3)`, [OFFICIAL, BAD, FOUNDER]);
    yt.byChannel = { [OFFICIAL]: ['fffffffffff'] };
    yt.wide = ['ooooooooooo', 'bbbbbbbbbbb', 'xxxxxxxxxxx', 'nnnnnnnnnnn'];
    yt.videos = [
      item('fffffffffff', OFFICIAL, 'Number system | Class 9', { description: '0:00 Start\n2:10 Natural numbers\n5:20 Rational numbers\n9:00 Practice' }),
      item('ooooooooooo', OTHER, 'Rational numbers in 10 minutes'),
      item('bbbbbbbbbbb', BAD, 'Rational numbers trick'),
      item('xxxxxxxxxxx', OTHER, 'Rational numbers (not embeddable)', { embeddable: false }),
      item('nnnnnnnnnnn', OTHER, 'Rational numbers revision', { duration: 'PT1M' }),
    ];
    const got = await videos();
    expect(got.map((v) => v.videoId)).toEqual(['fffffffffff', 'ooooooooooo', 'nnnnnnnnnnn']);
    expect(got[0].startS).toBe(320);
    // Two searches (the official channel, then everything) and one details batch.
    expect(yt.seen.map((s) => s.url.pathname.split('/').pop())).toEqual(['search', 'search', 'videos']);
    for (const s of yt.seen.filter((x) => x.url.pathname.endsWith('/search'))) {
      expect(s.url.searchParams.get('q')).toBe('Rational numbers maths class 9');
      expect(s.url.searchParams.get('safeSearch')).toBe('strict');
      expect(s.url.searchParams.get('videoEmbeddable')).toBe('true');
      expect(s.url.searchParams.get('regionCode')).toBe('IN');
      expect(s.url.searchParams.get('relevanceLanguage')).toBe('en');
    }
    expect(yt.seen[0].url.searchParams.get('channelId')).toBe(OFFICIAL);
    for (const s of yt.seen) {
      expect(s.url.toString()).not.toMatch(/Meera|videos@example/i);
      expect(s.url.toString()).not.toContain(KEY);
      expect(s.key).toBe(KEY);
    }
    expect(await searchesToday()).toBe(2);
    expect((await q(`select count(*)::int as n from content.video_picks where topic_key = $1`, [TOPIC]))[0].n).toBe(3);
  });

  it('serves fresh picks from the cache without a search', async () => {
    expect((await videos()).map((v) => v.videoId)).toEqual(['fffffffffff', 'ooooooooooo', 'nnnnnnnnnnn']);
    expect(yt.seen).toHaveLength(0);
  });

  it('refreshes stale picks, keeping a pinned one first', async () => {
    expect((await R.control.POST(control({ action: 'pin', topicKey: TOPIC, language: 'en', videoId: 'nnnnnnnnnnn' }))).status).toBe(200);
    await q(`update content.video_picks set fetched_at = now() - interval '40 days' where topic_key = $1`, [TOPIC]);
    yt.wide = ['ooooooooooo', 'qqqqqqqqqqq'];
    yt.videos.push(item('qqqqqqqqqqq', OTHER, 'Rational numbers for class 9'));
    // One pinned is fewer than three: the automatic ones are searched again, and the pinned one is still first.
    const got = await videos();
    expect(yt.seen.filter((s) => s.url.pathname.endsWith('/search'))).toHaveLength(2);
    expect(got.map((v) => v.videoId)).toEqual(['nnnnnnnnnnn', 'fffffffffff', 'ooooooooooo']);
    expect((await q(`select count(*)::int as n from content.video_picks where topic_key = $1 and status = 'auto' and fetched_at < now() - interval '1 day'`, [TOPIC]))[0].n).toBe(0);
  });

  it('with three pinned, nothing is searched, however old they are', async () => {
    await q(`update content.video_picks set status = 'pinned', reviewed_by = $2, reviewed_at = now() where topic_key = $1 and video_id in ('fffffffffff', 'ooooooooooo')`, [TOPIC, FOUNDER]);
    await q(`update content.video_picks set fetched_at = now() - interval '40 days' where topic_key = $1`, [TOPIC]);
    expect((await videos()).map((v) => v.videoId).sort()).toEqual(['fffffffffff', 'nnnnnnnnnnn', 'ooooooooooo']);
    expect(yt.seen).toHaveLength(0);
    await q(`update content.video_picks set status = 'auto', reviewed_by = null, reviewed_at = null where topic_key = $1 and video_id <> 'ooooooooooo'`, [TOPIC]);
  });

  it('a pinned pick stays when the automatic ones are replaced or dropped', async () => {
    const { readPicks, savePicks } = await import('@/lib/family/videos');
    const asIs = { query: (s: string, p?: unknown[]) => h.db.pg.query(s, p) };
    await savePicks(asIs, TOPIC, 'en', []);
    const read = await readPicks(asIs, TOPIC, 'en', 30);
    expect(read.picks.map((v) => v.videoId)).toEqual(['ooooooooooo']);
    expect(read.refreshDue).toBe(true);
  });

  it('without a key, stale automatic picks are dropped and the pinned still shown', async () => {
    await q(`select content.save_video_picks($1, 'en', $2::jsonb)`, [TOPIC, JSON.stringify([{ video_id: 'sssssssssss', channel_id: OTHER, channel_title: 'Other Maths', title: 'Rational numbers old', duration_s: 300, start_s: 0, captions: true, score: 50 }])]);
    await q(`update content.video_picks set fetched_at = now() - interval '40 days' where topic_key = $1 and status = 'auto'`, [TOPIC]);
    const sealed = await q(`delete from control.ai_credentials where provider_id = 'youtube' returning *`);
    expect((await videos()).map((v) => v.videoId)).toEqual(['ooooooooooo']);
    expect(yt.seen).toHaveLength(0);
    expect(await q(`select 1 from content.video_picks where topic_key = $1 and video_id = 'sssssssssss'`, [TOPIC])).toHaveLength(0);
    await q(`insert into control.ai_credentials select * from jsonb_populate_record(null::control.ai_credentials, $1::jsonb)`, [JSON.stringify(sealed[0])]);
  });

  it('when the day’s searches are spent: no search, no video', async () => {
    await q(`update control.settings set value = '0'::jsonb where key = 'family.video_searches_per_day'`);
    expect(await videos(TOPIC2)).toEqual([]);
    expect(yt.seen).toHaveLength(0);
    await q(`update control.settings set value = '90'::jsonb where key = 'family.video_searches_per_day'`);
  });

  it('when YouTube fails: no video, no error, nothing overwritten', async () => {
    yt.fail = true;
    expect(await videos(TOPIC2)).toEqual([]);
    expect(await q(`select 1 from content.video_picks where topic_key = $1`, [TOPIC2])).toHaveLength(0);
  });

  it('a bad topic key is refused, and a family without a session gets nothing', async () => {
    expect((await R.videos.GET(get('Robert%27);drop'))).status).toBe(400);
    expect((await R.videos.GET(get(TOPIC, ''))).status).toBe(401);
  });

  it('with videos switched off in Control: nothing', async () => {
    await q(`update control.app_flags set enabled = false where app = 'family' and module = 'videos'`);
    expect(await videos()).toEqual([]);
    await q(`update control.app_flags set enabled = true where app = 'family' and module = 'videos'`);
  });
});

describe('Control → Content → Videos', () => {
  it('a family session cannot reach it; the founder reads the picks, channels and today’s searches', async () => {
    expect((await R.control.GET(control(undefined, jar))).status).toBe(401);
    expect((await R.control.POST(control({ action: 'reject', topicKey: TOPIC, language: 'en', videoId: 'ooooooooooo' }, jar))).status).toBe(401);
    const res = await R.control.GET(control(undefined, founder, `/api/control/content/videos?topic=${TOPIC}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.picks.length).toBeGreaterThan(0);
    expect(body.picks.every((p: { topicKey: string }) => p.topicKey === TOPIC)).toBe(true);
    expect(body.channels.map((c: { channelId: string }) => c.channelId).sort()).toEqual([BAD, OFFICIAL].sort());
    expect(body.searchesToday).toBeGreaterThan(0);
  });

  it('pin and reject write audit rows; a rejected pick is never shown', async () => {
    expect((await R.control.POST(control({ action: 'reject', topicKey: TOPIC, language: 'en', videoId: 'ooooooooooo' }))).status).toBe(200);
    expect((await videos()).map((v) => v.videoId)).not.toContain('ooooooooooo');
    expect((await R.control.POST(control({ action: 'pin', topicKey: TOPIC, language: 'en', videoId: 'zzzzzzzzzzz' }))).status).toBe(404);
    const rows = await q(`select event_action, target_type, target_id, before_state, after_state from audit_log where target_type = 'content_video_pick' order by audit_id`);
    expect(rows.map((r) => r.event_action)).toEqual(['content.video.pinned', 'content.video.rejected']);
    expect(rows[1]).toMatchObject({ target_id: `${TOPIC}:en:ooooooooooo`, after_state: { status: 'rejected' } });
  });

  it('blocking a channel rejects its picks at once; channels are added and removed with audit rows', async () => {
    const shown = (await videos()).map((v) => v.videoId);
    expect(shown.length).toBeGreaterThan(0);
    const channel = String((await q(`select channel_id from content.video_picks where topic_key = $1 and video_id = $2`, [TOPIC, shown[0]]))[0].channel_id);
    expect((await R.control.POST(control({ action: 'channel', channelId: channel, title: 'Made-up channel', kind: 'blocked' }))).status).toBe(200);
    expect((await videos()).map((v) => v.videoId)).not.toContain(shown[0]);
    // A blocked channel's pick cannot be pinned back.
    expect((await R.control.POST(control({ action: 'pin', topicKey: TOPIC, language: 'en', videoId: shown[0] }))).status).toBe(409);
    expect((await R.control.POST(control({ action: 'channel', channelId: 'not a channel!', title: 'x', kind: 'official' }))).status).toBe(400);
    expect((await R.control.POST(control({ action: 'remove_channel', channelId: channel }))).status).toBe(200);
    expect((await R.control.POST(control({ action: 'remove_channel', channelId: channel }))).status).toBe(404);
    const rows = await q(`select event_action, after_state, before_state from audit_log where target_type = 'content_video_channel' order by audit_id`);
    expect(rows.map((r) => r.event_action)).toEqual(['content.video.channel_set', 'content.video.channel_removed']);
    expect(rows[0].after_state.kind).toBe('blocked');
    expect(rows[0].after_state.picksRejected).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain('Made-up channel');
  });
});

describe('Control → AI keeps the YouTube key', () => {
  it('lists youtube as a video provider, never a profile’s choice, and tests its key', async () => {
    const overview = await h.db.pg.transaction(async (tx: any) => {
      await tx.query('set local role nca_super');
      return R.ai.loadAiOverview(tx);
    });
    const youtube = overview.providers.find((p: { providerId: string }) => p.providerId === 'youtube');
    expect(youtube).toMatchObject({ hasAdapter: true, capability: 'video', credential: expect.objectContaining({ keyLast4: 'TEST' }) });
    expect(R.ai.providerChoices()).not.toContain('youtube');
    const asProfile = await R.ai.setProfile(h.db.pg as never, { userId: FOUNDER }, 'family.resolver', { providerId: 'youtube', model: 'x', promptVersion: 'v1', enabled: false, fallback: [] });
    expect(asProfile).toEqual({ ok: false, code: 'provider' });
    expect(await R.ai.setCredential(h.db.pg as never, { userId: FOUNDER }, 'youtube', 'not-a-google-key')).toEqual({ ok: false, code: 'key_format' });

    const prepared = await R.ai.prepareKeyTest(h.db.pg as never, 'youtube');
    expect(prepared.ok).toBe(true);
    const outcome = await prepared.run();
    expect(outcome).toMatchObject({ ok: true, code: 'ok' });
    // A key saved again during the call does not take this key's outcome.
    await R.ai.recordKeyTest(h.db.pg as never, 'youtube', { ...outcome, ok: false, of: 'another sealed row' });
    expect((await q(`select tested_at from control.ai_credentials where provider_id = 'youtube'`))[0].tested_at).toBeNull();
    expect(yt.seen.at(-1)?.url.searchParams.get('chart')).toBe('mostPopular');
    await R.ai.recordKeyTest(h.db.pg as never, 'youtube', outcome);
    expect((await q(`select test_ok, test_message from control.ai_credentials where provider_id = 'youtube'`))[0]).toEqual({ test_ok: true, test_message: 'ok' });
    expect(await R.ai.prepareKeyTest(h.db.pg as never, 'anthropic')).toEqual({ ok: false, code: 'not_testable' });
  });
});
