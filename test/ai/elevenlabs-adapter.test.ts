import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keyedProviderFor, providerCapabilities, speechAdapterFor, stsAdapterFor, voiceAdapterFor, nonTextProviderIds } from '@/lib/ai/adapters';
import { elevenlabsScopeMessage, elevenlabsSpeechAdapter, elevenlabsStsAdapter, elevenlabsVoiceAdapter, voiceLabels } from '@/lib/ai/adapters/elevenlabs';

// W17-A2: the ElevenLabs adapters, with the vendor replaced at fetch (nothing leaves the test; a made-up key only).
// Wire details written from the vendor's docs and NOT confirmed against a live key: the TTS path and body, the
// language_code on eleven_flash_v2_5 only, the speech-to-text field names (file, model_id, language_code), the
// speech-to-speech field names (audio, model_id), the 401 body { detail: { status: 'missing_permissions' } }.

const KEY = `sk_${'a1B2'.repeat(10)}`;
const VOICE = '21m00Tcm4TlvDq8ikWAM';
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

const headers = (c: Call) => c.init.headers as Record<string, string>;
const json = (c: Call) => JSON.parse(String(c.init.body));
const form = (c: Call) => c.init.body as FormData;
const missing = (message = 'The API key you used is missing the permission text_to_speech to execute this operation.') =>
  new Response(JSON.stringify({ detail: { status: 'missing_permissions', message } }), { status: 401, headers: { 'content-type': 'application/json' } });
// Scribe drops the nukta dot (ज़ becomes ज): a comparison folds U+093C on both sides, and the adapter never repairs words.
const foldNukta = (s: string) => s.normalize('NFD').replace(/़/g, '').normalize('NFC');

describe('declared and registered', () => {
  it('all three declare the paid-plan note and are found by the registries', () => {
    for (const a of [elevenlabsVoiceAdapter, elevenlabsSpeechAdapter, elevenlabsStsAdapter]) {
      expect(a).toMatchObject({ providerId: 'elevenlabs', termsNote: 'paid_plan_for_commercial_use', needsKey: true });
      expect(a.keyLooksRight!(KEY)).toBe(true);
      expect(a.keyLooksRight!('short')).toBe(false);
      expect(a.keyLooksRight!(`sk-${'a'.repeat(30)}`)).toBe(false);
      expect(a.keyLooksRight!('a'.repeat(201))).toBe(false);
    }
    expect(voiceAdapterFor('elevenlabs')).toBe(elevenlabsVoiceAdapter);
    expect(speechAdapterFor('elevenlabs')).toBe(elevenlabsSpeechAdapter);
    expect(stsAdapterFor('elevenlabs')).toBe(elevenlabsStsAdapter);
    expect(keyedProviderFor('elevenlabs')?.keyLooksRight(KEY)).toBe(true);
    expect(keyedProviderFor('elevenlabs')?.capability).toBe('text_to_speech');
    expect(providerCapabilities('elevenlabs')).toEqual({ text: false, vision: false, stream: false, json: false, stt: true, tts: true, sts: true, realtime: false });
    expect(nonTextProviderIds()).toContain('elevenlabs');
  });

  it('model strings: a model id and a voice id, nothing else', () => {
    const ok = (m: string) => elevenlabsVoiceAdapter.modelLooksRight(m);
    expect(ok(`eleven_flash_v2_5/${VOICE}`)).toBe(true);
    expect(ok(`eleven_multilingual_v2/${VOICE}`)).toBe(true);
    expect(ok(`eleven_turbo_v2/${VOICE}`)).toBe(false);
    expect(ok('eleven_flash_v2_5/short')).toBe(false);
    expect(ok(`eleven_flash_v2_5/${VOICE}/extra`)).toBe(false);
    expect(ok(`eleven_flash_v2_5/../${VOICE}`)).toBe(false);
    expect(ok('eleven_flash_v2_5')).toBe(false);
    expect(elevenlabsStsAdapter.modelLooksRight(`eleven_multilingual_sts_v2/${VOICE}`)).toBe(true);
    expect(elevenlabsStsAdapter.modelLooksRight(`eleven_flash_v2_5/${VOICE}`)).toBe(false);
  });
});

describe('text to speech', () => {
  it('posts to the voice with the key in xi-api-key only, mp3 out, language_code for the flash model only', async () => {
    const r = await elevenlabsVoiceAdapter.synthesize({ apiKey: KEY, model: `eleven_flash_v2_5/${VOICE}`, text: 'बराबर भिन्न।', language: 'hi' });
    expect(r).toEqual({ ok: true, audio: MP3, mediaType: 'audio/mpeg', characters: 'बराबर भिन्न।'.length });
    expect(calls[0].url).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`);
    expect(calls[0].init).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(headers(calls[0])['xi-api-key']).toBe(KEY);
    expect(headers(calls[0]).authorization).toBeUndefined();
    expect(headers(calls[0])['content-type']).toBe('application/json');
    expect(json(calls[0])).toEqual({ text: 'बराबर भिन्न।', model_id: 'eleven_flash_v2_5', language_code: 'hi' });
    await elevenlabsVoiceAdapter.synthesize({ apiKey: KEY, model: `eleven_multilingual_v2/${VOICE}`, text: 'Equal fractions.', language: 'en' });
    expect(json(calls[1])).toEqual({ text: 'Equal fractions.', model_id: 'eleven_multilingual_v2' });
    for (const c of calls) expect(c.url).not.toContain(KEY);
  });

  it('refuses a malformed model before anything leaves; an answer that is not audio is bad_stream', async () => {
    expect(await elevenlabsVoiceAdapter.synthesize({ apiKey: KEY, model: '../v1/voices', text: 'x', language: 'en' })).toEqual({ ok: false, failure: 'http', status: 400 });
    expect(calls.length).toBe(0);
    reply = () => new Response(JSON.stringify({ detail: 'nope' }), { status: 200, headers: { 'content-type': 'application/json' } });
    expect(await elevenlabsVoiceAdapter.synthesize({ apiKey: KEY, model: `eleven_flash_v2_5/${VOICE}`, text: 'x', language: 'en' })).toEqual({ ok: false, failure: 'bad_stream' });
    reply = () => {
      throw new Error(`connect failed with ${KEY}`);
    };
    const r = await elevenlabsVoiceAdapter.synthesize({ apiKey: KEY, model: `eleven_flash_v2_5/${VOICE}`, text: 'x', language: 'en' });
    expect(r).toEqual({ ok: false, failure: 'network' });
    expect(JSON.stringify([r, logged])).not.toContain(KEY);
  });

  it('“Test the key” lists the free voices as model strings, flash then multilingual for each', async () => {
    const voices = { voices: [{ voice_id: VOICE, name: 'Rachel' }, { voice_id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi' }, { voice_id: 'bad id', name: 'x' }] };
    reply = () => new Response(JSON.stringify(voices), { status: 200 });
    const r = await elevenlabsVoiceAdapter.testConnection!(KEY);
    expect(r).toEqual({
      ok: true,
      models: [`eleven_flash_v2_5/${VOICE}`, `eleven_multilingual_v2/${VOICE}`, 'eleven_flash_v2_5/AZnzlk1XvdvUeBnXmlld', 'eleven_multilingual_v2/AZnzlk1XvdvUeBnXmlld'].sort(),
    });
    expect(calls[0].url).toBe('https://api.elevenlabs.io/v1/voices');
    expect(calls[0].init).toMatchObject({ method: 'GET' });
    expect(headers(calls[0])).toEqual({ 'xi-api-key': KEY });
    expect(voiceLabels(voices)).toEqual([{ id: VOICE, name: 'Rachel' }, { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi' }]);
    // The voice's name is not in any model string.
    expect(JSON.stringify(r)).not.toContain('Rachel');
  });

  it('maps a missing scope to refused/401 and any other failure to http', async () => {
    reply = () => missing();
    expect(await elevenlabsVoiceAdapter.testConnection!(KEY)).toEqual({ ok: false, failure: 'refused', status: 401 });
    expect(await elevenlabsVoiceAdapter.synthesize({ apiKey: KEY, model: `eleven_flash_v2_5/${VOICE}`, text: 'x', language: 'en' })).toEqual({ ok: false, failure: 'refused', status: 401 });
    // A message naming a permission counts even without the status code word.
    reply = () => new Response(JSON.stringify({ detail: { message: 'Missing permission for this key' } }), { status: 401 });
    expect(await elevenlabsVoiceAdapter.testConnection!(KEY)).toEqual({ ok: false, failure: 'refused', status: 401 });
    // A wrong key, a 429 and a 500 are plain http failures; the vendor's body is never carried.
    reply = () => new Response(JSON.stringify({ detail: { status: 'invalid_api_key', message: `bad ${KEY}` } }), { status: 401 });
    const bad = await elevenlabsVoiceAdapter.testConnection!(KEY);
    expect(bad).toEqual({ ok: false, failure: 'http', status: 401 });
    for (const status of [429, 500]) {
      reply = () => new Response('{}', { status });
      expect(await elevenlabsVoiceAdapter.testConnection!(KEY)).toEqual({ ok: false, failure: 'http', status });
    }
    expect(JSON.stringify([bad, logged])).not.toContain(KEY);
  });

  it('elevenlabsScopeMessage names only a scope from our own list', () => {
    const body = { detail: { status: 'missing_permissions', message: 'The key is missing the permission speech_to_text.' } };
    expect(elevenlabsScopeMessage(401, body)).toBe('speech_to_text');
    expect(elevenlabsScopeMessage(401, { detail: { status: 'missing_permissions', message: 'unknown thing' } })).toBeNull();
    expect(elevenlabsScopeMessage(403, body)).toBeNull();
    expect(elevenlabsScopeMessage(401, null)).toBeNull();
  });
});

describe('speech to text', () => {
  const hear = (over: Partial<Parameters<typeof elevenlabsSpeechAdapter.transcribe>[0]> = {}) =>
    elevenlabsSpeechAdapter.transcribe({ apiKey: KEY, model: 'scribe_v1', audio: new Uint8Array([1, 2, 3]), mediaType: 'audio/webm', language: 'hi', ...over });

  it('posts a multipart form with file, model_id and language_code; the text is returned as heard', async () => {
    // What Scribe sends back for a child saying "ज़मीन": the nukta is gone.
    reply = () => new Response(JSON.stringify({ text: 'जमीन पर पानी है', language_code: 'hin' }), { status: 200 });
    const r = await hear();
    expect(calls[0].url).toBe('https://api.elevenlabs.io/v1/speech-to-text');
    expect(calls[0].init).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(headers(calls[0])['xi-api-key']).toBe(KEY);
    expect(headers(calls[0]).authorization).toBeUndefined();
    expect(headers(calls[0])['content-type']).toBeUndefined();
    const f = form(calls[0]);
    expect(f.get('model_id')).toBe('scribe_v1');
    expect(f.get('language_code')).toBe('hi');
    const file = f.get('file') as File;
    expect(file.name).toBe('audio.webm');
    expect(file.type).toBe('audio/webm');
    expect(r).toEqual({ ok: true, text: 'जमीन पर पानी है', tokensIn: 0, tokensOut: 0 });
    // The adapter does not restore the dot (a child's words are never altered); a comparison folds it on both sides.
    expect(r.ok && r.text).not.toBe('ज़मीन पर पानी है');
    expect(foldNukta(r.ok ? r.text : '')).toBe(foldNukta('ज़मीन पर पानी है'));
  });

  it('refuses a model that is not a scribe model; maps scope and other failures', async () => {
    expect(await hear({ model: 'whisper-1' })).toEqual({ ok: false, failure: 'http', status: 400 });
    expect(calls.length).toBe(0);
    reply = () => missing('The key is missing the permission speech_to_text.');
    expect(await hear()).toEqual({ ok: false, failure: 'refused', status: 401 });
    reply = () => new Response('{"nothing":1}', { status: 200 });
    expect(await hear()).toEqual({ ok: false, failure: 'bad_stream' });
    reply = () => new Response('{}', { status: 422 });
    expect(await hear({ language: 'en' })).toEqual({ ok: false, failure: 'http', status: 422 });
  });
});

describe('speech to speech', () => {
  it('posts the recording as audio with the sts model to the voice, and returns mp3', async () => {
    const r = await elevenlabsStsAdapter.convert({ apiKey: KEY, model: `eleven_multilingual_sts_v2/${VOICE}`, audio: new Uint8Array([9, 8, 7]), mediaType: 'audio/wav', language: 'en' });
    expect(r).toEqual({ ok: true, audio: MP3, mediaType: 'audio/mpeg', characters: 0 });
    expect(calls[0].url).toBe(`https://api.elevenlabs.io/v1/speech-to-speech/${VOICE}?output_format=mp3_44100_128`);
    expect(calls[0].init).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(headers(calls[0])['xi-api-key']).toBe(KEY);
    expect(headers(calls[0]).authorization).toBeUndefined();
    const f = form(calls[0]);
    expect(f.get('model_id')).toBe('eleven_multilingual_sts_v2');
    expect((f.get('audio') as File).name).toBe('audio.wav');
  });

  it('refuses a malformed model, and maps scope and failures', async () => {
    const run = (model = `eleven_multilingual_sts_v2/${VOICE}`) => elevenlabsStsAdapter.convert({ apiKey: KEY, model, audio: new Uint8Array([1]), mediaType: 'audio/webm', language: 'en' });
    expect(await run('eleven_flash_v2_5/' + VOICE)).toEqual({ ok: false, failure: 'http', status: 400 });
    expect(calls.length).toBe(0);
    reply = () => missing('The key is missing the permission speech_to_speech.');
    expect(await run()).toEqual({ ok: false, failure: 'refused', status: 401 });
    reply = () => new Response('{}', { status: 500 });
    expect(await run()).toEqual({ ok: false, failure: 'http', status: 500 });
  });
});
