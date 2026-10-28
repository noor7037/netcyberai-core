import { NextRequest } from 'next/server';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { standInAdapter, standInModerationAdapter, type AdapterRequest } from '@/lib/ai/adapters';
import { englishConversationPrompt } from '@/lib/ai/prompts/family.english_conversation';
import { LivePractice } from '@/components/family/english/LivePractice';
import { LIVE_FOLD_AT, LIVE_KEEP, LIVE_VERBATIM, checkedRecap, foldPlan, replyRequest, wordsTakenUp, type LiveTurn } from '@/lib/family/english/live';
import { LIVE_KEYS } from '@/lib/family/english/words';
import { VOICE_KEYS } from '@/lib/family/voice-words';
import { familyWords } from '@/lib/family/words';

// E1 (C382): the live spoken-English tutor, on the real migrations (PGlite) and the real AI platform, with the vendor
// replaced by the stand-in adapter (spied, so each request the model would get is seen). Made-up names only.
//   1. With no speech to text set up, the API says so and the screen says so (en and hi); nothing can start.
//   2. Consent: the English course AND voice practice, else refused.
//   3. A ten-turn talk stays coherent: on turn 10 the model gets the rolling summary and the last turns, in order.
//   4. Bounded context: never more than LIVE_VERBATIM earlier turns word for word, however long the talk.
//   5. RLS: a sibling (the same account, the other child) and another account never see the turns.
//   6. The recap names only words that are in the talk, and never a score; the parent sees and clears a talk.

const ACCOUNT = 'f9e10000-0000-4000-8000-0000000000a1';
const OTHER = 'f9e10000-0000-4000-8000-0000000000b1';
const NO_VOICE = 'f9e10000-0000-4000-8000-0000000000e1';
const CHILD = 'f9e10000-0000-4000-8000-0000000000c1';
const SIBLING = 'f9e10000-0000-4000-8000-0000000000c2';
const OTHER_CHILD = 'f9e10000-0000-4000-8000-0000000000c3';
const NO_VOICE_CHILD = 'f9e10000-0000-4000-8000-0000000000c4';
const DEVICE = 'f9e10000-0000-4000-8000-0000000000d2';
const FOUNDER = 'f9e10000-0000-4000-8000-0000000000f1';
const AUDIO = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]), Buffer.from('LIVE-VOICE-SAMPLE')]).toString('base64');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
type Client = { query: (s: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
const fam = async <R,>(fn: (c: Client) => Promise<R>, account = ACCOUNT, device: { deviceId: string; childId: string } | null = null): Promise<R> =>
  (await import('@/lib/auth/db')).withFamilyContext({ accountId: account, tokenVersion: 0, device }, fn as never) as Promise<R>;

const cookie = async (account: string, child?: string, parent = false) => {
  const { signFamilySession, signParentMode } = await import('@/lib/family/session');
  const s = { accountId: account, tokenVersion: 0, sessionId: 's1' };
  const parts = [`ncf_session=${await signFamilySession(s)}`];
  if (child) parts.push(`ncf_child=${child}`);
  if (parent) parts.push(`ncf_parent=${await signParentMode(s)}`);
  return parts.join('; ');
};
const live = async () => import('@/app/api/family/english/live/route');
const get = async (account = ACCOUNT, child = CHILD) => {
  const res = await (await live()).GET(new NextRequest('http://localhost/api/family/english/live', { headers: { cookie: await cookie(account, child) } }));
  return { status: res.status, body: await res.json() };
};
// C386: a turn's reply streams as JSON lines (each checked sentence, then the kept turn or an error); the helper reads
// the stream to its end and answers as the JSON route did, keeping the events it saw in `events`.
type LiveEvent = { t: string; text?: string; voice?: string; turn?: unknown; error?: string };
let events: LiveEvent[] = [];
const post = async (body: unknown, account = ACCOUNT, child = CHILD) => {
  const res = await (await live()).POST(new NextRequest('http://localhost/api/family/english/live', { method: 'POST', headers: { cookie: await cookie(account, child), 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  if (!(res.headers.get('content-type') ?? '').includes('ndjson')) return { status: res.status, body: await res.json() };
  events = (await res.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l) as LiveEvent);
  const last = events[events.length - 1];
  return last?.t === 'turn' ? { status: res.status, body: { turn: last.turn } } : { status: 422, body: { error: last?.error ?? 'no_end' } };
};
const hear = async (account = ACCOUNT, child = CHILD) => {
  const { POST } = await import('@/app/api/family/english/live/hear/route');
  const res = await POST(new NextRequest('http://localhost/api/family/english/live/hear', { method: 'POST', headers: { cookie: await cookie(account, child), 'content-type': 'application/json' }, body: JSON.stringify({ audio: AUDIO, seconds: 3 }) }));
  return { status: res.status, body: await res.json() };
};

// The stand-in vendor: every request is kept; a summary lists the turns it was given; a recap is JSON; a reply names
// the turn it answers.
const seen: AdapterRequest[] = [];
const replies = () => seen.filter((r) => r.system.includes('English speaking partner'));
const said = (text: string) => [...text.matchAll(/say (\d+)/g)].map((m) => m[1]);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-english-live-0123456789';
  process.env.AI_PLATFORM_STAND_IN = 'on';
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'live@example.org'), ('${OTHER}', 'other-live@example.org'), ('${NO_VOICE}', 'novoice@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values
      ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1'), ('${ACCOUNT}', 'english_programme', true, 'parent_tap', 'v1'), ('${ACCOUNT}', 'voice_practice', true, 'parent_tap', 'v1'),
      ('${OTHER}', 'english_programme', true, 'parent_tap', 'v1'), ('${OTHER}', 'voice_practice', true, 'parent_tap', 'v1'),
      ('${NO_VOICE}', 'english_programme', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${CHILD}', '${ACCOUNT}', 'Aarav', 5, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${SIBLING}', '${ACCOUNT}', 'Meera', 7, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${OTHER_CHILD}', '${OTHER}', 'Kabir', 6, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${NO_VOICE_CHILD}', '${NO_VOICE}', 'Asha', 6, 'CBSE', 'en', 'en', 'IN-HR');
    insert into family.child_devices (device_id, account_id, child_id) values ('${DEVICE}', '${ACCOUNT}', '${SIBLING}');
    insert into control.app_flags (app, module, enabled, reason) values ('family', 'english_programme', true, 'test') on conflict (app, module) do update set enabled = true;
    insert into control.ai_providers (provider_id, cleared_for_minors, cleared_terms_url, cleared_at, cleared_by) values ('stand-in', true, 'https://example.org/none', now(), '${FOUNDER}') on conflict do nothing;
    update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/none', cleared_at = now(), cleared_by = '${FOUNDER}', enabled = true where provider_id = 'stand-in';
    update control.ai_profiles set provider_id = 'stand-in', model = 'talk', fallback = '[]', enabled = true where profile_id = 'family.english_conversation';
    update control.ai_profiles set provider_id = 'stand-in', model = 'guard', fallback = '[]', enabled = true where profile_id = 'family.moderation';
    update control.settings set value = '200'::jsonb where key = 'family.ai.daily_requests';
  `);
  vi.spyOn(standInAdapter, 'streamText').mockImplementation(async (request: AdapterRequest) => {
    seen.push(request);
    const user = request.messages[request.messages.length - 1].content;
    const text = request.system.includes('short notes')
      ? `Notes: said ${[...new Set((user.match(/\d+/g) ?? []).map(Number))].sort((a, b) => a - b).join(',')}.`
      : request.responseFormat === 'json'
        ? JSON.stringify({ practised: 'You bought fruit at a market stall and asked for prices.', new_words: ['mango', 'spaceship', 'Mango'] })
        : `Tutor answer ${said(user).pop() ?? '?'}: would you like a mango?`;
    return { ok: true, text, tokensIn: 1, tokensOut: 1 };
  });
  vi.spyOn(standInModerationAdapter, 'moderate').mockImplementation(async (r) => ({ ok: true, safe: !`${r.user} ${r.assistant ?? ''}`.includes('UNSAFE'), categories: [], tokensIn: 0, tokensOut: 0 }));
}, 120_000);
afterAll(async () => {
  vi.restoreAllMocks();
  delete process.env.AI_PLATFORM_STAND_IN;
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('the migration (C382)', () => {
  it('adds the workload as a children’s-words profile with no provider of its own, and the two tables', async () => {
    const { rows } = await db.pg.query(`select carries_child_words, max_output_tokens from control.ai_profiles where profile_id = 'family.english_conversation'`);
    expect(rows).toEqual([{ carries_child_words: true, max_output_tokens: 600 }]);
    expect(await q(`select relname, relrowsecurity, relforcerowsecurity from pg_class where relname in ('english_live_sessions', 'english_live_turns') order by relname`)).toEqual([
      { relname: 'english_live_sessions', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'english_live_turns', relrowsecurity: true, relforcerowsecurity: true },
    ]);
    // No column could hold a recording.
    expect((await q(`select column_name from information_schema.columns where table_name = 'english_live_turns'`)).map((r: { column_name: string }) => r.column_name).sort()).toEqual(
      ['account_id', 'child_id', 'child_text', 'created_at', 'position', 'reply', 'session_id', 'turn_id']
    );
  });
});

describe('with no speech to text set up (the acceptance test)', () => {
  it('the API says so, nothing can start, and the ear refuses', async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body.status).toEqual(expect.objectContaining({ speech: 'not_switched_on', text: 'ready', safety: 'ready' }));
    expect(await post({ action: 'start', topic: 'market' })).toEqual({ status: 503, body: expect.objectContaining({ error: 'not_set_up' }) });
    expect(await hear()).toEqual({ status: 503, body: expect.objectContaining({ error: 'ai_not_switched_on' }) });
    expect(await q(`select count(*)::int as n from family.english_live_sessions`)).toEqual([{ n: 0 }]);
  });
  it('the screen says so, in English and in Hindi', async () => {
    const { body } = await get();
    for (const [lang, words] of [['en', 'Live practice needs a speech service; it is not set up yet.'], ['hi', 'लाइव अभ्यास के लिए बोली को शब्दों में बदलने वाली सेवा चाहिए']] as const) {
      const html = renderToStaticMarkup(h(LivePractice, { w: familyWords(lang, [...LIVE_KEYS, ...VOICE_KEYS, 'fam.english.consentButton']), initial: { state: body } }));
      expect(html).toContain('data-live-not-set-up="noSpeech"');
      expect(html).toContain(words);
      expect(html).not.toContain('data-live-ready');
    }
  });
});

describe('consent', () => {
  it('needs the English course AND voice practice: without voice practice everything is refused', async () => {
    expect(await get(NO_VOICE, NO_VOICE_CHILD)).toEqual({ status: 403, body: { error: 'consent_needed' } });
    expect((await post({ action: 'start', topic: 'market' }, NO_VOICE, NO_VOICE_CHILD)).status).toBe(403);
    expect((await hear(NO_VOICE, NO_VOICE_CHILD)).body.error).toBe('consent_needed');
    const html = renderToStaticMarkup(h(LivePractice, { w: familyWords('en', [...LIVE_KEYS, ...VOICE_KEYS, 'fam.english.consentButton']), initial: { error: 'consent_needed' } }));
    expect(html).toContain('to voice practice in the parent area');
  });
  it('a withdrawn consent stops it at once', async () => {
    await q(`insert into family.consents (account_id, purpose, granted, verification_method, notice_version, created_at) values ($1, 'voice_practice', false, 'parent_tap', 'v1', now() + interval '1 second')`, [OTHER]);
    expect((await get(OTHER, OTHER_CHILD)).body.error).toBe('consent_needed');
    await q(`insert into family.consents (account_id, purpose, granted, verification_method, notice_version, created_at) values ($1, 'voice_practice', true, 'parent_tap', 'v1', now() + interval '2 seconds')`, [OTHER]);
  });

  it('withdrawing learning (study_core) stops it too, while the other two stay yes (E1 review)', async () => {
    await q(`insert into family.consents (account_id, purpose, granted, verification_method, notice_version, created_at) values ($1, 'study_core', false, 'parent_tap', 'v1', now() + interval '3 seconds')`, [OTHER]);
    expect((await get(OTHER, OTHER_CHILD)).body.error).toBe('consent_needed');
    expect((await hear(OTHER, OTHER_CHILD)).body.error).toBe('consent_needed');
    await q(`insert into family.consents (account_id, purpose, granted, verification_method, notice_version, created_at) values ($1, 'study_core', true, 'parent_tap', 'v1', now() + interval '4 seconds')`, [OTHER]);
    expect((await get(OTHER, OTHER_CHILD)).status).toBe(200);
  });

  it('Control switching voice input off stops live speech as it stops Study’s (E1 review)', async () => {
    await q(`insert into control.app_flags (app, module, enabled, reason) values ('family', 'voice_input', false, 'test') on conflict (app, module) do update set enabled = false`);
    expect((await get(OTHER, OTHER_CHILD)).body.error).toBe('off');
    expect((await hear(OTHER, OTHER_CHILD)).body.error).toBe('off');
    await q(`delete from control.app_flags where app = 'family' and module = 'voice_input'`);
  });
});

describe('a ten-turn talk (speech to text set up)', () => {
  let sessionId = '';
  beforeAll(async () => {
    await q(`update control.ai_profiles set provider_id = 'stand-in', model = 'ear', fallback = '[]', enabled = true where profile_id = 'family.voice_input'`);
  });

  it('the ear gives back only the words, and the screen is ready', async () => {
    expect(await hear()).toEqual({ status: 200, body: expect.objectContaining({ text: 'What is photosynthesis?' }) });
    const { body } = await get();
    expect(body.status).toEqual(expect.objectContaining({ speech: 'ready', text: 'ready', safety: 'ready' }));
    const html = renderToStaticMarkup(h(LivePractice, { w: familyWords('en', [...LIVE_KEYS, ...VOICE_KEYS, 'fam.english.consentButton']), initial: { state: body } }));
    expect(html).toContain('data-live-ready');
  });

  it('stays coherent: on turn 10 the model gets the summary and the last turns, in order', async () => {
    const started = await post({ action: 'start', topic: 'market' });
    expect(started.status).toBe(200);
    sessionId = started.body.session.sessionId;
    for (let k = 1; k <= 10; k++) {
      const r = await post({ action: 'say', sessionId, text: `  I say ${k} please\n` });
      expect(r).toEqual({ status: 200, body: { turn: { position: k, childText: `I say ${k} please`, reply: `Tutor answer ${k}: would you like a mango?` } } });
    }
    const tenth = replies()[9];
    // Folds after turns 6 and 9: turns 1–3, then 4–6, are in the notes; 7, 8 and 9 are word for word, then turn 10.
    expect(tenth.system).toContain('Earlier in this talk: Notes: said 1,2,3,4,5,6.');
    expect(tenth.system).toContain('buys fruit and vegetables');
    expect(tenth.messages.map((m) => `${m.role}:${m.content}`)).toEqual([
      'user:I say 7 please',
      'assistant:Tutor answer 7: would you like a mango?',
      'user:I say 8 please',
      'assistant:Tutor answer 8: would you like a mango?',
      'user:I say 9 please',
      'assistant:Tutor answer 9: would you like a mango?',
      'user:I say 10 please',
    ]);
    // Every reply's prompt held at most LIVE_VERBATIM earlier turns.
    for (const r of replies()) expect(r.messages.length).toBeLessThanOrEqual(2 * LIVE_VERBATIM + 1);
    expect(await q(`select summary, summarised_upto from family.english_live_sessions where session_id = $1`, [sessionId])).toEqual([{ summary: 'Notes: said 1,2,3,4,5,6.', summarised_upto: 6 }]);
    // The child's name never reaches the model.
    expect(JSON.stringify(seen)).not.toContain('Aarav');
  });

  it('nothing unsafe is shown or kept', async () => {
    expect(await post({ action: 'say', sessionId, text: 'UNSAFE words' })).toEqual({ status: 422, body: { error: 'unsafe' } });
    expect(await q(`select count(*)::int as n from family.english_live_turns where session_id = $1`, [sessionId])).toEqual([{ n: 10 }]);
  });

  it('a sibling and another account never see the turns', async () => {
    expect((await get(ACCOUNT, SIBLING)).body.session).toBeNull();
    expect((await post({ action: 'say', sessionId, text: 'I say 11' }, ACCOUNT, SIBLING)).status).toBe(404);
    expect(await fam(async (c) => (await c.query(`select count(*)::int as n from family.english_live_turns`)).rows, ACCOUNT, { deviceId: DEVICE, childId: SIBLING })).toEqual([{ n: 0 }]);
    expect(await fam(async (c) => (await c.query(`select count(*)::int as n from family.english_live_sessions`)).rows, ACCOUNT, { deviceId: DEVICE, childId: SIBLING })).toEqual([{ n: 0 }]);
    for (const t of ['english_live_sessions', 'english_live_turns']) expect(await fam(async (c) => (await c.query(`select count(*)::int as n from family.${t}`)).rows, OTHER)).toEqual([{ n: 0 }]);
    expect(await fam(async (c) => (await c.query(`delete from family.english_live_turns returning 1`)).rows, OTHER)).toEqual([]);
    expect((await post({ action: 'say', sessionId, text: 'I say 11' }, OTHER, OTHER_CHILD)).status).toBe(404);
    expect(await q(`select count(*)::int as n from family.english_live_turns`)).toEqual([{ n: 10 }]);
  });

  it('ends with a recap: words only from the talk, and no score', async () => {
    const r = await post({ action: 'end', sessionId });
    expect(r).toEqual({ status: 200, body: { recap: { topic: 'market', turns: 10, practised: 'You bought fruit at a market stall and asked for prices.', newWords: ['mango'] } } });
    expect((await get()).body.session).toBeNull();
    expect((await post({ action: 'say', sessionId, text: 'I say 11' })).status).toBe(404);
  });

  it('the parent sees the talk and clears it; another parent cannot', async () => {
    const sessions = await import('@/app/api/family/english/live/sessions/route');
    const list = async (account: string, child: string) => {
      const res = await sessions.GET(new NextRequest(`http://localhost/api/family/english/live/sessions?childId=${child}`, { headers: { cookie: await cookie(account, undefined, true) } }));
      return { status: res.status, body: await res.json() };
    };
    const mine = await list(ACCOUNT, CHILD);
    expect(mine.body.sessions).toHaveLength(1);
    expect(mine.body.sessions[0].turns).toHaveLength(10);
    expect((await list(OTHER, CHILD)).status).toBe(404);
    // Without parent mode, nothing.
    const child = await sessions.GET(new NextRequest(`http://localhost/api/family/english/live/sessions?childId=${CHILD}`, { headers: { cookie: await cookie(ACCOUNT, CHILD) } }));
    expect(child.status).toBe(403);
    const clear = async (account: string) =>
      (await sessions.DELETE(new NextRequest('http://localhost/api/family/english/live/sessions', { method: 'DELETE', headers: { cookie: await cookie(account, undefined, true), 'content-type': 'application/json' }, body: JSON.stringify({ sessionId }) }))).status;
    expect(await clear(OTHER)).toBe(404);
    expect(await clear(ACCOUNT)).toBe(200);
    expect(await q(`select count(*)::int as n from family.english_live_turns`)).toEqual([{ n: 0 }]);
  });

  it('the daily cap reached is said before the child speaks, and refused', async () => {
    const started = await post({ action: 'start', topic: 'food' });
    await q(`update control.settings set value = '0'::jsonb where key = 'family.ai.daily_requests'`);
    expect((await get()).body.status.requestsLeft).toBe(0);
    expect(await post({ action: 'say', sessionId: started.body.session.sessionId, text: 'I like rice' })).toEqual({ status: 429, body: { error: 'ai_cap_reached' } });
    await q(`update control.settings set value = '200'::jsonb where key = 'family.ai.daily_requests'`);
  });

  it('removing the child removes its talks', async () => {
    await q(`delete from family.children where child_id = $1`, [CHILD]);
    expect(await q(`select count(*)::int as n from family.english_live_sessions where child_id = $1`, [CHILD])).toEqual([{ n: 0 }]);
  });
});

describe('the bounded context (pure)', () => {
  const turn = (k: number): LiveTurn => ({ position: k, childText: `I say ${k}`, reply: `Answer ${k}` });
  const prompt = englishConversationPrompt(null);
  it('a prompt holds at most LIVE_VERBATIM earlier turns plus the summary, however long the talk', () => {
    const turns = Array.from({ length: 25 }, (_, i) => turn(i + 1));
    const r = replyRequest(prompt, { track: 'c', topic: 'school', summary: 'Notes so far.', turns, text: 'I say 26' });
    expect(r.messages).toHaveLength(2 * LIVE_VERBATIM + 1);
    expect(r.messages[0].content).toBe(`I say ${25 - LIVE_VERBATIM + 1}`);
    expect(r.system).toContain('Earlier in this talk: Notes so far.');
  });
  it('folds when the turns not yet summarised reach the threshold, keeping the newest', () => {
    expect(foldPlan(Array.from({ length: LIVE_FOLD_AT - 2 }, (_, i) => turn(i + 1)))).toEqual([]);
    const folded = foldPlan(Array.from({ length: LIVE_FOLD_AT - 1 }, (_, i) => turn(i + 1)));
    expect(folded.map((t) => t.position)).toEqual(Array.from({ length: LIVE_FOLD_AT - LIVE_KEEP }, (_, i) => i + 1));
  });
  it('a recap never carries a score or a remark on how the child sounds, and only words from the talk', () => {
    const turns = [turn(1), { position: 2, childText: 'I want a banana', reply: 'Here is a banana and a basket.' }];
    expect(checkedRecap('{"practised": "Your pronunciation score was 8/10.", "new_words": ["basket", "rocket", "a b"]}', 'market', turns)).toEqual({ topic: 'market', turns: 2, practised: null, newWords: ['basket'] });
    expect(checkedRecap('not json', 'market', turns).practised).toBeNull();
    expect(wordsTakenUp([{ position: 1, childText: 'Hello', reply: 'Do you like mangoes?' }, { position: 2, childText: 'Yes I like mangoes', reply: 'Good.' }])).toEqual(['mangoes']);
  });
});
