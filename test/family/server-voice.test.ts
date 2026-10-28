import { NextRequest } from 'next/server';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { STAND_IN_AUDIO, standInAdapter, standInModerationAdapter, standInVoiceAdapter, type AdapterRequest } from '@/lib/ai/adapters';
import { LivePractice } from '@/components/family/english/LivePractice';
import { ChapterReader } from '@/components/family/reader/ChapterReader';
import { chapterView, showcaseChapter } from '@/lib/family/chapters';
import { LIVE_SENTENCE_MAX, LIVE_SENTENCE_MIN, LIVE_VERBATIM, sentenceBuffer } from '@/lib/family/english/live';
import { LIVE_KEYS } from '@/lib/family/english/words';
import { READER_KEYS } from '@/lib/family/reader-words';
import { VOICE_KEYS } from '@/lib/family/voice-words';
import { openLine, sealLine } from '@/lib/family/voice-out';
import { familyWords } from '@/lib/family/words';

// C386 (Wave 4 slice 2): the server voice. On the real migrations (PGlite) and the real AI platform, with the vendors
// replaced by the stand-in adapters (spied). Made-up names and words only.
//   1. Not set up: the speak route refuses plainly ("not_set_up"), which the phone turns into its own voice; the
//      screens say which voice reads.
//   2. It speaks only what the server holds: a chapter's narration line by its place, a live reply's sentence sealed by
//      the live route, a kept reply by session and position, each for this account's chosen child only; never text a
//      phone sends, never a sibling's or another account's.
//   3. Gates: consent, the switches, the daily cap (one place a line) and the ledger (one row an attempt).
//   4. Live English streams sentence by sentence; each sentence is checked before it is shown; the first refused one
//      stops the reply and nothing is kept; a ten-turn talk still holds the bounded context.

const ACCOUNT = 'f9e20000-0000-4000-8000-0000000000a1';
const OTHER = 'f9e20000-0000-4000-8000-0000000000b1';
const NO_STUDY = 'f9e20000-0000-4000-8000-0000000000e1';
const CHILD = 'f9e20000-0000-4000-8000-0000000000c1';
const SIBLING = 'f9e20000-0000-4000-8000-0000000000c2';
const OTHER_CHILD = 'f9e20000-0000-4000-8000-0000000000c3';
const NO_STUDY_CHILD = 'f9e20000-0000-4000-8000-0000000000c4';
const FOUNDER = 'f9e20000-0000-4000-8000-0000000000f1';
const CHAPTER = 'nc.showcase.equal-fractions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;

const cookie = async (account: string, child?: string) => {
  const { signFamilySession } = await import('@/lib/family/session');
  const parts = [`ncf_session=${await signFamilySession({ accountId: account, tokenVersion: 0, sessionId: 's1' })}`];
  if (child) parts.push(`ncf_child=${child}`);
  return parts.join('; ');
};
const speak = async (body: unknown, account = ACCOUNT, child = CHILD) => {
  const { POST } = await import('@/app/api/family/voice/speak/route');
  const res = await POST(new NextRequest('http://localhost/api/family/voice/speak', { method: 'POST', headers: { cookie: await cookie(account, child), 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, type, cache: res.headers.get('cache-control'), body: type.startsWith('audio/') ? new Uint8Array(await res.arrayBuffer()) : await res.json() };
};
type LiveEvent = { t: string; text?: string; voice?: string; turn?: { position: number; childText: string; reply: string }; error?: string };
const live = async (body: unknown, account = ACCOUNT, child = CHILD): Promise<{ status: number; events: LiveEvent[]; json?: Record<string, unknown> }> => {
  const { POST } = await import('@/app/api/family/english/live/route');
  const res = await POST(new NextRequest('http://localhost/api/family/english/live', { method: 'POST', headers: { cookie: await cookie(account, child), 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  if (!(res.headers.get('content-type') ?? '').includes('ndjson')) return { status: res.status, events: [], json: await res.json() };
  return { status: res.status, events: (await res.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l) as LiveEvent) };
};
const liveGet = async (account = ACCOUNT, child = CHILD) => {
  const { GET } = await import('@/app/api/family/english/live/route');
  const res = await GET(new NextRequest('http://localhost/api/family/english/live', { headers: { cookie: await cookie(account, child) } }));
  return { status: res.status, body: await res.json() };
};

const line0 = () => chapterView(showcaseChapter(CHAPTER)!, 'en').script[0];
const daily = async (account = ACCOUNT) => Number((await q(`select coalesce(sum(requests), 0)::int as n from family.ai_daily where account_id = $1`, [account]))[0].n);
const voiceChars = async (account = ACCOUNT) => Number((await q(`select coalesce(sum(voice_chars), 0)::int as n from family.ai_daily where account_id = $1`, [account]))[0].n);
const ledger = async () => q(`select profile_id, provider_id, outcome, tokens_in from control.ai_usage_ledger where profile_id = 'family.text_to_speech' order by attempt_id`);
const spoken: string[] = [];
const voiceOn = () => q(`update control.ai_profiles set provider_id = 'stand-in', model = 'voice', fallback = '[]', enabled = true where profile_id = 'family.text_to_speech'`);
const voiceOff = () => q(`update control.ai_profiles set provider_id = null, model = null, fallback = '[]' where profile_id = 'family.text_to_speech'`);

// The reply the stand-in writes for "say <n>", sent in small pieces like a real stream; "trouble" makes its second
// sentence one the safety check refuses.
const seen: AdapterRequest[] = [];
// Each sentence is at least LIVE_SENTENCE_MIN characters, so each is checked on its own.
const S1 = (n: string | number) => `Good, you said ${n}, and that is a lovely clear sentence to hear.`;
const S2 = 'Would you like a fresh and juicy mango from the market stall today?';
const S3 = 'Here it is, take it home and share it with your family at dinner.';
const HELLO = 'Hello friend, it is very nice to meet you here at the market today.';
const replyFor = (user: string) => (user.includes('trouble') ? `${HELLO} This is UNSAFE talk that should never be shown to anyone at all. And more words here.` : `${S1((user.match(/say (\d+)/) ?? [])[1] ?? 'it')} ${S2} ${S3}`);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-server-voice-0123456789';
  process.env.AI_PLATFORM_STAND_IN = 'on';
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'voice@example.org'), ('${OTHER}', 'other-voice@example.org'), ('${NO_STUDY}', 'nostudy@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values
      ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1'), ('${ACCOUNT}', 'english_programme', true, 'parent_tap', 'v1'), ('${ACCOUNT}', 'voice_practice', true, 'parent_tap', 'v1'),
      ('${OTHER}', 'study_core', true, 'parent_tap', 'v1'), ('${OTHER}', 'english_programme', true, 'parent_tap', 'v1'), ('${OTHER}', 'voice_practice', true, 'parent_tap', 'v1'),
      ('${NO_STUDY}', 'english_programme', true, 'parent_tap', 'v1'), ('${NO_STUDY}', 'voice_practice', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${CHILD}', '${ACCOUNT}', 'Aarav', 5, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${SIBLING}', '${ACCOUNT}', 'Meera', 7, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${OTHER_CHILD}', '${OTHER}', 'Kabir', 6, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${NO_STUDY_CHILD}', '${NO_STUDY}', 'Asha', 6, 'CBSE', 'en', 'en', 'IN-HR');
    insert into control.app_flags (app, module, enabled, reason) values ('family', 'english_programme', true, 'test') on conflict (app, module) do update set enabled = true;
    insert into control.ai_providers (provider_id, cleared_for_minors, cleared_terms_url, cleared_at, cleared_by) values ('stand-in', true, 'https://example.org/none', now(), '${FOUNDER}') on conflict do nothing;
    update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/none', cleared_at = now(), cleared_by = '${FOUNDER}', enabled = true where provider_id = 'stand-in';
    update control.ai_profiles set provider_id = 'stand-in', model = 'talk', fallback = '[]', enabled = true where profile_id in ('family.english_conversation', 'family.moderation', 'family.voice_input');
    update control.settings set value = '200'::jsonb where key = 'family.ai.daily_requests';
  `);
  vi.spyOn(standInAdapter, 'streamText').mockImplementation(async (request: AdapterRequest, onDelta: (t: string) => void) => {
    seen.push(request);
    const user = request.messages[request.messages.length - 1].content;
    const text = request.system.includes('short notes') ? 'Notes so far.' : request.responseFormat === 'json' ? '{"practised":"Talking.","new_words":[]}' : replyFor(user);
    for (const piece of text.match(/[\s\S]{1,7}/g) ?? []) onDelta(piece);
    return { ok: true, text, tokensIn: 1, tokensOut: 1 };
  });
  vi.spyOn(standInModerationAdapter, 'moderate').mockImplementation(async (r) => ({ ok: true, safe: !`${r.user} ${r.assistant ?? ''}`.includes('UNSAFE'), categories: [], tokensIn: 0, tokensOut: 0 }));
  vi.spyOn(standInVoiceAdapter, 'synthesize').mockImplementation(async (r) => {
    spoken.push(r.text);
    return { ok: true, audio: new Uint8Array(STAND_IN_AUDIO), mediaType: 'audio/mpeg', characters: r.text.length };
  });
}, 120_000);
afterAll(async () => {
  vi.restoreAllMocks();
  delete process.env.AI_PLATFORM_STAND_IN;
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('the migration (C386)', () => {
  it('adds the workload as a children’s-words profile with no provider, and Google Cloud Text-to-Speech as a provider not cleared', async () => {
    expect(await q(`select carries_child_words, provider_id, enabled from control.ai_profiles where profile_id = 'family.text_to_speech'`)).toEqual([{ carries_child_words: true, provider_id: null, enabled: true }]);
    expect(await q(`select cleared_for_minors from control.ai_providers where provider_id = 'google_tts'`)).toEqual([{ cleared_for_minors: false }]);
    // The minors gate holds in the database too: the profile cannot go to a provider not cleared.
    await expect(q(`update control.ai_profiles set provider_id = 'google_tts', model = 'Neural2-A' where profile_id = 'family.text_to_speech'`)).rejects.toThrow();
  });
});

describe('not set up', () => {
  it('the speak route says so plainly, takes no place, and the screens say the phone reads', async () => {
    const before = await daily();
    const r = await speak({ kind: 'chapter', chapterKey: CHAPTER, blockId: line0().blockId, sentence: line0().sentence });
    expect(r).toEqual(expect.objectContaining({ status: 503, body: { error: 'not_set_up' } }));
    expect(await daily()).toBe(before);
    expect((await liveGet()).body.status.tts).toBe('not_switched_on');
    for (const [lang, words] of [['en', 'Voice: this phone’s voice'], ['hi', 'आवाज़: इस फ़ोन की आवाज़']] as const) {
      const view = chapterView(showcaseChapter(CHAPTER)!, lang);
      const html = renderToStaticMarkup(h(ChapterReader, { chapterKey: CHAPTER, lang: view.lang, blocks: view.blocks as never, ids: view.ids, script: view.script, start: 0, resumed: false, w: familyWords(lang, READER_KEYS), tone: 'mathematics' }));
      expect(html).toContain('data-voice-in-use="phone"');
      expect(html).toContain(words);
    }
  });
});

describe('set up (the stand-in voice)', () => {
  beforeAll(voiceOn);

  it('reads a chapter’s narration line: audio, never cached, its characters from the voice allowance, one ledger row', async () => {
    const before = await daily();
    const charsBefore = await voiceChars();
    const rows = (await ledger()).length;
    const r = await speak({ kind: 'chapter', chapterKey: CHAPTER, blockId: line0().blockId, sentence: line0().sentence });
    expect(r.status).toBe(200);
    expect(r.type).toBe('audio/mpeg');
    expect(r.cache).toBe('no-store, private');
    expect(Array.from(r.body as Uint8Array)).toEqual(Array.from(STAND_IN_AUDIO));
    expect(spoken[spoken.length - 1]).toBe(line0().text);
    // C388: the line meters against the family's voice allowance in characters, not the AI requests.
    expect(await daily()).toBe(before);
    expect(await voiceChars()).toBe(charsBefore + line0().text.length);
    const after = await ledger();
    expect(after.length).toBe(rows + 1);
    expect(after[after.length - 1]).toEqual({ profile_id: 'family.text_to_speech', provider_id: 'stand-in', outcome: 'ok', tokens_in: line0().text.length });
    // The screens say the server voice reads, in both languages.
    expect((await liveGet()).body.status.tts).toBe('ready');
    for (const [lang, words] of [['en', 'Voice: NetCyberAI voice'], ['hi', 'आवाज़: NetCyberAI की आवाज़']] as const) {
      const view = chapterView(showcaseChapter(CHAPTER)!, lang);
      const html = renderToStaticMarkup(h(ChapterReader, { chapterKey: CHAPTER, lang: view.lang, blocks: view.blocks as never, ids: view.ids, script: view.script, start: 0, resumed: false, w: familyWords(lang, READER_KEYS), tone: 'mathematics', serverVoice: true }));
      expect(html).toContain('data-voice-in-use="server"');
      expect(html).toContain(words);
    }
  });

  it('never speaks text a phone sends, or a place that is not in the narration', async () => {
    const n = spoken.length;
    expect((await speak({ kind: 'text', text: 'Say anything I like' })).status).toBe(400);
    expect((await speak({ text: 'Say anything I like' })).status).toBe(400);
    expect((await speak({ kind: 'chapter', chapterKey: CHAPTER, blockId: line0().blockId, sentence: 9999 })).status).toBe(404);
    expect((await speak({ kind: 'chapter', chapterKey: 'nc.showcase.none', blockId: 'x', sentence: 0 })).status).toBe(404);
    expect((await speak({ kind: 'live_line', token: 'not.a.seal' })).status).toBe(404);
    expect(spoken.length).toBe(n);
  });

  it('refuses without the parent’s yes to learning', async () => {
    expect(await speak({ kind: 'chapter', chapterKey: CHAPTER, blockId: line0().blockId, sentence: line0().sentence }, NO_STUDY, NO_STUDY_CHILD)).toEqual(expect.objectContaining({ status: 403, body: { error: 'consent_needed' } }));
  });

  it('the voice allowance used up is a refusal the phone turns into its own voice; the AI requests do not stop it', async () => {
    const ask = { kind: 'chapter', chapterKey: CHAPTER, blockId: line0().blockId, sentence: line0().sentence };
    // The AI requests used up: the voice still reads (C388).
    await q(`update control.settings set value = '0'::jsonb where key = 'family.ai.daily_requests'`);
    expect((await speak(ask)).status).toBe(200);
    await q(`update control.settings set value = '200'::jsonb where key = 'family.ai.daily_requests'`);
    // Fewer characters left than the line has: refused, nothing taken, and the screens say the phone's voice reads.
    const used = await voiceChars();
    await q(`update control.settings set value = $1::jsonb where key = 'family.voice.daily_characters'`, [JSON.stringify(used + line0().text.length - 1)]);
    const n = spoken.length;
    expect(await speak(ask)).toEqual(expect.objectContaining({ status: 429, body: { error: 'voice_allowance_reached' } }));
    expect(spoken.length).toBe(n);
    expect(await voiceChars()).toBe(used);
    await q(`update control.settings set value = $1::jsonb where key = 'family.voice.daily_characters'`, [JSON.stringify(used)]);
    expect((await liveGet()).body.status.tts).not.toBe('ready');
    await q(`update control.settings set value = '20000'::jsonb where key = 'family.voice.daily_characters'`);
    expect((await liveGet()).body.status.tts).toBe('ready');
  });

  it('Control sets the allowance: a whole number from 0 to 1,000,000, audited', async () => {
    const { setVoiceAllowance, readVoiceAllowance } = await import('@/lib/control/family-settings');
    await q(`insert into users (user_id, school_id, email, role, display_name, is_active) values ($1, null, 'founder@voice.invalid', 'super_admin', 'Founder', true) on conflict do nothing`, [FOUNDER]);
    for (const bad of [-1, 1.5, '500', 1_000_001, null]) expect(await db.pg.transaction(async (c: never) => setVoiceAllowance(c, { userId: FOUNDER }, bad))).toEqual({ ok: false, code: 'bad_value' });
    expect(await db.pg.transaction(async (c: never) => setVoiceAllowance(c, { userId: FOUNDER }, 15000))).toEqual({ ok: true, chars: 15000 });
    expect(await db.pg.transaction(async (c: never) => readVoiceAllowance(c))).toBe(15000);
    expect(await q(`select before_state, after_state from audit_log where event_action = 'family.voice_allowance_set'`)).toEqual([{ before_state: { chars: 20000 }, after_state: { chars: 15000 } }]);
    await q(`update control.settings set value = '20000'::jsonb where key = 'family.voice.daily_characters'`);
  });

  it('a line the voice could not speak gives its characters back', async () => {
    const used = await voiceChars();
    vi.mocked(standInVoiceAdapter.synthesize).mockResolvedValueOnce({ ok: false, failure: 'server' } as never);
    expect((await speak({ kind: 'chapter', chapterKey: CHAPTER, blockId: line0().blockId, sentence: line0().sentence })).status).toBe(503);
    expect(await voiceChars()).toBe(used);
  });

  it('a seal opens only for its own account and child, and only whole', async () => {
    const token = sealLine({ accountId: ACCOUNT, childId: CHILD, sessionId: 'f9e20000-0000-4000-8000-00000000aaaa' }, 'Well done, Aarav.');
    expect(openLine(token, { accountId: ACCOUNT, childId: CHILD })?.text).toBe('Well done, Aarav.');
    expect(openLine(token, { accountId: ACCOUNT, childId: SIBLING })).toBeNull();
    expect(openLine(token, { accountId: OTHER, childId: CHILD })).toBeNull();
    expect(openLine(`${token.slice(0, -2)}xx`, { accountId: ACCOUNT, childId: CHILD })).toBeNull();
  });
});

describe('live English: streamed, checked sentence by sentence, spoken by the server voice', () => {
  let sessionId = '';
  let firstToken = '';

  it('streams each checked sentence with its seal, then the kept turn', async () => {
    const started = await live({ action: 'start', topic: 'market' });
    sessionId = (started.json as { session: { sessionId: string } }).session.sessionId;
    const checksBefore = vi.mocked(standInModerationAdapter.moderate).mock.calls.length;
    const r = await live({ action: 'say', sessionId, text: 'I say 1' });
    expect(r.status).toBe(200);
    // C390: the checks this reply took (the child's words, then each sentence) are written down, one row for the reply.
    const made = vi.mocked(standInModerationAdapter.moderate).mock.calls.length - checksBefore;
    expect(made).toBe(4);
    expect(await q(`select reply_profile, checks from control.ai_reply_checks order by reply_id desc limit 1`)).toEqual([{ reply_profile: 'family.english_conversation', checks: made }]);
    const { loadReplyChecks } = await import('@/lib/ai/gateway/ledger');
    const { indiaDate } = await import('@/lib/time/india');
    expect((await loadReplyChecks(db.pg as never, indiaDate())).find((x) => x.replyProfile === 'family.english_conversation')).toEqual(expect.objectContaining({ replies: expect.any(Number), most: expect.any(Number) }));
    expect(r.events.filter((e) => e.t === 'sentence').map((e) => e.text)).toEqual([S1(1), S2, S3]);
    expect(r.events[r.events.length - 1]).toEqual({ t: 'turn', turn: { position: 1, childText: 'I say 1', reply: `${S1(1)} ${S2} ${S3}` } });
    firstToken = String(r.events[0].voice);
  });

  it('the speak route reads a sealed sentence and a kept reply, for this child only', async () => {
    const line = await speak({ kind: 'live_line', token: firstToken });
    expect(line.status).toBe(200);
    expect(spoken[spoken.length - 1]).toBe(S1(1));
    const turn = await speak({ kind: 'live_turn', sessionId, position: 1 });
    expect(turn.status).toBe(200);
    expect(spoken[spoken.length - 1]).toBe(`${S1(1)} ${S2} ${S3}`);
    // A sibling (the same account, the other child) and another account: neither the seal nor the turn.
    const n = spoken.length;
    expect((await speak({ kind: 'live_line', token: firstToken }, ACCOUNT, SIBLING)).status).toBe(404);
    expect((await speak({ kind: 'live_turn', sessionId, position: 1 }, ACCOUNT, SIBLING)).status).toBe(404);
    expect((await speak({ kind: 'live_line', token: firstToken }, OTHER, OTHER_CHILD)).status).toBe(404);
    expect((await speak({ kind: 'live_turn', sessionId, position: 1 }, OTHER, OTHER_CHILD)).status).toBe(404);
    expect((await speak({ kind: 'live_turn', sessionId, position: 2 })).status).toBe(404);
    expect(spoken.length).toBe(n);
  });

  it('a child’s name never reaches the voice', async () => {
    const token = sealLine({ accountId: ACCOUNT, childId: CHILD, sessionId }, 'Well done, Aarav. Meera says hello.');
    expect((await speak({ kind: 'live_line', token })).status).toBe(200);
    expect(spoken[spoken.length - 1]).not.toMatch(/Aarav|Meera/);
  });

  it('live speech follows the live gates: the English course switched off stops it', async () => {
    await q(`update control.app_flags set enabled = false where app = 'family' and module = 'english_programme'`);
    expect(await speak({ kind: 'live_line', token: firstToken })).toEqual(expect.objectContaining({ status: 403, body: { error: 'off' } }));
    expect(await speak({ kind: 'live_turn', sessionId, position: 1 })).toEqual(expect.objectContaining({ status: 403, body: { error: 'off' } }));
    await q(`update control.app_flags set enabled = true where app = 'family' and module = 'english_programme'`);
  });

  it('a refused sentence stops the reply: what came before is safe, nothing after is shown, nothing is kept', async () => {
    const r = await live({ action: 'say', sessionId, text: 'trouble please' });
    const shown = r.events.filter((e) => e.t === 'sentence').map((e) => e.text);
    expect(shown).toEqual([HELLO]);
    expect(JSON.stringify(r.events)).not.toContain('UNSAFE');
    expect(JSON.stringify(r.events)).not.toContain('more words');
    expect(r.events[r.events.length - 1]).toEqual({ t: 'error', error: 'unsafe' });
    expect(await q(`select count(*)::int as n from family.english_live_turns where session_id = $1`, [sessionId])).toEqual([{ n: 1 }]);
  });

  it('a ten-turn talk still holds the bounded context', async () => {
    for (let k = 2; k <= 11; k++) {
      const r = await live({ action: 'say', sessionId, text: `I say ${k}` });
      expect(r.events[r.events.length - 1]).toEqual({ t: 'turn', turn: expect.objectContaining({ childText: `I say ${k}`, reply: `${S1(k)} ${S2} ${S3}` }) });
    }
    const replies = seen.filter((r) => r.system.includes('English speaking partner'));
    for (const r of replies) expect(r.messages.length).toBeLessThanOrEqual(2 * LIVE_VERBATIM + 1);
    expect(replies[replies.length - 1].system).toContain('Earlier in this talk: Notes so far.');
    expect(JSON.stringify(seen)).not.toContain('Aarav');
  });

  it('the live screen says which voice reads, in English and Hindi', async () => {
    const { body } = await liveGet();
    for (const [lang, words] of [['en', 'Voice: NetCyberAI voice'], ['hi', 'आवाज़: NetCyberAI की आवाज़']] as const) {
      const html = renderToStaticMarkup(h(LivePractice, { w: familyWords(lang, [...LIVE_KEYS, ...VOICE_KEYS, 'fam.english.consentButton']), initial: { state: body } }));
      expect(html).toContain('data-voice-in-use="server"');
      expect(html).toContain(words);
    }
    await voiceOff();
    const off = (await liveGet()).body;
    const html = renderToStaticMarkup(h(LivePractice, { w: familyWords('en', [...LIVE_KEYS, ...VOICE_KEYS, 'fam.english.consentButton']), initial: { state: off } }));
    expect(html).toContain('Voice: this phone’s voice');
  });
});

describe('the sentence buffer (pure)', () => {
  it('cuts at a sentence end followed by a space, never inside a number, and flushes the rest', () => {
    const b = sentenceBuffer();
    expect(b.push('It costs 3.5 rupees at the shop near the school, if you ask the shopkeeper nic')).toEqual([]);
    expect(b.push('ely. Do you want ')).toEqual(['It costs 3.5 rupees at the shop near the school, if you ask the shopkeeper nicely.']);
    expect(b.push('two? Yes')).toEqual([]);
    expect(b.flush()).toEqual(['Do you want two? Yes']);
    expect(b.flush()).toEqual([]);
  });
  it('joins short sentences until a piece is LIVE_SENTENCE_MIN long, so one reply makes few safety checks (W4-2 review)', () => {
    const b = sentenceBuffer();
    const reply = 'Yes. '.repeat(100);
    const pieces = [...b.push(reply), ...b.flush()];
    expect(pieces.every((p, i) => i === pieces.length - 1 || p.length >= LIVE_SENTENCE_MIN)).toBe(true);
    expect(pieces.length).toBeLessThanOrEqual(Math.ceil(reply.length / LIVE_SENTENCE_MIN));
  });
  it('a sentence with no end is cut at a space once it is long, and each piece is one plain line', () => {
    const b = sentenceBuffer();
    const long = `${'word '.repeat(60)}end`;
    const out = b.push(long);
    expect(out.length).toBe(1);
    expect(out[0].length).toBeLessThanOrEqual(LIVE_SENTENCE_MAX);
    expect(sentenceBuffer().push('**Hello**\nthere, and welcome to the market where we will practise today. ')).toEqual(['Hello there, and welcome to the market where we will practise today.']);
  });
});
