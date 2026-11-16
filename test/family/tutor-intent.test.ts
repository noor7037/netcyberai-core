import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
import { topicVideos } from '@/lib/family/video-finder';
import { forgetSearches, rankVideos, searchedEmptyLately, videoQuery } from '@/lib/family/videos';
import { intentLine, intentOf } from '@/lib/family/intent';
import { freeLine } from '@/lib/family/answer-videos';

const ACCOUNT = 'f8000000-0000-4000-8000-0000000000a1';
const CHILD = 'f8000000-0000-4000-8000-0000000000a2';
const FOUNDER = 'f8000000-0000-4000-8000-0000000000f1';
const OFFICIAL = 'UCofficial0000000000001';
const KEY = `AIza${'T'.repeat(31)}TEST`; // made up: the shape of a Google key, not a key
const DAY = 86_400_000;

type Vid = { id: string; title?: string; channel?: string; views?: string; likes?: string; published?: string; paid?: boolean; duration?: string };
const yt = vi.hoisted(() => ({ seen: [] as URL[], ids: [] as string[], vids: [] as Record<string, unknown>[], sponsor: {} as Record<string, unknown[]>, sponsorDown: false, gone: [] as string[] }));
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
    if (url.hostname === 'www.youtube.com' && url.pathname === '/oembed') return yt.gone.includes(new URL(url.searchParams.get('url') ?? 'https://x/').searchParams.get('v') ?? '') ? new Response('{}', { status: 404 }) : Response.json({ title: 't' });
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
  yt.gone = [];
  forgetSearches();
  await q(`delete from content.video_topic_searches`);
});


const kid = (over: Partial<FamilyChild> = {}) => ({ childId: CHILD, classLevel: 3, language: 'hi', firstName: 'Aarav', ...over }) as unknown as FamilyChild;
const asked = (question: string, model: { en?: string; local?: string } | null, over: Partial<FamilyChild> = {}, replyLang = 'en') => intentOf({ question, child: kid(over), subject: 'evs', replyLang, model });

describe('the intent step', () => {
  const waste = { en: 'waste management', local: 'कचरा प्रबंधन' };
  it('Kachra prabandhan, कचरा प्रबंधन, waste management and what is waste management share one topic key and one answer', () => {
    const inputs: [string, string, 'hi' | 'en'][] = [['Kachra prabandhan', 'en', 'hi'], ['कचरा प्रबंधन', 'hi', 'hi'], ['waste management', 'en', 'en'], ['what is waste management', 'en', 'en']];
    for (const [text, replyLang, lang] of inputs) {
      const i = asked(text, waste, { language: lang }, replyLang);
      expect(i.key).toBe('free.c3.waste-management');
      expect(i.topicEn).toBe('waste management');
      expect(i.topicLocal).toBe('कचरा प्रबंधन');
      expect(i.raw).toBe(false);
      expect(i.lang).toBe(lang);
    }
  });
  it('paudhe khana kaise banate hain and पौधे भोजन कैसे बनाते हैं share one key, answered in Hindi for a Hindi profile', () => {
    const food = { en: 'how plants make food', local: 'पौधे भोजन कैसे बनाते हैं' };
    const a = asked('paudhe khana kaise banate hain', food, {}, 'hinglish');
    const b = asked('पौधे भोजन कैसे बनाते हैं', food, {}, 'hi');
    expect(a.key).toBe('free.c3.plants-make-food');
    expect(b.key).toBe(a.key);
    expect(a.lang).toBe('hi');
    expect(b.lang).toBe('hi');
    expect(a.termsEn[0]).toBe('how plants make food');
    expect(a.termsLocal).toEqual(['पौधे भोजन कैसे बनाते हैं']);
  });
  it('without the tutor\'s term the typed words stand in and are marked raw', () => {
    const i = asked('Kachra prabandhan', null);
    expect(i.raw).toBe(true);
    expect(i.key).toBe('free.c3.kachra-prabandhan');
    expect(intentLine(i)?.forms.raw).toBe(true);
  });
  it('the English term must be plain English letters, else the typed words stand in', () => {
    expect(asked('कचरा प्रबंधन', { en: 'कचरा', local: 'कचरा प्रबंधन' }).raw).toBe(true);
  });
});

describe('the search and the match use every form', () => {
  const line = intentLine(asked('Kachra prabandhan', { en: 'waste management', local: 'कचरा प्रबंधन' }))!;
  it('Hindi searches the Devanagari term, English the English term, never the typed letters', () => {
    const c = { classLevel: 3, language: 'hi' } as const;
    expect(videoQuery(line, c, 'hi')).toBe('कचरा प्रबंधन पर्यावरण कक्षा 3 Hindi');
    expect(videoQuery(line, c, 'en')).toBe('waste management EVS class 3');
    expect(`${videoQuery(line, c, 'hi')} ${videoQuery(line, c, 'en')}`.toLowerCase()).not.toContain('kachra');
  });
  const cand = (id: string, title: string) => ({ videoId: id, channelId: OFFICIAL, channelTitle: 'Official', title, durationS: 570, embeddable: true, isPublic: true, ageRestricted: false, hasPaidPlacement: false, captions: true, madeForKids: false, viewCount: 90000, likeCount: 1000, publishedAt: '2024-01-01T00:00:00Z', language: null, chapters: [] } as never);
  const channels = [{ channelId: OFFICIAL, title: 'Official', kind: 'official' as const, noAds: false }];
  it('a Devanagari-titled and an English-titled video both pass for a romanised question; an unrelated one does not', () => {
    const forms = [line.topicEn ?? '', line.title, line.forms.en ?? '', line.forms.local ?? '', ...line.forms.typed];
    const got = rankVideos([cand('hindivid001', 'कचरा प्रबंधन | Waste kaise sambhale'), cand('englishvid1', 'Waste Management for kids'), cand('unrelatedv1', 'Cricket highlights')], { topicTitles: forms, language: 'hi', channels });
    expect(got.map((g) => g.video_id).sort()).toEqual(['englishvid1', 'hindivid001']);
    // With only the romanised words, as before, neither would have matched.
    expect(rankVideos([cand('hindivid001', 'कचरा प्रबंधन'), cand('englishvid1', 'Waste Management for kids')], { topicTitles: ['kachra prabandhan'], language: 'hi', channels })).toEqual([]);
  });
});

describe('the finder, on the real migrations', () => {
  const searches = () => yt.seen.filter((u) => u.pathname.endsWith('/search')).map((u) => u.searchParams.get('q')).filter((x, i, all) => all.indexOf(x) === i);
  it('searches the Devanagari term in Hindi and the English term in English, and keeps both a Hindi and an English video', async () => {
    const line = intentLine(asked('Kachra prabandhan', { en: 'waste management', local: 'कचरा प्रबंधन' }))!;
    serve(['hindivid001', 'englishvid1'], [{ id: 'hindivid001', title: 'कचरा प्रबंधन क्या है' }, { id: 'englishvid1', title: 'Waste Management for kids' }]);
    const hi = await topicVideos(asFamily as never, line as never, kid(), 'hi', { review: () => undefined });
    const en = await topicVideos(asFamily as never, line as never, kid(), 'en', { review: () => undefined });
    expect(hi.length).toBeGreaterThan(0);
    expect(en.length).toBeGreaterThan(0);
    expect(searches()).toEqual(['कचरा प्रबंधन पर्यावरण कक्षा 3 Hindi', 'waste management EVS class 3']);
    console.log('YouTube queries sent:', JSON.stringify(searches()), '| passed hi:', hi.length, 'en:', en.length);
  });
  it('a romanised or untranslated search that finds nothing is never remembered as empty', async () => {
    const raw = freeLine('Kachra prabandhan', 'evs', kid() as never)!;
    const line = { ...raw, forms: { en: null, local: null, typed: ['kachra', 'prabandhan'], raw: true } };
    serve([], []);
    expect(await topicVideos(asFamily as never, line as never, kid(), 'hi', { review: () => undefined })).toEqual([]);
    expect(searchedEmptyLately(line.key, 'hi')).toBe(false);
    const rows = await q(`select found from content.video_topic_searches where topic_key = $1 and language = 'hi'`, [line.key]);
    expect(rows.every((r) => r.found === null)).toBe(true);
    // Named by the tutor and empty: the ordinary negative cache stands.
    const named = intentLine(asked('Kachra prabandhan', { en: 'dry waste', local: 'सूखा कचरा' }, { classLevel: 4 }))!;
    await topicVideos(asFamily as never, named as never, kid({ classLevel: 4 }), 'hi', { review: () => undefined });
    expect(searchedEmptyLately(named.key, 'hi')).toBe(true);
  });
});

describe('the simulations table and the clearing migration, on the real migrations', () => {
  const ins = (embed: string, approved: boolean) =>
    q(
      `insert into content.curated_topic_sims (class, subject, topic, language, source, title, embed_url, page_url, approved)
       values ('3', 'Maths', 'fractions', 'hi', 'phet', 'Fractions', $1, $1, $2)`,
      [embed, approved],
    );
  it('content.curated_sims() returns approved rows of the language only, to the family role', async () => {
    await ins('https://phet.colorado.edu/sims/html/fractions-intro/latest/fractions-intro_hi.html', true);
    await ins('https://phet.colorado.edu/sims/html/build-a-fraction/latest/build-a-fraction_hi.html', false);
    const rows = await asFamily((db) => db.query(`select embed_url from content.curated_sims('hi')`)).then((r: any) => r.rows);
    expect(rows.map((r: any) => r.embed_url)).toEqual(['https://phet.colorado.edu/sims/html/fractions-intro/latest/fractions-intro_hi.html']);
    expect(await asFamily((db) => db.query(`select embed_url from content.curated_sims('en')`)).then((r: any) => r.rows)).toEqual([]);
    await expect(asFamily((db) => db.query('select * from content.curated_topic_sims'))).rejects.toThrow();
  });
  it('the clearing migration removes the empty free. searches and nothing else', async () => {
    await q(`insert into content.video_topic_searches (topic_key, language, found) values ('free.c3.kachra-prabandhan', 'hi', 0), ('free.c3.waste-management', 'hi', 2), ('cbse.c3.evs.ch01.t01', 'hi', 0)`);
    await q(readFileSync('supabase/migrations/20261116160000_clear_romanised_empty_video_searches.sql', 'utf8'));
    const left = (await q(`select topic_key from content.video_topic_searches where topic_key in ('free.c3.kachra-prabandhan','free.c3.waste-management','cbse.c3.evs.ch01.t01') order by 1`)).map((r: any) => r.topic_key);
    expect(left).toEqual(['cbse.c3.evs.ch01.t01', 'free.c3.waste-management']);
  });
});

describe('the video cache: reuse, removed videos, counts (follow-up)', () => {
  const pick = (key: string, id: string, extra = '') =>
    q(`insert into content.video_picks (topic_key, language, video_id, channel_id, channel_title, title, duration_s, captions, score, status ${extra ? ',' + extra.split('=')[0] : ''}) values ($1, 'en', $2, 'UCabcdefghij', 'Official Science', 'Waste', 600, true, 5, 'auto' ${extra ? ',' + extra.split('=')[1] : ''})`, [key, id]);
  const counts = async () => (await q(`select coalesce(sum(hits),0)::int as hits, coalesce(sum(misses),0)::int as misses from content.video_cache_hours`))[0];
  it('serves cached picks with no YouTube call, counts a hit, and a removed video is marked dead and dropped', async () => {
    const l = line('Waste'); await pick(l.key, 'aaaaaaaaa01'); await pick(l.key, 'aaaaaaaaa02');
    const before = await counts();
    yt.gone = ['aaaaaaaaa02'];
    expect(await ids(l)).toEqual(['aaaaaaaaa01']);
    expect(yt.seen).toEqual([]);
    expect((await counts()).hits).toBe(before.hits + 1);
    expect(await q(`select video_id from content.video_picks where topic_key = $1 and dead_at is not null`, [l.key])).toEqual([{ video_id: 'aaaaaaaaa02' }]);
    expect(await ids(l)).toEqual(['aaaaaaaaa01']);
  });
  it('a pick checked within 7 days is not checked again; an older one is', async () => {
    const l = line('Waste2'); await pick(l.key, 'bbbbbbbbb01'); await q(`update content.video_picks set checked_at = now() where topic_key = $1`, [l.key]);
    yt.gone = ['bbbbbbbbb01'];
    expect(await ids(l)).toEqual(['bbbbbbbbb01']);
    await q(`update content.video_picks set checked_at = now() - interval '8 days' where topic_key = $1`, [l.key]);
    expect(await ids(l)).toEqual([]);
  });
  it('a free topic with no picks of its own uses the same topic in its class band, never another topic', async () => {
    const { bandOf } = await import('@/lib/family/video-cache');
    expect(bandOf('free.c4.waste-management')).toEqual({ slug: 'waste-management', classes: [3, 5] });
    expect(bandOf('cbse.c9.mathematics.ch01.t01')).toBeNull();
    await pick('free.c3.compost-heaps', 'ccccccccc01'); await pick('free.c3.water-cycle', 'ccccccccc02');
    const l = { ...line('Waste'), key: 'free.c4.compost-heaps' } as Line;
    expect(await ids(l)).toEqual(['ccccccccc01']);
  });
});
