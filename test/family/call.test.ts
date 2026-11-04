import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { STAND_IN_AUDIO, standInVoiceAdapter } from '@/lib/ai/adapters';
import { openaiRealtimeAdapter } from '@/lib/ai/adapters/openai-realtime';
import { aiEncryptionKey, sealAiKey } from '@/lib/ai/credentials';
import { BOARD_HIDDEN, CALL_SENTENCE_MAX, CALL_SENTENCE_MIN, callSpeech, cleanMarks, splitSpeech } from '@/lib/family/call';
import { callTutorName } from '@/lib/family/call-words';
import type { PublicBlock } from '@/lib/family/resolver';
import { openCallLine, openLine, sealCallLine, sealLine } from '@/lib/family/voice-out';

// W16-A4, the call: listen, answer, speak sentence by sentence, with captions. On the real migrations (PGlite) and the
// real AI platform with the stand-in providers (the tutor's model is a scripted stream, as in test/family/w9a-chats.test.ts).
//   1. The sentence splitter and what a block says aloud (pure).
//   2. A turn: the understand route answers a call with the blocks and, after each, its spoken sentences each with a seal;
//      the speak route reads them in that order; a phone cannot make a seal, and no seal opens as another kind.
//   3. The gates and caps are the microphone's own: the parent's yes, the module, the day's speaking seconds.
//   4. Nothing of the audio is stored.
//   5. The realtime slot: 503 `not_switched_on` with no provider; a token with one (the vendor replaced).
//   6. The latency marks: one structured line, nothing stored.

const ai = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock('@/lib/ai/platform', async (original) => ({
  ...(await original<typeof import('@/lib/ai/platform')>()),
  activePromptVersion: async () => 'v1',
  prepareModeration: async () => ({ ok: true, moderation: { check: async () => ({ safe: true, categories: [] }), record: async () => {} } }),
  prepareText: async () => ({
    ok: true,
    text: {
      send: async (onDelta: (t: string) => void = () => {}) => {
        for (const l of ai.lines) onDelta(`${l}\n`);
        return { result: { ok: true, text: ai.lines.join('\n'), tokensIn: 10, tokensOut: 20, provider: 'anthropic', model: 'test-model' }, record: async () => {} };
      },
    },
  }),
}));

const ACCOUNT = 'f9c40000-0000-4000-8000-0000000000a1';
const NO_VOICE = 'f9c40000-0000-4000-8000-0000000000b1';
const CHILD = 'f9c40000-0000-4000-8000-0000000000c1';
const SIBLING = 'f9c40000-0000-4000-8000-0000000000c2';
const NO_VOICE_CHILD = 'f9c40000-0000-4000-8000-0000000000c4';
const VERSION = 'f9c40000-0000-4000-8000-0000000000e1';
const FOUNDER = 'f9c40000-0000-4000-8000-0000000000f1';

const IDEA = 'Equal fractions name the same part of a whole.';
const P1 = 'Half of a roti is the same as two quarters. Cut it again and nothing is lost!';
const EXAMPLE = '1/2 is the same as 2/4, and it is also the same as 3/6.';
const ANSWER = [
  JSON.stringify({ type: 'subject', subject: 'mathematics' }),
  JSON.stringify({ type: 'explanation', title: 'Equal parts', idea: IDEA, paragraphs: [P1], example: EXAMPLE, steps: ['Multiply', 'Compare'], terms: [] }),
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
const cookie = async (account: string, child: string) => {
  const { signFamilySession } = await import('@/lib/family/session');
  return `ncf_session=${await signFamilySession({ accountId: account, tokenVersion: 0, sessionId: 's1' })}; ncf_child=${child}`;
};
const ROUTES = {
  understand: () => import('@/app/api/family/understand/route'),
  'voice/speak': () => import('@/app/api/family/voice/speak/route'),
  voice: () => import('@/app/api/family/voice/route'),
  'voice/call/token': () => import('@/app/api/family/voice/call/token/route'),
  'voice/call/marks': () => import('@/app/api/family/voice/call/marks/route'),
};
const post = async (path: string, route: keyof typeof ROUTES, body: unknown, account = ACCOUNT, child = CHILD) => {
  const { POST } = await ROUTES[route]();
  return POST(new NextRequest(`http://localhost/api/family/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: await cookie(account, child) }, body: JSON.stringify(body) })) as Promise<Response>;
};
type Say = { t: 'say'; lines: { text: string; token: string }[] };
type Ev = { t: string; block?: PublicBlock; lines?: Say['lines']; message?: string; chat?: { chatId: string } };
const askCall = async (text: string, extra: Record<string, unknown> = {}, account = ACCOUNT, child = CHILD) => {
  const res = await post('understand', 'understand', { kind: 'question', text, tutor: { subject: 'mathematics' }, ...extra }, account, child);
  return (await res.text()).trim().split('\n').map((l) => JSON.parse(l) as Ev);
};
const speak = async (body: unknown, account = ACCOUNT, child = CHILD) => {
  const res = await post('voice/speak', 'voice/speak', body, account, child);
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, type, body: type.startsWith('audio/') ? new Uint8Array(await res.arrayBuffer()) : await res.json() };
};
const spoken: string[] = [];
const voiceOn = () => q(`update control.ai_profiles set provider_id = 'stand-in', model = 'voice', fallback = '[]', enabled = true where profile_id = 'family.text_to_speech'`);
const voiceOff = () => q(`update control.ai_profiles set provider_id = null, model = null, fallback = '[]' where profile_id = 'family.text_to_speech'`);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-call-0123456789abcdef';
  process.env.AI_PLATFORM_STAND_IN = 'on';
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_CREDENTIALS_KEY_VERSION = '1';
  ai.lines = ANSWER;
  await db.pg.exec(`
    update control.settings set value = '[]'::jsonb where key in ('family.open_subjects', 'family.reviewed_only_subjects');
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'call@example.org'), ('${NO_VOICE}', 'novoice@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values
      ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1'), ('${ACCOUNT}', 'voice_practice', true, 'parent_tap', 'v1'),
      ('${NO_VOICE}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${CHILD}', '${ACCOUNT}', 'Aarav', 9, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${SIBLING}', '${ACCOUNT}', 'Meera', 9, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${NO_VOICE_CHILD}', '${NO_VOICE}', 'Asha', 9, 'CBSE', 'en', 'en', 'IN-HR');
    insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at)
      values ('${VERSION}', 'CBSE', 9, 'mathematics', '2026-27', 1, 'published', 'everyone', 'repository', 'test', '${FOUNDER}', now());
    insert into control.ai_providers (provider_id, cleared_for_minors, cleared_terms_url, cleared_at, cleared_by) values ('stand-in', true, 'https://example.org/none', now(), '${FOUNDER}') on conflict do nothing;
    update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/none', cleared_at = now(), cleared_by = '${FOUNDER}', enabled = true where provider_id = 'stand-in';
    update control.ai_profiles set provider_id = 'stand-in', model = 'talk', fallback = '[]', enabled = true where profile_id = 'family.voice_input';
    update control.settings set value = '200'::jsonb where key = 'family.ai.daily_requests';
    update control.settings set value = '20000'::jsonb where key = 'family.voice.daily_characters';
  `);
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

describe('the sentence splitter (pure)', () => {
  it('cuts after . ! ? and the Devanagari danda, and at new lines; never inside a number', () => {
    expect(splitSpeech('Plants make their own food. They use sunlight and water! Why does that matter? It gives them energy.')).toEqual([
      'Plants make their own food.',
      'They use sunlight and water!',
      'Why does that matter?',
      'It gives them energy.',
    ]);
    expect(splitSpeech('पौधे अपना भोजन खुद बनाते हैं। वे धूप और पानी लेते हैं।')).toEqual(['पौधे अपना भोजन खुद बनाते हैं।', 'वे धूप और पानी लेते हैं।']);
    expect(splitSpeech('The value is 3.5 metres long today.\nThe next line starts here.')).toEqual(['The value is 3.5 metres long today.', 'The next line starts here.']);
  });

  it('joins a piece shorter than the least into the next one, and a short last piece into the one before', () => {
    expect(splitSpeech('Yes. That is right, and here is why it works.')).toEqual(['Yes. That is right, and here is why it works.']);
    expect(splitSpeech('That is right, and here is why it works. Ok.')).toEqual(['That is right, and here is why it works. Ok.']);
    expect(splitSpeech('Ok.')).toEqual(['Ok.']);
    for (const s of splitSpeech('A. B. C. D. Then a long enough sentence follows here. E.')) expect(s.length).toBeGreaterThanOrEqual(CALL_SENTENCE_MIN);
  });

  it('drops empty pieces and pieces with no letter or number, and cuts an endless sentence at a space', () => {
    expect(splitSpeech('  \n ... \n -- ')).toEqual([]);
    const long = Array.from({ length: 80 }, () => 'word').join(' ');
    const cut = splitSpeech(long);
    expect(cut.length).toBeGreaterThan(1);
    for (const s of cut) expect(s.length).toBeLessThanOrEqual(CALL_SENTENCE_MAX);
    expect(cut.join(' ')).toBe(long);
  });

  it('says only the teaching text of a block, never a title, a formula, key points or a question', () => {
    const ex = { type: 'explanation', title: 'Never said', idea: IDEA, paragraphs: [P1], example: EXAMPLE, steps: ['Never said step'], terms: [] } as PublicBlock;
    expect(callSpeech(ex)).toEqual([IDEA, P1, EXAMPLE]);
    expect(callSpeech({ type: 'worked_example', problem: 'Add 1/2 and 1/4.', steps: [{ text: 'Make the bottoms equal.', expression: '2/4 + 1/4' }], answer: 'The sum is 3/4.' } as PublicBlock)).toEqual(['Add 1/2 and 1/4.', 'Make the bottoms equal.', 'The sum is 3/4.']);
    expect(callSpeech({ type: 'key_points', points: ['x'] } as PublicBlock)).toEqual([]);
    expect(callSpeech({ type: 'check', items: [] } as PublicBlock)).toEqual([]);
    expect(BOARD_HIDDEN).toEqual(expect.arrayContaining(['check', 'practice', 'videos', 'sources']));
  });

  it('reads a mark only when its numbers are in range, and a tutor id only when the call knows it', () => {
    expect(cleanMarks({ turn: 1, textMs: 900, audioMs: 1500.4, voice: 'phone' })).toEqual({ turn: 1, textMs: 900, audioMs: 1500, voice: 'phone' });
    expect(cleanMarks({ turn: 2, textMs: null, audioMs: null, voice: 'none' })).toEqual({ turn: 2, textMs: null, audioMs: null, voice: 'none' });
    for (const bad of [{ turn: 0, textMs: 1, audioMs: 1, voice: 'phone' }, { turn: 1, textMs: -1, audioMs: 1, voice: 'phone' }, { turn: 1, textMs: 1, audioMs: 9e9, voice: 'phone' }, { turn: 1, textMs: 1, audioMs: 1, voice: 'x' }, { turn: 1, textMs: '1', audioMs: 1, voice: 'server' }]) expect(cleanMarks(bad)).toBeNull();
    expect(callTutorName('default')).toBe('fam.call.tutorDefault');
    expect(callTutorName('somebody-unknown')).toBe('fam.call.tutorDefault');
    expect(callTutorName(undefined)).toBe('fam.call.tutorDefault');
  });
});

describe('a turn of the call', () => {
  const wanted = [...splitSpeech(IDEA), ...splitSpeech(P1), ...splitSpeech(EXAMPLE)];
  let lines: Say['lines'] = [];

  it('is the same answer as a typed question, and after each checked block the sentences it speaks, sealed, in order', async () => {
    const events = await askCall('What are equal fractions?', { call: true });
    const kinds = events.map((e) => e.t);
    // The board's block first, then its spoken sentences, then the end.
    expect(kinds.filter((k) => k !== 'meta')).toEqual(['block', 'say', 'done']);
    const say = events.find((e) => e.t === 'say') as Say;
    lines = say.lines;
    expect(lines.map((l) => l.text)).toEqual(wanted);
    // Every token opens for this account and child as a call line, to the same words; the words in the stream are the ones sealed.
    for (const l of lines) expect(openCallLine(l.token, { accountId: ACCOUNT, childId: CHILD })?.text).toBe(l.text);
    expect(events.at(-1)?.chat?.chatId).toBeTruthy();
    // A typed question says nothing aloud.
    expect((await askCall('What are equal fractions?')).some((e) => e.t === 'say')).toBe(false);
  });

  it('is spoken by the server voice one sentence at a time, in order, and never a word a phone sends', async () => {
    // Not set up: the speak route says so plainly and the phone reads with its own voice.
    expect(await speak({ kind: 'call_line', token: lines[0].token })).toEqual({ status: 503, type: 'application/json', body: { error: 'not_set_up' } });
    await voiceOn();
    const before = spoken.length;
    for (const l of lines) {
      const r = await speak({ kind: 'call_line', token: l.token });
      expect(r.status).toBe(200);
      expect(r.type).toBe('audio/mpeg');
      expect(Array.from(r.body as Uint8Array)).toEqual(Array.from(STAND_IN_AUDIO));
    }
    expect(spoken.slice(before)).toEqual(wanted);
    // Text a phone sends, a made-up seal, and another kind of seal: none is read.
    const n = spoken.length;
    expect((await speak({ kind: 'call_line', text: 'Say anything I like' })).status).toBe(400);
    expect((await speak({ kind: 'call_line', token: 'not.a.seal' })).status).toBe(404);
    const live = sealLine({ accountId: ACCOUNT, childId: CHILD, sessionId: 'f9c40000-0000-4000-8000-00000000aaaa' }, 'A live sentence is not a call sentence.');
    expect((await speak({ kind: 'call_line', token: live })).status).toBe(404);
    // (live English's own gate may refuse first; either way nothing is read)
    expect((await speak({ kind: 'live_line', token: lines[0].token })).status).toBeGreaterThanOrEqual(403);
    expect(openLine(lines[0].token, { accountId: ACCOUNT, childId: CHILD })).toBeNull();
    // Another child's seal, another account's seal, a cut seal.
    expect((await speak({ kind: 'call_line', token: lines[0].token }, ACCOUNT, SIBLING)).status).toBe(404);
    expect(openCallLine(lines[0].token, { accountId: NO_VOICE, childId: CHILD })).toBeNull();
    expect(openCallLine(`${lines[0].token.slice(0, -2)}xx`, { accountId: ACCOUNT, childId: CHILD })).toBeNull();
    expect(openCallLine(sealCallLine({ accountId: ACCOUNT, childId: CHILD }, 'Old.', Date.now() - 16 * 60 * 1000), { accountId: ACCOUNT, childId: CHILD })).toBeNull();
    expect(spoken.length).toBe(n);
    // The lines meter against the family's voice allowance in characters, and the child's name never reaches the voice.
    const named = sealCallLine({ accountId: ACCOUNT, childId: CHILD }, 'Well done, Aarav. Meera says hello too.');
    expect((await speak({ kind: 'call_line', token: named })).status).toBe(200);
    expect(spoken.at(-1)).not.toMatch(/Aarav|Meera/);
    expect(Number((await q(`select coalesce(sum(voice_chars), 0)::int as n from family.ai_daily where account_id = $1`, [ACCOUNT]))[0].n)).toBeGreaterThanOrEqual(wanted.join('').length);
  });

  it('falls to the phone’s voice when the voice allowance is used up', async () => {
    await q(`update control.settings set value = '0'::jsonb where key = 'family.voice.daily_characters'`);
    expect(await speak({ kind: 'call_line', token: lines[0].token })).toEqual({ status: 429, type: 'application/json', body: { error: 'voice_allowance_reached' } });
    await q(`update control.settings set value = '20000'::jsonb where key = 'family.voice.daily_characters'`);
    await voiceOff();
  });
});

describe('the gates and caps are the microphone’s own', () => {
  it('a child whose parent has not said yes to speaking is refused in the microphone’s words, and no sentence is sealed', async () => {
    const events = await askCall('What are equal fractions?', { call: true }, NO_VOICE, NO_VOICE_CHILD);
    expect(events.filter((e) => e.t !== 'meta').map((e) => e.t)).toEqual(['refused']);
    expect(events.find((e) => e.t === 'refused')?.message).toBe('Speaking a question needs a grown-up to say yes in the parent area.');
    const mine = sealCallLine({ accountId: NO_VOICE, childId: NO_VOICE_CHILD }, 'A sentence for a child with no yes.');
    expect(await speak({ kind: 'call_line', token: mine }, NO_VOICE, NO_VOICE_CHILD)).toEqual({ status: 403, type: 'application/json', body: { error: 'consent_required' } });
  });

  it('the module switched off stops the call everywhere', async () => {
    await q(`insert into control.app_flags (app, module, enabled, reason) values ('family', 'voice_input', false, 'test') on conflict (app, module) do update set enabled = false`);
    const events = await askCall('What are equal fractions?', { call: true });
    expect(events.find((e) => e.t === 'refused')?.message).toBe('Speaking a question is not switched on yet.');
    expect((await post('voice/call/token', 'voice/call/token', {})).status).toBe(403);
    await q(`delete from control.app_flags where app = 'family' and module = 'voice_input'`);
  });

  it('the day’s speaking seconds are the cap: spent, the voice route and the realtime token refuse the same way', async () => {
    const day = (await q(`select (now() at time zone 'Asia/Kolkata')::date::text as d`))[0].d as string;
    await q(`insert into family.day_counts (account_id, child_id, day, voice_seconds) values ($1, $2, $3, 120) on conflict (child_id, day) do update set voice_seconds = 120`, [ACCOUNT, CHILD, day]);
    const heard = await post('voice', 'voice', { audio: 'AAAA', seconds: 3 });
    expect(heard.status).toBe(429);
    expect(await heard.json()).toEqual({ error: 'voice_cap', limit: 120, left: 0, maxSeconds: 0 });
    const token = await post('voice/call/token', 'voice/call/token', {});
    expect(token.status).toBe(429);
    expect((await token.json()).error).toBe('voice_cap');
    await q(`update family.day_counts set voice_seconds = 0 where child_id = $1`, [CHILD]);
  });

});

describe('nothing is stored of the audio', () => {
  it('a heard turn leaves only the seconds counted: the recording appears in no table of the family or control schemas', async () => {
    const marker = 'NCA-AUDIO-MARKER-9f3b2c71';
    const wav = Buffer.alloc(44 + 20_000);
    wav.write('RIFF', 0, 'ascii');
    wav.write('WAVE', 8, 'ascii');
    wav.writeUInt32LE(32000, 28);
    wav.write(marker, 100, 'ascii');
    const res = await post('voice', 'voice', { audio: wav.toString('base64'), seconds: 2 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: 'What is photosynthesis?', left: 118, maxSeconds: 60, ack: { text: expect.stringContaining('photosynthesis'), token: expect.any(String) } });
    expect(Number((await q(`select voice_seconds from family.day_counts where child_id = $1`, [CHILD]))[0].voice_seconds)).toBe(2);
    // W19-B: the acknowledgement the voice route sealed is a call line the speak route accepts for this child only.
    const { ack } = (await (await post('voice', 'voice', { audio: wav.toString('base64'), seconds: 2 })).json()) as { ack: { text: string; token: string } };
    expect(ack.text).toMatch(/photosynthesis/);
    expect((await speak({ kind: 'call_line', token: ack.token })).body).toEqual({ error: 'not_set_up' });
    await q(`update family.day_counts set voice_seconds = 2 where child_id = $1`, [CHILD]);
    const tables = await q(`select table_schema as s, table_name as t from information_schema.tables where table_type = 'BASE TABLE' and table_schema in ('family', 'control')`);
    const b64 = wav.subarray(96, 130).toString('base64').slice(4, 30);
    for (const { s, t } of tables) {
      const hits = await q(`select count(*)::int as n from ${s}.${t} x where x::text like $1 or x::text like $2`, [`%${marker}%`, `%${b64}%`]);
      expect(Number(hits[0].n), `${s}.${t}`).toBe(0);
    }
  });
});

describe('the realtime slot', () => {
  it('answers 503 not_switched_on with no provider, takes nothing, and the adapter mints nothing without a key', async () => {
    const used = Number((await q(`select coalesce(sum(requests), 0)::int as n from family.ai_daily where account_id = $1`, [ACCOUNT]))[0].n);
    const r = await post('voice/call/token', 'voice/call/token', {});
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'not_switched_on' });
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(Number((await q(`select coalesce(sum(requests), 0)::int as n from family.ai_daily where account_id = $1`, [ACCOUNT]))[0].n)).toBe(used);
    expect(await q(`select carries_child_words, provider_id, enabled from control.ai_profiles where profile_id = 'family.voice_call'`)).toEqual([{ carries_child_words: true, provider_id: null, enabled: true }]);
    await expect(openaiRealtimeAdapter.mintToken({ apiKey: '', model: 'gpt-realtime-test', language: 'en' })).rejects.toThrow('not_switched_on');
    const { realtimeReady } = await import('@/lib/family/voice-out');
    expect(await realtimeReady(db.pg as never, ACCOUNT)).toBe(false);
  });

  it('the minors gate holds in the database; a cleared provider with no key is the same answer', async () => {
    // Not cleared for children yet: the profile cannot go to it.
    await expect(q(`update control.ai_profiles set provider_id = 'openai', model = 'gpt-realtime-test' where profile_id = 'family.voice_call'`)).rejects.toThrow();
    await q(`update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/none', cleared_at = now(), cleared_by = $1, enabled = true where provider_id = 'openai'`, [FOUNDER]);
    await q(`update control.ai_profiles set provider_id = 'openai', model = 'gpt-realtime-test', fallback = '[]', enabled = true where profile_id = 'family.voice_call'`);
    const r = await post('voice/call/token', 'voice/call/token', {});
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'not_switched_on' });
  });

  it('with a provider and a key it mints a short-lived token for the phone: no audio path, one request place, one ledger row', async () => {
    const sealed = sealAiKey(aiEncryptionKey()!, 'openai', `sk-${'T'.repeat(40)}`);
    await q(`insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ('openai', $1, $2, $3, $4, 'TTTT', $5) on conflict (provider_id) do nothing`, [sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyVersion, FOUNDER]);
    const expiresAt = Date.now() + 60_000;
    const mint = vi.spyOn(openaiRealtimeAdapter, 'mintToken').mockResolvedValue({ ok: true, token: 'ek_test_token', expiresAt, url: 'https://realtime.example.invalid/v1', model: 'gpt-realtime-test' });
    const used = Number((await q(`select coalesce(sum(requests), 0)::int as n from family.ai_daily where account_id = $1`, [ACCOUNT]))[0].n);
    const day = (await q(`select (now() at time zone 'Asia/Kolkata')::date::text as d`))[0].d as string;
    await q(`update family.day_counts set voice_seconds = 0 where child_id = $1 and day = $2`, [CHILD, day]);
    const r = await post('voice/call/token', 'voice/call/token', {});
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store, private');
    // W19-B (the security review of 4 Nov): the token is prepaid with a block of the day (120 s limit → 120 taken, 0 left),
    // taken before the mint, and the provider is told how long the token may live.
    expect(await r.json()).toEqual({ provider: 'openai', token: 'ek_test_token', expiresAt, url: 'https://realtime.example.invalid/v1', model: 'gpt-realtime-test', grantSeconds: 120, left: 0 });
    expect(mint).toHaveBeenCalledWith({ apiKey: `sk-${'T'.repeat(40)}`, model: 'gpt-realtime-test', language: 'en', maxSeconds: 120 });
    expect(Number((await q(`select voice_seconds from family.day_counts where child_id = $1 and day = $2`, [CHILD, day]))[0].voice_seconds)).toBe(120);
    // The day is spent: the next block is refused, and nothing more is minted.
    const again = await post('voice/call/token', 'voice/call/token', {});
    expect(again.status).toBe(429);
    expect((await again.json()).error).toBe('voice_cap');
    expect(mint).toHaveBeenCalledTimes(1);
    expect(Number((await q(`select coalesce(sum(requests), 0)::int as n from family.ai_daily where account_id = $1`, [ACCOUNT]))[0].n)).toBe(used + 1);
    expect(await q(`select profile_id, provider_id, outcome from control.ai_usage_ledger where profile_id = 'family.voice_call'`)).toEqual([{ profile_id: 'family.voice_call', provider_id: 'openai', outcome: 'ok' }]);
    const { realtimeReady } = await import('@/lib/family/voice-out');
    expect(await realtimeReady(db.pg as never, ACCOUNT)).toBe(true);
    // A mint the provider refuses gives the block back to the day (100 before, 100 after).
    await q(`update family.day_counts set voice_seconds = 100 where child_id = $1 and day = $2`, [CHILD, day]);
    mint.mockResolvedValue({ ok: false, failure: 'http', status: 401 });
    expect((await post('voice/call/token', 'voice/call/token', {})).status).toBe(503);
    expect(Number((await q(`select voice_seconds from family.day_counts where child_id = $1 and day = $2`, [CHILD, day]))[0].voice_seconds)).toBe(100);
    await q(`update family.day_counts set voice_seconds = 0 where child_id = $1 and day = $2`, [CHILD, day]);
    mint.mockRestore();
    await q(`update control.ai_profiles set provider_id = null, model = null, fallback = '[]' where profile_id = 'family.voice_call'`);
  });
});

describe('the latency marks', () => {
  it('log one structured line with the numbers and nothing that names anyone, and store nothing', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const r = await post('voice/call/marks', 'voice/call/marks', { turn: 3, textMs: 820, audioMs: 1410, voice: 'phone' });
    expect(r.status).toBe(204);
    const line = info.mock.calls.map((c) => String(c[0])).find((l) => l.includes('family.call.marks'));
    expect(line).toBeTruthy();
    expect(JSON.parse(line!)).toEqual(expect.objectContaining({ event: 'family.call.marks', turn: 3, text_ms: 820, audio_ms: 1410, voice: 'phone' }));
    expect(line).not.toContain(ACCOUNT);
    expect(line).not.toContain(CHILD);
    expect((await post('voice/call/marks', 'voice/call/marks', { turn: 3, textMs: -5, audioMs: 1, voice: 'phone' })).status).toBe(400);
    info.mockRestore();
  });
});
