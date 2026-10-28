import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keyedProviderFor, providerCapabilities, voiceAdapterFor } from '@/lib/ai/adapters';
import { GOOGLE_LANGUAGE, googleTtsAdapter, sharedVoices } from '@/lib/ai/adapters/google-tts';
import { OPENAI_VOICE, openaiVoiceAdapter } from '@/lib/ai/adapters/openai';
import { CAPABILITIES, VOICE_TEXT_MAX, type VoiceRequest } from '@/lib/ai/adapters/types';
import { classifyFailure } from '@/lib/ai/gateway/taxonomy';
import { capableAdapter, missingCapabilities, prepareSpeak, profileById, profileNeeds } from '@/lib/ai/platform';
import { providerChoices } from '@/lib/ai/control';
import { choicesFor } from '@/components/control/ai/shared';

// C386 (Wave 4 slice 2): the two voice adapters, OpenAI's speech API and Google Cloud Text-to-Speech. The vendors are
// replaced at fetch, so nothing leaves the test. Made-up keys and text only. For each: the request's shape, the voice
// and language mapping, what a failure maps to, the key test, and that the key is in no address, result or log.

const OPENAI_KEY = `sk-${'O'.repeat(40)}KEYO`;
const GOOGLE_KEY = `AIza${'G'.repeat(31)}KEYG`;
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x01, 0x02, 0x03]);

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let reply: () => Response = () => new Response(MP3, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
const logged: string[] = [];
beforeEach(() => {
  calls = [];
  logged.length = 0;
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, level).mockImplementation((...a: unknown[]) => void logged.push(a.map(String).join(' ')));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return reply();
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  reply = () => new Response(MP3, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
});

const ask = (over: Partial<VoiceRequest>): VoiceRequest => ({ apiKey: OPENAI_KEY, model: 'gpt-4o-mini-tts', text: 'Equal fractions name the same part of a whole.', language: 'en', ...over });
const body = (c: Call) => JSON.parse(String(c.init.body));
const headers = (c: Call) => c.init.headers as Record<string, string>;
const seen = (...v: unknown[]) => JSON.stringify(v, (_k, x) => (x instanceof Uint8Array ? Array.from(x) : x));

describe('declared and registered', () => {
  it('both declare text to speech only; Control and the platform find them', () => {
    for (const a of [openaiVoiceAdapter, googleTtsAdapter]) {
      expect(Object.keys(a.capabilities).sort()).toEqual([...CAPABILITIES].sort());
      expect(a.capabilities).toEqual({ text: false, vision: false, stream: false, json: false, stt: false, tts: true });
      expect(Object.isFrozen(a.capabilities)).toBe(true);
    }
    expect(voiceAdapterFor('openai')).toBe(openaiVoiceAdapter);
    expect(voiceAdapterFor('google_tts')).toBe(googleTtsAdapter);
    expect(voiceAdapterFor('workers-ai')).toBeNull();
    expect(providerCapabilities('google_tts')).toEqual({ text: false, vision: false, stream: false, json: false, stt: false, tts: true });
    expect(providerCapabilities('openai')).toMatchObject({ text: true, stt: true, tts: true });
    // A voice-only provider's key is kept by Control, checked for a Google key's shape.
    expect(keyedProviderFor('google_tts')?.keyLooksRight(GOOGLE_KEY)).toBe(true);
    expect(keyedProviderFor('google_tts')?.keyLooksRight(OPENAI_KEY)).toBe(false);
    expect(providerChoices()).toContain('google_tts');
  });

  it('the profile needs tts: only a provider with a voice adapter can serve it, and it carries a child’s words', () => {
    const p = profileById('family.text_to_speech')!;
    expect(p).toMatchObject({ capability: 'text_to_speech', carriesChildWords: true, audience: 'family' });
    expect(profileNeeds(p)).toEqual(['tts']);
    expect(capableAdapter('family.text_to_speech', 'google_tts')).toBe(googleTtsAdapter);
    expect(capableAdapter('family.text_to_speech', 'workers-ai')).toBeNull();
    expect(capableAdapter('family.resolver', 'google_tts')).toBeNull();
    expect(missingCapabilities('family.text_to_speech', 'openai')).toEqual([]);
  });

  it('Control’s card offers only the providers that declare what the feature needs', () => {
    const providers = [
      { providerId: 'openai', capabilities: providerCapabilities('openai') },
      { providerId: 'workers-ai', capabilities: providerCapabilities('workers-ai') },
      { providerId: 'google_tts', capabilities: providerCapabilities('google_tts') },
      { providerId: 'anthropic', capabilities: providerCapabilities('anthropic') },
    ];
    const data = { providerChoices: ['anthropic', 'openai', 'workers-ai', 'google_tts', 'stand-in'], providers } as never;
    expect(choicesFor(data, ['tts'])).toEqual(['openai', 'google_tts', 'stand-in']);
    expect(choicesFor(data, ['text'])).toEqual(['anthropic', 'openai', 'workers-ai', 'stand-in']);
    expect(choicesFor(data, ['stt'])).toEqual(['openai', 'workers-ai', 'stand-in']);
  });
});

describe('OpenAI’s speech API', () => {
  it('posts the model, one voice and mp3; instructions only to a gpt model; the key only in the header', async () => {
    const r = await openaiVoiceAdapter.synthesize(ask({}));
    expect(r).toEqual({ ok: true, audio: MP3, mediaType: 'audio/mpeg', characters: 46 });
    expect(calls[0].url).toBe('https://api.openai.com/v1/audio/speech');
    expect(calls[0].init).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(headers(calls[0]).authorization).toBe(`Bearer ${OPENAI_KEY}`);
    expect(body(calls[0])).toEqual({ model: 'gpt-4o-mini-tts', input: 'Equal fractions name the same part of a whole.', voice: OPENAI_VOICE, response_format: 'mp3', instructions: expect.stringContaining('Indian English') });
    await openaiVoiceAdapter.synthesize(ask({ model: 'tts-1', language: 'hi', text: 'बराबर भिन्न।' }));
    expect(body(calls[1])).toEqual({ model: 'tts-1', input: 'बराबर भिन्न।', voice: OPENAI_VOICE, response_format: 'mp3' });
    await openaiVoiceAdapter.synthesize(ask({ language: 'hi', text: 'बराबर भिन्न।' }));
    expect(body(calls[2]).instructions).toContain('Hindi');
    for (const c of calls) expect(c.url).not.toContain(OPENAI_KEY);
  });

  it('maps failures to their kind: a status, a network failure, an answer that is not audio', async () => {
    const outcomes: unknown[] = [];
    for (const status of [401, 429, 400, 500]) {
      reply = () => new Response(JSON.stringify({ error: { message: `Incorrect API key provided: ${OPENAI_KEY}` } }), { status, headers: { 'content-type': 'application/json' } });
      const r = await openaiVoiceAdapter.synthesize(ask({}));
      expect(r).toEqual({ ok: false, failure: 'http', status });
      outcomes.push(r);
    }
    expect(classifyFailure({ failure: 'http', status: 401 }, { streamed: false, timedOut: false })).toMatchObject({ outcome: 'auth_failed', retryable: false });
    expect(classifyFailure({ failure: 'http', status: 429 }, { streamed: false, timedOut: false })).toMatchObject({ outcome: 'rate_limited', retryable: true });
    expect(classifyFailure({ failure: 'http', status: 400 }, { streamed: false, timedOut: false })).toMatchObject({ outcome: 'invalid_request', retryable: false });
    reply = () => new Response(JSON.stringify({ error: 'not audio' }), { status: 200, headers: { 'content-type': 'application/json' } });
    outcomes.push(await openaiVoiceAdapter.synthesize(ask({})));
    expect(outcomes[outcomes.length - 1]).toEqual({ ok: false, failure: 'bad_stream' });
    reply = () => new Response(new Uint8Array(0), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    expect(await openaiVoiceAdapter.synthesize(ask({}))).toEqual({ ok: false, failure: 'bad_stream' });
    reply = () => {
      throw new Error(`connect failed with ${OPENAI_KEY}`);
    };
    outcomes.push(await openaiVoiceAdapter.synthesize(ask({})));
    expect(outcomes[outcomes.length - 1]).toEqual({ ok: false, failure: 'network' });
    // A model id that is not a model id is refused before anything leaves.
    const n = calls.length;
    expect(await openaiVoiceAdapter.synthesize(ask({ model: '../../v1/files' }))).toEqual({ ok: false, failure: 'http', status: 400 });
    expect(calls.length).toBe(n);
    expect(seen(outcomes, logged)).not.toContain(OPENAI_KEY);
  });

  it('“Test the key” is the free model list, with the key in the header only', async () => {
    reply = () => new Response(JSON.stringify({ data: [{ id: 'tts-1' }, { id: 'gpt-4o-mini-tts' }] }), { status: 200 });
    expect(await openaiVoiceAdapter.testConnection!(OPENAI_KEY)).toEqual({ ok: true, models: ['gpt-4o-mini-tts', 'tts-1'] });
    expect(calls[0]).toMatchObject({ url: 'https://api.openai.com/v1/models', init: { method: 'GET', headers: { authorization: `Bearer ${OPENAI_KEY}` } } });
    reply = () => new Response(JSON.stringify({ error: `bad key ${OPENAI_KEY}` }), { status: 401 });
    const wrong = await openaiVoiceAdapter.testConnection!(OPENAI_KEY);
    expect(wrong).toEqual({ ok: false, failure: 'http', status: 401 });
    expect(seen(wrong, logged)).not.toContain(OPENAI_KEY);
  });
});

describe('Google Cloud Text-to-Speech', () => {
  const g = (over: Partial<VoiceRequest>) => ask({ apiKey: GOOGLE_KEY, model: 'Neural2-A', ...over });
  const answer = () => new Response(JSON.stringify({ audioContent: Buffer.from(MP3).toString('base64') }), { status: 200, headers: { 'content-type': 'application/json' } });

  it('posts the text with the language’s Indian voice and mp3; the key only in its header', async () => {
    reply = answer;
    expect(await googleTtsAdapter.synthesize(g({}))).toEqual({ ok: true, audio: MP3, mediaType: 'audio/mpeg', characters: 46 });
    expect(calls[0].url).toBe('https://texttospeech.googleapis.com/v1/text:synthesize');
    expect(calls[0].url).not.toContain(GOOGLE_KEY);
    expect(headers(calls[0])['x-goog-api-key']).toBe(GOOGLE_KEY);
    expect(calls[0].init).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(body(calls[0])).toEqual({ input: { text: 'Equal fractions name the same part of a whole.' }, voice: { languageCode: 'en-IN', name: 'en-IN-Neural2-A' }, audioConfig: { audioEncoding: 'MP3' } });
    await googleTtsAdapter.synthesize(g({ language: 'hi', text: 'बराबर भिन्न।' }));
    expect(body(calls[1]).voice).toEqual({ languageCode: 'hi-IN', name: 'hi-IN-Neural2-A' });
    await googleTtsAdapter.synthesize(g({ model: 'default', language: 'hi' }));
    expect(body(calls[2]).voice).toEqual({ languageCode: GOOGLE_LANGUAGE.hi });
  });

  it('maps failures to their kind, and refuses a voice id that could change the request', async () => {
    const outcomes: unknown[] = [];
    for (const status of [403, 429, 400, 503]) {
      reply = () => new Response(JSON.stringify({ error: { message: `API key not valid: ${GOOGLE_KEY}` } }), { status });
      outcomes.push(await googleTtsAdapter.synthesize(g({})));
      expect(outcomes[outcomes.length - 1]).toEqual({ ok: false, failure: 'http', status });
    }
    reply = () => new Response(JSON.stringify({ audioContent: 'not base64 !!' }), { status: 200 });
    outcomes.push(await googleTtsAdapter.synthesize(g({})));
    expect(outcomes[outcomes.length - 1]).toEqual({ ok: false, failure: 'bad_stream' });
    reply = () => new Response('not json', { status: 200 });
    expect(await googleTtsAdapter.synthesize(g({}))).toEqual({ ok: false, failure: 'bad_stream' });
    reply = () => {
      throw new Error(`down for ${GOOGLE_KEY}`);
    };
    outcomes.push(await googleTtsAdapter.synthesize(g({})));
    expect(outcomes[outcomes.length - 1]).toEqual({ ok: false, failure: 'network' });
    const n = calls.length;
    for (const model of ['Neural2-A/../x', 'en-IN-Neural2-A?x', '', 'neural']) expect(await googleTtsAdapter.synthesize(g({ model }))).toEqual({ ok: false, failure: 'http', status: 400 });
    expect(calls.length).toBe(n);
    expect(googleTtsAdapter.modelLooksRight('Chirp3-HD-Aoede')).toBe(true);
    expect(seen(outcomes, logged)).not.toContain(GOOGLE_KEY);
  });

  it('“Test the key” is the free voice list; the picker gets the voices both languages have', async () => {
    reply = () => new Response(JSON.stringify({ voices: [{ name: 'en-IN-Neural2-A' }, { name: 'hi-IN-Neural2-A' }, { name: 'en-IN-Wavenet-D' }, { name: 'hi-IN-Wavenet-D' }, { name: 'hi-IN-Standard-F' }, { name: 'en-US-Neural2-A' }] }), { status: 200 });
    expect(await googleTtsAdapter.testConnection!(GOOGLE_KEY)).toEqual({ ok: true, models: ['Neural2-A', 'Wavenet-D', 'default'] });
    expect(calls[0]).toMatchObject({ url: 'https://texttospeech.googleapis.com/v1/voices', init: { method: 'GET', headers: { 'x-goog-api-key': GOOGLE_KEY } } });
    expect(sharedVoices({ voices: [{ name: 'hi-IN-Bad Name' }, { name: 'en-IN-Bad Name' }] })).toEqual(['default']);
    reply = () => new Response(JSON.stringify({ error: { message: `API has not been used ... key ${GOOGLE_KEY}` } }), { status: 403 });
    const off = await googleTtsAdapter.testConnection!(GOOGLE_KEY);
    expect(off).toEqual({ ok: false, failure: 'http', status: 403 });
    expect(seen(off, logged)).not.toContain(GOOGLE_KEY);
  });

  it('the platform refuses an empty line, or one longer than its limit, before anything is read, taken or sent', async () => {
    const db = { query: vi.fn(async () => ({ rows: [] })) };
    const ctx = { accountId: 'f9e30000-0000-4000-8000-0000000000a1', childFirstNames: [], day: '2026-10-28' };
    expect(await prepareSpeak(db as never, ctx, 'family.text_to_speech', { text: 'x'.repeat(VOICE_TEXT_MAX + 1), language: 'en' })).toEqual({ ok: false, reason: 'failed' });
    expect(await prepareSpeak(db as never, ctx, 'family.text_to_speech', { text: '   ', language: 'en' })).toEqual({ ok: false, reason: 'failed' });
    expect(await prepareSpeak(db as never, ctx, 'family.text_to_speech', { text: 'Hello.', language: 'fr' as never })).toEqual({ ok: false, reason: 'failed' });
    expect(db.query).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});
