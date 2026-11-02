import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keyedProviderFor, nonTextProviderIds, providerCapabilities, realtimeAdapterFor, speechAdapterFor, voiceAdapterFor } from '@/lib/ai/adapters';
import { geminiRealtimeAdapter, geminiSpeechAdapter, geminiVoiceAdapter, pcmToWav } from '@/lib/ai/adapters/gemini-audio';
import { googleSttAdapter } from '@/lib/ai/adapters/google-stt';
import { googleTtsAdapter, googleVoiceLooksRight, normaliseGoogleVoice, sharedVoices } from '@/lib/ai/adapters/google-tts';

// W17-A4: Gemini's voice, ear and Live token, Google Cloud Speech-to-Text, and Google Cloud Text-to-Speech's voice ids.
// The vendors are replaced at fetch, so nothing leaves the test. Made-up keys and text only.

const KEY = `AIza${'G'.repeat(31)}KEYG`;
type Call = { url: string; init: RequestInit; body: any };
let calls: Call[] = [];
let reply: () => Response = () => new Response('{}', { status: 200 });
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
      return reply();
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  reply = () => new Response('{}', { status: 200 });
});

const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');
const header = (call: Call) => (call.init.headers as Record<string, string>)['x-goog-api-key'];

describe('Google Cloud Text-to-Speech voice ids', () => {
  it('lists the voices both languages share', () => {
    const body = { voices: [{ name: 'en-IN-Standard-A' }, { name: 'en-IN-Neural2-B' }, { name: 'hi-IN-Standard-A' }, { name: 'hi-IN-Wavenet-C' }] };
    expect(sharedVoices(body)).toEqual(['default', 'Standard-A']);
    expect(sharedVoices(null)).toEqual(['default']);
  });

  it('strips a leading language and never double-prefixes', () => {
    expect(normaliseGoogleVoice('hi-IN-Standard-A')).toBe('Standard-A');
    expect(normaliseGoogleVoice('en-IN-Neural2-B')).toBe('Neural2-B');
    expect(normaliseGoogleVoice('Standard-A')).toBe('Standard-A');
    expect(normaliseGoogleVoice('default')).toBe('default');
    expect(googleVoiceLooksRight('hi-IN-Standard-A')).toBe(true);
    expect(googleVoiceLooksRight('Standard-A')).toBe(true);
    expect(googleVoiceLooksRight('Standard')).toBe(false);
    expect(googleVoiceLooksRight('hi-IN-')).toBe(false);
  });

  it('sends voice.name with its language exactly once, for a prefixed or a plain id', async () => {
    reply = () => json({ audioContent: b64([1, 2, 3]) });
    for (const model of ['Standard-A', 'hi-IN-Standard-A', 'en-IN-Standard-A']) {
      await googleTtsAdapter.synthesize({ apiKey: KEY, model, text: 'नमस्ते', language: 'hi' });
      await googleTtsAdapter.synthesize({ apiKey: KEY, model, text: 'hello', language: 'en' });
    }
    expect(calls.map((c) => c.body.voice)).toEqual([
      { languageCode: 'hi-IN', name: 'hi-IN-Standard-A' },
      { languageCode: 'en-IN', name: 'en-IN-Standard-A' },
      { languageCode: 'hi-IN', name: 'hi-IN-Standard-A' },
      { languageCode: 'en-IN', name: 'en-IN-Standard-A' },
      { languageCode: 'hi-IN', name: 'hi-IN-Standard-A' },
      { languageCode: 'en-IN', name: 'en-IN-Standard-A' },
    ]);
    expect(calls[0]!.url).toBe('https://texttospeech.googleapis.com/v1/text:synthesize');
    expect(header(calls[0]!)).toBe(KEY);
  });

  it('"default" sends no voice name; a bad voice sends nothing', async () => {
    reply = () => json({ audioContent: b64([1]) });
    await googleTtsAdapter.synthesize({ apiKey: KEY, model: 'default', text: 'hi', language: 'en' });
    expect(calls[0]!.body.voice).toEqual({ languageCode: 'en-IN' });
    const bad = await googleTtsAdapter.synthesize({ apiKey: KEY, model: 'Standard', text: 'hi', language: 'en' });
    expect(bad).toEqual({ ok: false, failure: 'http', status: 400 });
    expect(calls).toHaveLength(1);
  });
});

describe('pcmToWav', () => {
  it('wraps 24 kHz 16-bit mono PCM in a 44-byte WAV header', () => {
    const pcm = new Uint8Array([1, 0, 2, 0, 3, 0]);
    const wav = pcmToWav(pcm);
    const view = new DataView(wav.buffer);
    const tag = (at: number) => String.fromCharCode(...wav.subarray(at, at + 4));
    expect(wav.length).toBe(50);
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(view.getUint32(4, true)).toBe(42);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(24_000);
    expect(view.getUint32(28, true)).toBe(48_000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(6);
    expect([...wav.subarray(44)]).toEqual([...pcm]);
  });

  it('takes another rate and channel count', () => {
    const view = new DataView(pcmToWav(new Uint8Array(4), 16_000, 2).buffer);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(28, true)).toBe(64_000);
    expect(view.getUint16(32, true)).toBe(4);
  });
});

describe('Gemini voice', () => {
  it('posts the model and voice in the vendor shape and returns WAV', async () => {
    reply = () => json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: b64([5, 0, 6, 0]) } }] } }] });
    const r = await geminiVoiceAdapter.synthesize({ apiKey: KEY, model: 'gemini-2.5-flash-preview-tts/Kore', text: 'नमस्ते', language: 'hi' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent');
    expect(calls[0]!.init.method).toBe('POST');
    expect(header(calls[0]!)).toBe(KEY);
    expect(calls[0]!.url).not.toContain(KEY);
    expect(calls[0]!.body).toEqual({
      contents: [{ parts: [{ text: 'नमस्ते' }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
    });
    expect(r.ok && r.mediaType).toBe('audio/wav');
    expect(r.ok && r.characters).toBe(6);
    if (r.ok) {
      expect(String.fromCharCode(...r.audio.subarray(0, 4))).toBe('RIFF');
      expect([...r.audio.subarray(44)]).toEqual([5, 0, 6, 0]);
    }
  });

  it('a bare speech model takes the default voice; a wrong model id is refused before any call', async () => {
    expect(geminiVoiceAdapter.modelLooksRight('gemini-2.5-flash-preview-tts')).toBe(true);
    expect(geminiVoiceAdapter.modelLooksRight('gemini-2.5-flash/Kore')).toBe(false);
    expect(geminiVoiceAdapter.modelLooksRight('gemini-2.5-flash-preview-tts/Ko re')).toBe(false);
    expect(geminiVoiceAdapter.modelLooksRight('../tts/Kore')).toBe(false);
    expect(await geminiVoiceAdapter.synthesize({ apiKey: KEY, model: 'gemini-2.5-flash', text: 'x', language: 'en' })).toEqual({ ok: false, failure: 'http', status: 400 });
    expect(calls).toHaveLength(0);
    reply = () => json({ candidates: [] });
    expect(await geminiVoiceAdapter.synthesize({ apiKey: KEY, model: 'gemini-2.5-flash-preview-tts', text: 'x', language: 'en' })).toEqual({ ok: false, failure: 'bad_stream' });
    expect(calls[0]!.body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore');
  });

  it('maps a vendor error to its kind', async () => {
    reply = () => new Response('{"error":"secret detail"}', { status: 429 });
    expect(await geminiVoiceAdapter.synthesize({ apiKey: KEY, model: 'gemini-2.5-flash-preview-tts/Puck', text: 'x', language: 'en' })).toEqual({ ok: false, failure: 'http', status: 429 });
  });
});

describe('Gemini speech to text', () => {
  const audio = new Uint8Array([1, 2, 3, 4]);
  it('sends the recording inline with the transcription instruction', async () => {
    reply = () => json({ candidates: [{ content: { parts: [{ text: ' प्रकाश संश्लेषण ' }] } }], usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 4 } });
    const r = await geminiSpeechAdapter.transcribe({ apiKey: KEY, model: 'gemini-2.5-flash', audio, mediaType: 'audio/wav', language: 'hi' });
    expect(calls[0]!.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(header(calls[0]!)).toBe(KEY);
    expect(calls[0]!.body).toEqual({
      contents: [
        {
          parts: [
            { text: 'Transcribe this recording exactly, in the language spoken (Hindi or English). Reply with the words only.' },
            { inlineData: { mimeType: 'audio/wav', data: Buffer.from(audio).toString('base64') } },
          ],
        },
      ],
    });
    expect(r).toEqual({ ok: true, text: 'प्रकाश संश्लेषण', tokensIn: 30, tokensOut: 4 });
  });

  it('answers 415 at once, with no call, for webm and mp4', async () => {
    for (const mediaType of ['audio/webm', 'audio/mp4'] as const) {
      expect(await geminiSpeechAdapter.transcribe({ apiKey: KEY, model: 'gemini-2.5-flash', audio, mediaType, language: 'en' })).toEqual({ ok: false, failure: 'endpoint', status: 415 });
    }
    expect(calls).toHaveLength(0);
    reply = () => json({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] });
    expect((await geminiSpeechAdapter.transcribe({ apiKey: KEY, model: 'gemini-2.5-flash', audio, mediaType: 'audio/ogg', language: 'en' })).ok).toBe(true);
    expect(calls[0]!.body.contents[0].parts[1].inlineData.mimeType).toBe('audio/ogg');
  });

  it('an empty answer is a failure, a vendor error its kind', async () => {
    reply = () => json({ candidates: [{ content: { parts: [{ text: '  ' }] } }] });
    expect(await geminiSpeechAdapter.transcribe({ apiKey: KEY, model: 'gemini-2.5-flash', audio, mediaType: 'audio/wav', language: 'en' })).toEqual({ ok: false, failure: 'bad_stream' });
    reply = () => new Response('no', { status: 403 });
    expect(await geminiSpeechAdapter.transcribe({ apiKey: KEY, model: 'gemini-2.5-flash', audio, mediaType: 'audio/wav', language: 'en' })).toEqual({ ok: false, failure: 'http', status: 403 });
  });
});

describe('Gemini Live token', () => {
  it('posts the constraints and returns the token with the connect details', async () => {
    reply = () => json({ name: 'auth_tokens/abc123' });
    const before = Date.now();
    const r = await geminiRealtimeAdapter.mintToken({ apiKey: KEY, model: 'gemini-live-2.5-flash-preview', language: 'en' });
    expect(calls[0]!.url).toBe('https://generativelanguage.googleapis.com/v1alpha/auth_tokens');
    expect(header(calls[0]!)).toBe(KEY);
    const body = calls[0]!.body;
    expect(body.uses).toBe(1);
    expect(body.liveConnectConstraints).toEqual({ model: 'gemini-live-2.5-flash-preview', config: { responseModalities: ['AUDIO'] } });
    expect(Date.parse(body.expireTime) - before).toBeGreaterThan(29 * 60_000);
    expect(Date.parse(body.expireTime) - before).toBeLessThan(31 * 60_000);
    expect(Date.parse(body.newSessionExpireTime) - before).toBeGreaterThan(55_000);
    expect(Date.parse(body.newSessionExpireTime) - before).toBeLessThan(65_000);
    expect(r).toEqual({
      ok: true,
      token: 'auth_tokens/abc123',
      expiresAt: Date.parse(body.newSessionExpireTime),
      url: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',
      model: 'gemini-live-2.5-flash-preview',
    });
  });

  it('never mints without a key, and a missing name is a failure', async () => {
    await expect(geminiRealtimeAdapter.mintToken({ apiKey: '', model: 'gemini-live-2.5-flash-preview', language: 'en' })).rejects.toThrow('not_switched_on');
    expect(calls).toHaveLength(0);
    reply = () => json({});
    expect(await geminiRealtimeAdapter.mintToken({ apiKey: KEY, model: 'gemini-live-2.5-flash-preview', language: 'en' })).toEqual({ ok: false, failure: 'bad_stream' });
  });
});

describe('Google Cloud Speech-to-Text', () => {
  const audio = new Uint8Array([9, 8, 7]);
  const wav = pcmToWav(new Uint8Array(8), 16_000);
  it('recognises webm and ogg Opus at 48 kHz in the chosen language, joining the results', async () => {
    reply = () => json({ results: [{ alternatives: [{ transcript: 'what is' }] }, { alternatives: [{ transcript: 'light' }] }] });
    const r = await googleSttAdapter.transcribe({ apiKey: KEY, model: 'latest_short', audio, mediaType: 'audio/webm', language: 'en' });
    expect(r).toEqual({ ok: true, text: 'what is light', tokensIn: 0, tokensOut: 0 });
    expect(calls[0]!.url).toBe('https://speech.googleapis.com/v1/speech:recognize');
    expect(header(calls[0]!)).toBe(KEY);
    expect(calls[0]!.body).toEqual({ config: { encoding: 'WEBM_OPUS', sampleRateHertz: 48_000, languageCode: 'en-IN', model: 'latest_short' }, audio: { content: Buffer.from(audio).toString('base64') } });
    await googleSttAdapter.transcribe({ apiKey: KEY, model: 'default', audio, mediaType: 'audio/ogg', language: 'hi' });
    expect(calls[1]!.body.config).toEqual({ encoding: 'OGG_OPUS', sampleRateHertz: 48_000, languageCode: 'hi-IN' });
  });

  it('reads the WAV rate from its header, and refuses mp4 or a broken WAV with no call', async () => {
    reply = () => json({ results: [] });
    const r = await googleSttAdapter.transcribe({ apiKey: KEY, model: 'default', audio: wav, mediaType: 'audio/wav', language: 'en' });
    expect(r).toEqual({ ok: true, text: '', tokensIn: 0, tokensOut: 0 });
    expect(calls[0]!.body.config).toMatchObject({ encoding: 'LINEAR16', sampleRateHertz: 16_000 });
    expect(await googleSttAdapter.transcribe({ apiKey: KEY, model: 'default', audio, mediaType: 'audio/mp4', language: 'en' })).toEqual({ ok: false, failure: 'endpoint', status: 415 });
    expect(await googleSttAdapter.transcribe({ apiKey: KEY, model: 'default', audio, mediaType: 'audio/wav', language: 'en' })).toEqual({ ok: false, failure: 'http', status: 400 });
    expect(calls).toHaveLength(1);
  });

  it('tests the key with a GET and offers the recognition models', async () => {
    reply = () => json({ operations: [] });
    expect(await googleSttAdapter.testConnection!(KEY)).toEqual({ ok: true, models: ['default', 'latest_short', 'latest_long'] });
    expect(calls[0]!.url).toBe('https://speech.googleapis.com/v1/operations?pageSize=1');
    expect(calls[0]!.init.method).toBe('GET');
    expect(header(calls[0]!)).toBe(KEY);
    reply = () => new Response('no', { status: 403 });
    expect(await googleSttAdapter.testConnection!(KEY)).toEqual({ ok: false, failure: 'http', status: 403 });
  });

  it('declares its own key rules', () => {
    expect(googleSttAdapter.keyLooksRight!(KEY)).toBe(true);
    expect(googleSttAdapter.keyLooksRight!('sk-nope')).toBe(false);
  });
});

describe('registries', () => {
  it('find every adapter', () => {
    expect(voiceAdapterFor('gemini')).toBe(geminiVoiceAdapter);
    expect(speechAdapterFor('gemini')).toBe(geminiSpeechAdapter);
    expect(speechAdapterFor('google_stt')).toBe(googleSttAdapter);
    expect(realtimeAdapterFor('gemini')).toBe(geminiRealtimeAdapter);
    expect(nonTextProviderIds()).toContain('google_stt');
    expect(nonTextProviderIds()).not.toContain('gemini');
    expect(keyedProviderFor('google_stt')?.capability).toBe('speech_to_text');
    expect(keyedProviderFor('google_stt')?.keyLooksRight(KEY)).toBe(true);
    expect(keyedProviderFor('gemini')?.capability).toBe('text');
  });

  it('shows Gemini as text, vision, stream, json, stt, tts and realtime', () => {
    expect(providerCapabilities('gemini')).toEqual({ text: true, vision: true, stream: true, json: true, stt: true, tts: true, realtime: true, sts: false });
    expect(providerCapabilities('google_stt')).toMatchObject({ stt: true, tts: false, text: false });
  });
});
