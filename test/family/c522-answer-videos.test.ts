import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// C522: videos under every tutor answer. On the real migrations (PGlite): the language chosen for the child and its
// visible fallback, the shared search cache (one search per topic and language, the negative cache, the daily cap),
// and "See video" (the click route and its store, its RLS, and Control's totals). YouTube is a scripted fetch; made-up
// people, channels and videos only; the key is made up.

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
import { searchVideoIds } from '@/lib/ai/adapters/youtube';
import { answerVideos, videoLanguageOf, videoLanguages, videoTopicOf } from '@/lib/family/answer-videos';
import type { FamilyChild } from '@/lib/family/children';
import type { Line } from '@/lib/family/resolver';
import { CLICKS_PER_DAY, checkClick } from '@/lib/family/video-clicks';
import { forgetSearches, inLanguage, rankVideos, videoQuery } from '@/lib/family/videos';
import { indiaDate } from '@/lib/time/india';

const ACCOUNT = 'f5220000-0000-4000-8000-0000000000a1';
const CHILD = 'f5220000-0000-4000-8000-0000000000a2';
const OTHER_ACCOUNT = 'f5220000-0000-4000-8000-0000000000b1';
const OTHER_CHILD = 'f5220000-0000-4000-8000-0000000000b2';
const FOUNDER = 'f5220000-0000-4000-8000-0000000000f1';
const TOPIC = 'cbse.c7.science.ch01.t01';
const TOPIC2 = 'cbse.c7.science.ch01.t02';
const KEY = `AIza${'T'.repeat(31)}TEST`; // made up: the shape of a Google key, not a key
const OFFICIAL = 'UCofficial0000000000001';

const yt = vi.hoisted(() => ({ seen: [] as URL[], ids: [] as string[], lang: 'en' }));
const item = (id: string, title: string) => ({
  id,
  snippet: { channelId: 'UCofficial0000000000001', channelTitle: 'Official Science', title, description: '', defaultAudioLanguage: yt.lang, publishedAt: '2020-01-01T00:00:00Z' },
  statistics: { viewCount: '100000', likeCount: '2000' },
  contentDetails: { duration: 'PT8M', caption: 'true' },
  status: { embeddable: true, privacyStatus: 'public', madeForKids: false },
});

const q = async (sql: string, params: unknown[] = []) => (await h.db.pg.query(sql, params)).rows;
const asFamily = <T = { rows: any[] },>(fn: (db: any) => Promise<T>, account = ACCOUNT): Promise<T> =>
  h.db.pg.transaction(async (tx: any) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [account]);
    return fn(tx);
  });
const line = (key: string): Line => ({ subject: 'science', key, chapterEn: 'Nutrition in plants', topicEn: 'Photosynthesis', title: 'Photosynthesis' }) as Line;
const child = { childId: CHILD, classLevel: 7, language: 'en' } as unknown as FamilyChild;
const searches = () => yt.seen.filter((u) => u.pathname.endsWith('/search')).length;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let R: Record<string, any>;
let jar = '';

beforeAll(async () => {
  h.db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = h.db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-c522-video-tests-0123456789abcdef';
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  for (const [a, c, name] of [[ACCOUNT, CHILD, 'Asha'], [OTHER_ACCOUNT, OTHER_CHILD, 'Ravi']]) {
    await q(`insert into family.accounts (account_id, email) values ($1, $2)`, [a, `${name.toLowerCase()}@example.org`]);
    await q(`insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ($1, 'study_core', true, 'parent_tap', 'v1')`, [a]);
    await q(`insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ($1, $2, $3, 7, 'CBSE', 'en', 'en', 'IN-UP')`, [c, a, name]);
  }
  await q(`insert into control.app_flags (app, module, enabled, reason) values ('family', 'videos', true, 'C522 test') on conflict (app, module) do update set enabled = true`);
  await q(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Made-up Founder')`, [FOUNDER]);
  await q(`insert into content.video_channels (channel_id, title, kind, added_by) values ($1, 'Official Science', 'official', $2)`, [OFFICIAL, FOUNDER]);
  const ai = await import('@/lib/ai/control');
  expect(await ai.setCredential(h.db.pg as never, { userId: FOUNDER }, 'youtube', KEY)).toEqual({ ok: true });
  const { signFamilySession } = await import('@/lib/family/session');
  jar = `ncf_session=${await signFamilySession({ accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' })}; ncf_child=${CHILD}`;
  R = { click: await import('@/app/api/family/videos/click/route'), health: await import('@/lib/control/health') };
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.hostname === 'sponsor.ajay.app') return new Response('Not Found', { status: 404 });
    if (url.pathname === '/oembed') return Response.json({ title: 't' });
    yt.seen.push(url);
    if (url.pathname.endsWith('/search')) return Response.json({ items: yt.ids.map((videoId) => ({ id: { kind: 'youtube#video', videoId } })) });
    if (url.pathname.endsWith('/videos')) return Response.json({ items: (url.searchParams.get('id') ?? '').split(',').map((id) => item(id, `Photosynthesis ${id}`)) });
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
  forgetSearches();
});

describe('language: the child’s chosen one, then a visible fallback', () => {
  it('tries the question’s language, then a sensible fallback: Hindi then English, English alone, never another regional language', () => {
    expect(videoLanguages('ta', 'en')).toEqual(['ta', 'en']);
    expect(videoLanguages('bn', 'hi')).toEqual(['bn', 'hi', 'en']);
    expect(videoLanguages('hi', 'hi')).toEqual(['hi', 'en']);
    expect(videoLanguages('hi', 'en')).toEqual(['hi', 'en']);
    expect(videoLanguages('en', 'en')).toEqual(['en']);
    expect(videoLanguages('en', 'hi')).toEqual(['en']);
  });

  // 17 Nov 2026: a Hindi question got Telugu videos, from the child's word-help language. The question decides.
  it('the video language is the question’s, never the word-help language (meaningLang) when they differ', () => {
    const kid = { language: 'en', style: 'en' } as const;
    const hiKid = { language: 'hi', style: 'hi' } as const;
    expect(videoLanguageOf({ question: 'विद्युत धारा क्या है?', motherTongue: 'te', child: kid })).toBe('hi');
    expect(videoLanguages(videoLanguageOf({ question: 'विद्युत धारा क्या है?', motherTongue: 'te', child: kid }), 'en')).toEqual(['hi', 'en']);
    expect(videoLanguageOf({ question: 'bijli ka current kya hota hai', motherTongue: 'ta', child: kid })).toBe('hi'); // Hinglish
    expect(videoLanguageOf({ question: 'Kachra prabandhan', motherTongue: 'te', child: hiKid })).toBe('hi'); // Roman-letter Hindi
    expect(videoLanguageOf({ question: 'What is electric current?', motherTongue: 'te', child: hiKid })).toBe('en');
    // A question really asked in Telugu or Tamil may use that language; a shared script follows the mother tongue.
    expect(videoLanguageOf({ question: 'విద్యుత్ ప్రవాహం అంటే ఏమిటి?', motherTongue: 'en', child: kid })).toBe('te');
    expect(videoLanguageOf({ question: 'मला विद्युत धारा सांगा', motherTongue: 'mr', child: kid })).toBe('mr');
    // No words (a photo, a drawing): the reply setting, never the word-help language.
    expect(videoLanguageOf({ question: null, motherTongue: 'te', child: hiKid })).toBe('hi');
    expect(videoLanguageOf({ question: '', replyLang: 'hinglish', motherTongue: 'te', child: kid })).toBe('hi');
    expect(videoLanguageOf({ question: null, motherTongue: 'ta', child: kid })).toBe('en');
  });

  it('a Hindi question from a child whose word-help language is Telugu: hi then en, never the Telugu picks already cached', async () => {
    const key = 'free.c10.electric-current-circuit';
    await q(`delete from family.child_settings where account_id = $1`, [ACCOUNT]);
    await q(`insert into family.child_settings (account_id, child_id, settings) values ($1, $2, '{"meaningLang":"te"}'::jsonb)`, [ACCOUNT, CHILD]);
    await q(
      `insert into content.video_picks (topic_key, language, video_id, channel_id, channel_title, title, duration_s, start_s, captions, score, status, fetched_at)
       values ($1, 'te', 'telugupick1', $2, 'Official Science', 'విద్యుత్ ప్రవాహం 1', 300, 0, true, 50, 'auto', now()),
              ($1, 'te', 'telugupick2', $2, 'Official Science', 'విద్యుత్ ప్రవాహం 2', 300, 0, true, 49, 'auto', now()),
              ($1, 'hi', 'hindipick01', $2, 'Official Science', 'विद्युत धारा', 300, 0, true, 50, 'auto', now()),
              ($1, 'hi', 'hindipick02', $2, 'Official Science', 'Electric current Hindi', 300, 0, true, 48, 'auto', now()),
              ($1, 'hi', 'hindiwrong1', $2, 'తెలుగు చానెల్', 'Electric current', 300, 0, true, 60, 'auto', now())`,
      [key, OFFICIAL]
    );
    const kid = { ...child, classLevel: 10, firstName: 'Asha', style: 'en' } as unknown as FamilyChild;
    const freeLine = { subject: 'science', key, chapterEn: 'Electric current', topicEn: 'Electric current', title: 'Electric current' } as Line;
    const topic = await asFamily((db) => videoTopicOf(db, { line: freeLine, passages: [], drawTemplate: null, child: kid, accountId: ACCOUNT, question: 'विद्युत धारा और परिपथ क्या है?' }));
    expect(topic?.language).toBe('hi');
    const got = await answerVideos(asFamily as never, topic!);
    expect(got).toMatchObject({ language: 'hi', wanted: null });
    // Only Hindi rows, and never one whose channel is in Telugu script.
    expect(got!.picks.map((p) => p.videoId).sort()).toEqual(['hindipick01', 'hindipick02']);
    await q(`delete from family.child_settings where account_id = $1`, [ACCOUNT]);
  });

  it('names the language in the search and asks YouTube for it; anything odd searches as English', async () => {
    expect(videoQuery({ subject: 'science', topicEn: 'Photosynthesis', title: 'Photosynthesis' }, { classLevel: 7, language: 'en' }, 'ta')).toBe('Photosynthesis science class 7 Tamil');
    const seen: URL[] = [];
    vi.stubGlobal('fetch', async (u: string | URL) => (seen.push(new URL(String(u))), Response.json({ items: [] })));
    await searchVideoIds(KEY, { query: 'x', language: 'ta' });
    await searchVideoIds(KEY, { query: 'x', language: 'ta-IN' });
    expect(seen.map((u) => u.searchParams.get('relevanceLanguage'))).toEqual(['ta', 'en']);
    expect(seen.every((u) => u.searchParams.get('regionCode') === 'IN')).toBe(true);
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.hostname === 'sponsor.ajay.app') return new Response('Not Found', { status: 404 });
    if (url.pathname === '/oembed') return Response.json({ title: 't' });
      yt.seen.push(url);
      if (url.pathname.endsWith('/search')) return Response.json({ items: yt.ids.map((videoId) => ({ id: { kind: 'youtube#video', videoId } })) });
      if (url.pathname.endsWith('/videos')) return Response.json({ items: (url.searchParams.get('id') ?? '').split(',').map((id) => item(id, `Photosynthesis ${id}`)) });
      return new Response('{}', { status: 404 });
    });
  });

  it('keeps a regional pick only when it is in that language (audio, or the title’s script)', () => {
    expect(inLanguage({ language: 'ta', title: 'x' }, 'ta')).toBe(true);
    expect(inLanguage({ language: 'en', title: 'x' }, 'ta')).toBe(false);
    expect(inLanguage({ language: null, title: 'ஒளிச்சேர்க்கை' }, 'ta')).toBe(true);
    expect(inLanguage({ language: null, title: 'Photosynthesis' }, 'ta')).toBe(false);
    expect(inLanguage({ language: 'en', title: 'x' }, 'hi')).toBe(true);
    // English and Hindi are strict (17 Nov 2026): no Telugu or Tamil audio, title or channel.
    expect(inLanguage({ language: 'hi', title: 'विद्युत धारा' }, 'hi')).toBe(true);
    expect(inLanguage({ language: 'te', title: 'Electric current' }, 'hi')).toBe(false);
    expect(inLanguage({ language: 'ta-IN', title: 'Electric current' }, 'en')).toBe(false);
    expect(inLanguage({ language: null, title: 'విద్యుత్ ప్రవాహం' }, 'hi')).toBe(false);
    expect(inLanguage({ language: null, title: 'மின்னோட்டம்' }, 'en')).toBe(false);
    expect(inLanguage({ language: 'en', title: 'Electric current', channelTitle: 'தமிழ் அறிவியல்' }, 'en')).toBe(false);
    expect(inLanguage({ language: 'en-IN', title: 'Electric current', channelTitle: 'Science Hindi' }, 'en')).toBe(true);
  });

  it('ranks the best two, official channels first', () => {
    const c = (videoId: string, channelId = 'UCother000000000000000002') => ({ videoId, channelId, channelTitle: 'C', title: 'Photosynthesis explained', durationS: 600, captions: true, embeddable: true, madeForKids: false, isPublic: true, ageRestricted: false, language: 'en', chapters: [], viewCount: 100000, likeCount: 2000, publishedAt: '2020-01-01T00:00:00Z', hasPaidPlacement: false });
    const r = rankVideos([c('aaaaaaaaaaa'), c('bbbbbbbbbbb'), c('ccccccccccc'), c('ddddddddddd'), c('fffffffffff', OFFICIAL)], { topicTitles: ['Photosynthesis'], language: 'en', channels: [{ channelId: OFFICIAL, kind: 'official' }], wider: true });
    expect(r.map((p) => p.video_id)).toEqual(['fffffffffff', 'aaaaaaaaaaa']);
  });

  it('Tamil chosen, none found in Tamil: English picks, marked with the wanted language; then no search again', async () => {
    yt.ids = ['vidaaaaaaa1', 'vidaaaaaaa2', 'vidaaaaaaa3'];
    yt.lang = 'en';
    const first = await answerVideos(asFamily as never, { line: line(TOPIC), child, accountId: ACCOUNT, language: 'ta' });
    expect(first).toMatchObject({ topicKey: TOPIC, language: 'en', wanted: 'ta' });
    expect(first!.picks.length).toBeGreaterThanOrEqual(2);
    expect(first!.picks.length).toBeLessThanOrEqual(4);
    const spent = searches();
    expect(spent).toBeGreaterThanOrEqual(2); // one for Tamil (found nothing), one for English
    // The same topic again, from another child or the same: nothing is searched (the Tamil miss is cached too).
    forgetSearches();
    yt.seen = [];
    const again = await answerVideos(asFamily as never, { line: line(TOPIC), child, accountId: OTHER_ACCOUNT, language: 'ta' });
    expect(again?.picks.map((p) => p.videoId)).toEqual(first!.picks.map((p) => p.videoId));
    expect(searches()).toBe(0);
    expect(await q(`select language, found from content.video_topic_searches where topic_key = $1 order by language`, [TOPIC])).toEqual([
      { language: 'en', found: first!.picks.length },
      { language: 'ta', found: 0 },
    ]);
  });

  it('the chosen language with enough picks: no fallback and no note', async () => {
    yt.ids = ['vidtamil001', 'vidtamil002'];
    yt.lang = 'ta';
    const got = await answerVideos(asFamily as never, { line: line('cbse.c7.science.ch01.t03'), child, accountId: ACCOUNT, language: 'ta' });
    expect(got).toMatchObject({ language: 'ta', wanted: null });
    yt.lang = 'en';
  });
});

describe('the shared cache and the daily cap', () => {
  it('a topic is claimed once: a second request at the same time does not search', async () => {
    expect((await asFamily((db) => db.query(`select content.claim_video_topic($1, 'en', 7) as ok`, ['cbse.c7.science.ch09.t01']))).rows[0].ok).toBe(true);
    expect((await asFamily((db) => db.query(`select content.claim_video_topic($1, 'en', 7) as ok`, ['cbse.c7.science.ch09.t01']))).rows[0].ok).toBe(false);
    // A claim no search could use (no key, no quota) is freed for the next request.
    await asFamily((db) => db.query(`select content.finish_video_topic($1, 'en', null)`, ['cbse.c7.science.ch09.t01']));
    expect((await asFamily((db) => db.query(`select content.claim_video_topic($1, 'en', 7) as ok`, ['cbse.c7.science.ch09.t01']))).rows[0].ok).toBe(true);
    // A family cannot read or write the cache table itself.
    await expect(asFamily((db) => db.query(`select * from content.video_topic_searches`))).rejects.toThrow();
  });

  it('with the day’s searches spent: no search, no videos, and the topic is free to search tomorrow', async () => {
    const used = Number((await q(`select searches from content.video_searches where day = $1::date`, [indiaDate()]))[0]?.searches ?? 0);
    await q(`insert into control.settings (key, value) values ('family.video_searches_per_day', $1::jsonb) on conflict (key) do update set value = excluded.value`, [JSON.stringify(used)]);
    yt.ids = ['vidcapped01', 'vidcapped02'];
    expect(await answerVideos(asFamily as never, { line: line(TOPIC2), child, accountId: ACCOUNT, language: 'en' })).toBeNull();
    expect(yt.seen).toHaveLength(0);
    expect(Number((await q(`select searches from content.video_searches where day = $1::date`, [indiaDate()]))[0].searches)).toBe(used);
    expect(await q(`select 1 from content.video_topic_searches where topic_key = $1`, [TOPIC2])).toHaveLength(0);
    await q(`update control.settings set value = '90'::jsonb where key = 'family.video_searches_per_day'`);
  });
});

describe('See video: the click route and its store', () => {
  const click = (body: unknown, cookie = jar) => R.click.POST(new NextRequest('http://localhost/api/family/videos/click', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', cookie } }));
  let videoId = '';
  beforeAll(async () => {
    videoId = String((await q(`select video_id from content.video_picks where topic_key = $1 and language = 'en' order by score desc limit 1`, [TOPIC]))[0].video_id);
  });

  it('checks the body exactly', () => {
    expect(checkClick({ topicKey: TOPIC, videoId: 'vidaaaaaaa1', lang: 'en' })).toEqual({ topicKey: TOPIC, videoId: 'vidaaaaaaa1', lang: 'en' });
    expect(checkClick({ topicKey: TOPIC, videoId: 'vidaaaaaaa1', lang: 'en', childId: OTHER_CHILD })).toBeNull();
    expect(checkClick({ topicKey: TOPIC, videoId: 'short', lang: 'en' })).toBeNull();
    expect(checkClick({ topicKey: TOPIC, videoId: 'vid"aaaaaa1', lang: 'en' })).toBeNull();
    expect(checkClick({ topicKey: TOPIC, videoId: 'vidaaaaaaa1', lang: 'fr' })).toBeNull();
    expect(checkClick({ topicKey: 'Bad Topic', videoId: 'vidaaaaaaa1', lang: 'en' })).toBeNull();
  });

  it('refuses no session, a bad body and a video the cache never offered', async () => {
    expect((await click({ topicKey: TOPIC, videoId, lang: 'en' }, '')).status).toBe(401);
    expect((await click({ topicKey: TOPIC, videoId: 'x', lang: 'en' })).status).toBe(400);
    expect((await click({ topicKey: TOPIC, videoId: 'notoffered1', lang: 'en' })).status).toBe(404);
    expect((await click({ topicKey: TOPIC, videoId, lang: 'ta' })).status).toBe(404);
    expect(await q(`select 1 from family.video_clicks`)).toHaveLength(0);
  });

  it('counts each tap for the child and returns the privacy-enhanced embed', async () => {
    const res = await click({ topicKey: TOPIC, videoId, lang: 'en' });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((await res.json()).embed).toMatch(new RegExp(`^https://www\\.youtube-nocookie\\.com/embed/${videoId}\\?`));
    expect((await click({ topicKey: TOPIC, videoId, lang: 'en' })).status).toBe(200);
    expect(await q(`select account_id, child_id, clicks from family.video_clicks where video_id = $1`, [videoId])).toEqual([{ account_id: ACCOUNT, child_id: CHILD, clicks: 2 }]);
  });

  it('never counts for another account’s child, whatever the phone says', async () => {
    const forged = jar.replace(`ncf_child=${CHILD}`, `ncf_child=${OTHER_CHILD}`);
    expect((await click({ topicKey: TOPIC, videoId, lang: 'en' }, forged)).status).toBe(200);
    expect(await q(`select 1 from family.video_clicks where child_id = $1`, [OTHER_CHILD])).toHaveLength(0);
    expect(Number((await q(`select clicks from family.video_clicks where child_id = $1 and video_id = $2`, [CHILD, videoId]))[0].clicks)).toBe(3);
  });

  it('row security: another account sees none of the rows and cannot write one for this child', async () => {
    expect((await asFamily((db) => db.query(`select * from family.video_clicks`), OTHER_ACCOUNT)).rows).toHaveLength(0);
    await expect(
      asFamily((db) => db.query(`insert into family.video_clicks (account_id, child_id, video_id, topic_key, day) values ($1, $2, 'vidaaaaaaa9', $3, current_date)`, [ACCOUNT, CHILD, TOPIC]), OTHER_ACCOUNT)
    ).rejects.toThrow();
    // On a child's own phone, only that child's rows.
    const onPhone = await h.db.pg.transaction(async (tx: any) => {
      await tx.query('set local role family_app');
      await tx.query(`select set_config('app.current_account_id', $1, true)`, [ACCOUNT]);
      await tx.query(`select set_config('app.current_child_id', $1, true)`, ['f5220000-0000-4000-8000-0000000000a9']);
      return (await tx.query(`select * from family.video_clicks`)).rows;
    });
    expect(onPhone).toHaveLength(0);
  });

  it('caps a child’s taps a day', async () => {
    await q(`update family.video_clicks set clicks = $1 where child_id = $2 and video_id = $3`, [CLICKS_PER_DAY, CHILD, videoId]);
    expect((await click({ topicKey: TOPIC, videoId, lang: 'en' })).status).toBe(429);
    await q(`update family.video_clicks set clicks = 3 where child_id = $1 and video_id = $2`, [CHILD, videoId]);
  });

  it('with videos switched off in Control: refused', async () => {
    await q(`update control.app_flags set enabled = false where app = 'family' and module = 'videos'`);
    expect((await click({ topicKey: TOPIC, videoId, lang: 'en' })).status).toBe(403);
    await q(`update control.app_flags set enabled = true where app = 'family' and module = 'videos'`);
  });

  it('Control’s health shows the week’s taps and the quota used, totals only', async () => {
    const health = await h.db.pg.transaction(async (tx: any) => {
      await tx.query('set local role nca_super');
      return R.health.loadHealth(tx, indiaDate());
    });
    expect(health.videoClicks).toEqual({ week: 3, children: 1 });
    expect(health.video.used).toBeGreaterThan(0);
    expect(JSON.stringify(health)).not.toContain(CHILD);
  });
});
