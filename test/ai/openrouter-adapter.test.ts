import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adapterFor, keyedProviderFor, providerCapabilities, speechAdapterFor, textAdapters, voiceAdapterFor } from '@/lib/ai/adapters';
import { endpointNet, guardedFetch, type Resolved } from '@/lib/ai/adapters/endpoint-guard';
import { OPENROUTER_BASE_URL, OPENROUTER_DEFAULT_VOICE, openrouterAdapter, openrouterFailureCode, openrouterSpeechAdapter, openrouterVoiceAdapter, pcmToWav } from '@/lib/ai/adapters/openrouter';
import { classifyFailure } from '@/lib/ai/gateway/taxonomy';
import type { AdapterRequest, SpeechRequest, VoiceRequest } from '@/lib/ai/adapters/types';
import { httpError, openaiOk } from './streams';

// W17-A3: OpenRouter as its own provider. The vendor is replaced at fetch, so what the adapter sends is captured as
// it leaves. Made-up keys, models and text only; no key is in any result or log line.

const KEY = `sk-or-v1-${'a1b2'.repeat(10)}`;
type Call = { url: string; method: string; body: unknown; headers: Record<string, string>; redirect?: string };
let calls: Call[] = [];
let reply: () => Response = () => openaiOk(['ok']);
const logged: string[] = [];
beforeEach(() => {
  calls = [];
  logged.length = 0;
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, level).mockImplementation((...a: unknown[]) => void logged.push(a.map(String).join(' ')));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), method: String(init.method), body: init.body, headers: init.headers as Record<string, string>, redirect: init.redirect });
      return reply();
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  reply = () => openaiOk(['ok']);
});

const textRequest = (over: Partial<AdapterRequest> = {}): AdapterRequest => ({ apiKey: KEY, model: 'made-up/vision-model:free', system: 'Explain for a Class 6 student.', messages: [{ role: 'user', content: 'Why do magnets attract iron?' }], maxTokens: 900, ...over });
const AUDIO = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const speechRequest = (over: Partial<SpeechRequest> = {}): SpeechRequest => ({ apiKey: KEY, model: 'made-up/stt-model', audio: AUDIO, mediaType: 'audio/webm', language: 'hi', ...over });
const voiceRequest = (over: Partial<VoiceRequest> = {}): VoiceRequest => ({ apiKey: KEY, model: 'fishaudio/s1-mini:free|default', text: 'Equal fractions name the same part.', language: 'en', ...over });
const json = (c: Call) => JSON.parse(String(c.body));
const seen = (...v: unknown[]) => JSON.stringify(v, (_k, x) => (x instanceof Uint8Array ? Array.from(x) : x));

describe('OpenRouter: the provider', () => {
  it('is found in every registry: text, speech, voice and the capabilities between them', () => {
    expect(adapterFor('openrouter')).toBe(openrouterAdapter);
    expect(textAdapters().map((a) => a.providerId)).toContain('openrouter');
    expect(speechAdapterFor('openrouter')).toBe(openrouterSpeechAdapter);
    expect(voiceAdapterFor('openrouter')).toBe(openrouterVoiceAdapter);
    expect(keyedProviderFor('openrouter')).toMatchObject({ providerId: 'openrouter', capability: 'text', needsKey: true });
    expect(providerCapabilities('openrouter')).toMatchObject({ text: true, vision: true, stream: true, stt: true, tts: true, json: false, sts: false, realtime: false });
  });

  it('needs a key only (no address), has no terms note, and the generic OpenAI-compatible service is untouched', () => {
    for (const a of [openrouterAdapter, openrouterSpeechAdapter, openrouterVoiceAdapter]) {
      expect([a.needsKey, a.termsNote]).toEqual([true, null]);
    }
    expect(openrouterAdapter.needsBaseUrl).toBe(false);
    expect(adapterFor('openai_compatible')?.capabilities).toMatchObject({ text: true, stream: true, vision: false });
  });

  it('takes only an "sk-or-" key of 20 to 200 key characters', () => {
    for (const a of [openrouterAdapter, openrouterSpeechAdapter, openrouterVoiceAdapter]) {
      expect(a.keyLooksRight?.(KEY)).toBe(true);
      expect(a.keyLooksRight?.('sk-or-' + 'x'.repeat(14))).toBe(true);
      for (const bad of ['', 'sk-or-', 'sk-or-' + 'x'.repeat(13), 'sk-or-' + 'x'.repeat(195), `sk-${'x'.repeat(40)}`, `SK-OR-${'x'.repeat(40)}`, `${KEY} `, `${KEY}/x`]) {
        expect(a.keyLooksRight?.(bad), bad).toBe(false);
      }
    }
  });
});

describe('OpenRouter: text and photos', () => {
  it('posts streamed Chat Completions to the fixed address with the key and the two app headers', async () => {
    reply = () => openaiOk(['Mag', 'nets'], 21, 4);
    const pieces: string[] = [];
    const r = await openrouterAdapter.streamText(textRequest(), (p) => pieces.push(p));
    expect(r).toEqual({ ok: true, text: 'Magnets', tokensIn: 21, tokensOut: 4, finish: 'stop' });
    expect(pieces.join('')).toBe('Magnets');
    expect(OPENROUTER_BASE_URL).toBe('https://openrouter.ai/api/v1');
    expect(calls[0]).toMatchObject({ url: 'https://openrouter.ai/api/v1/chat/completions', method: 'POST', redirect: 'error' });
    expect(calls[0].headers).toMatchObject({ authorization: `Bearer ${KEY}`, 'HTTP-Referer': 'https://www.netcyberai.com', 'X-Title': 'NetCyberAI', 'content-type': 'application/json' });
    expect(json(calls[0])).toMatchObject({ model: 'made-up/vision-model:free', stream: true, max_tokens: 900 });
    expect(json(calls[0]).response_format).toBeUndefined();
    expect(calls[0].url).not.toContain(KEY);
  });

  it('sends a photo as an OpenAI image_url content part (a data URL)', async () => {
    await openrouterAdapter.streamText(textRequest({ messages: [{ role: 'user', content: 'What is in the picture?', images: [{ mediaType: 'image/png', base64: 'AAAA' }] }] }), () => {});
    const user = json(calls[0]).messages.find((m: { role: string }) => m.role === 'user');
    expect(user.content).toEqual([
      { type: 'text', text: 'What is in the picture?' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ]);
  });
});

describe('OpenRouter: the key test', () => {
  it('is a GET to /models with the key; ids as listed, the free ones first, cleaned and once each', async () => {
    reply = () => new Response(JSON.stringify({ data: [{ id: 'vendor-b/model-two' }, { id: 'nvidia/made-up-ultra:free' }, { id: 'vendor-a/model-1' }, { id: 'vendor-a/model-1' }, { id: 'bad id' }, { id: 4 }, { id: 'a/z:free' }] }), { status: 200 });
    const r = await openrouterAdapter.testConnection!(KEY);
    expect(calls[0]).toMatchObject({ url: 'https://openrouter.ai/api/v1/models', method: 'GET', redirect: 'error' });
    expect(calls[0].headers).toMatchObject({ authorization: `Bearer ${KEY}`, 'X-Title': 'NetCyberAI' });
    expect(r).toEqual({ ok: true, models: ['a/z:free', 'nvidia/made-up-ultra:free', 'vendor-a/model-1', 'vendor-b/model-two'] });
  });

  it('a list that cannot be read still means the call worked; a refused key reports its status', async () => {
    reply = () => new Response('not json', { status: 200 });
    expect(await openrouterAdapter.testConnection!(KEY)).toEqual({ ok: true });
    reply = () => httpError(401);
    expect(await openrouterAdapter.testConnection!(KEY)).toEqual({ ok: false, failure: 'http', status: 401 });
    reply = () => {
      throw new Error(`down for ${KEY}`);
    };
    const down = await openrouterAdapter.testConnection!(KEY);
    expect(down).toEqual({ ok: false, failure: 'network' });
    expect(seen(down, logged)).not.toContain(KEY);
  });

  it('the speech and voice adapters test with the same call', async () => {
    reply = () => new Response(JSON.stringify({ data: [{ id: 'a/b' }] }), { status: 200 });
    expect(await openrouterSpeechAdapter.testConnection!(KEY)).toEqual({ ok: true, models: ['a/b'] });
    expect(await openrouterVoiceAdapter.testConnection!(KEY)).toEqual({ ok: true, models: ['a/b'] });
    expect(calls.map((c) => c.url)).toEqual(['https://openrouter.ai/api/v1/models', 'https://openrouter.ai/api/v1/models']);
  });
});

describe('OpenRouter: speech to text', () => {
  it('posts multipart to /audio/transcriptions: the file, the model Control chose and the language; reads text', async () => {
    reply = () => new Response(JSON.stringify({ text: 'प्रकाश संश्लेषण क्या है?', usage: { input_tokens: 12, output_tokens: 5 } }), { status: 200 });
    const r = await openrouterSpeechAdapter.transcribe(speechRequest());
    expect(r).toEqual({ ok: true, text: 'प्रकाश संश्लेषण क्या है?', tokensIn: 12, tokensOut: 5 });
    expect(calls[0]).toMatchObject({ url: 'https://openrouter.ai/api/v1/audio/transcriptions', method: 'POST', redirect: 'error' });
    expect(calls[0].headers).toMatchObject({ authorization: `Bearer ${KEY}`, 'HTTP-Referer': 'https://www.netcyberai.com' });
    expect(Object.keys(calls[0].headers).map((k) => k.toLowerCase())).not.toContain('content-type');
    const form = calls[0].body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect([form.get('model'), form.get('language')]).toEqual(['made-up/stt-model', 'hi']);
    const file = form.get('file') as File;
    expect([file.name, file.type, file.size]).toEqual(['audio.webm', 'audio/webm', AUDIO.length]);
  });

  it('a text-less answer is a bad stream; a model id that could change the request is refused before anything leaves', async () => {
    reply = () => new Response(JSON.stringify({ result: 1 }), { status: 200 });
    expect(await openrouterSpeechAdapter.transcribe(speechRequest())).toEqual({ ok: false, failure: 'bad_stream' });
    const n = calls.length;
    expect(await openrouterSpeechAdapter.transcribe(speechRequest({ model: '../v1/files?x=1' }))).toEqual({ ok: false, failure: 'http', status: 400 });
    expect(calls.length).toBe(n);
  });
});

// 16-bit little-endian samples 0, 1, -1, 32767 (mono): the four frames of a made-up sound.
const PCM = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0xff, 0xff, 0xff, 0x7f]);
describe('OpenRouter: text to speech', () => {
  it('posts JSON to /audio/speech: the model, the voice after the bar, and pcm always', async () => {
    reply = () => new Response(PCM, { status: 200, headers: { 'content-type': 'audio/pcm' } });
    await openrouterVoiceAdapter.synthesize(voiceRequest({ model: 'heygen/made-up-voice|Warm Anna' }));
    expect(calls[0]).toMatchObject({ url: 'https://openrouter.ai/api/v1/audio/speech', method: 'POST', redirect: 'error' });
    expect(calls[0].headers).toMatchObject({ authorization: `Bearer ${KEY}`, 'X-Title': 'NetCyberAI', 'content-type': 'application/json' });
    expect(json(calls[0])).toEqual({ model: 'heygen/made-up-voice', input: 'Equal fractions name the same part.', voice: 'Warm Anna', response_format: 'pcm' });
  });

  it('sends the default voice when the model string has none', async () => {
    reply = () => new Response(PCM, { status: 200, headers: { 'content-type': 'audio/pcm' } });
    await openrouterVoiceAdapter.synthesize(voiceRequest({ model: 'fishaudio/s1-mini:free' }));
    expect(json(calls[0])).toMatchObject({ model: 'fishaudio/s1-mini:free', voice: OPENROUTER_DEFAULT_VOICE, response_format: 'pcm' });
    expect(OPENROUTER_DEFAULT_VOICE).toBe('alloy');
  });

  it('wraps PCM (pcm, L16 or octet-stream) as a 44.1 kHz mono 16-bit WAV', async () => {
    for (const type of ['audio/pcm', 'audio/L16;rate=44100', 'application/octet-stream']) {
      reply = () => new Response(PCM, { status: 200, headers: { 'content-type': type } });
      const r = await openrouterVoiceAdapter.synthesize(voiceRequest());
      expect(r).toMatchObject({ ok: true, mediaType: 'audio/wav', characters: 35 });
      if (!r.ok) throw new Error('unreachable');
      expect(Array.from(r.audio)).toEqual(Array.from(pcmToWav(PCM)));
    }
  });

  it('hands mp3 on untouched (Fish Audio answers mp3 whatever is asked)', async () => {
    const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x01, 0x02]);
    reply = () => new Response(mp3, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    expect(await openrouterVoiceAdapter.synthesize(voiceRequest())).toEqual({ ok: true, audio: mp3, mediaType: 'audio/mpeg', characters: 35 });
  });

  it('a WAV answer is not wrapped twice; JSON, text or an empty body is a failure', async () => {
    const wav = pcmToWav(PCM);
    reply = () => new Response(wav, { status: 200, headers: { 'content-type': 'audio/wav' } });
    expect(await openrouterVoiceAdapter.synthesize(voiceRequest())).toEqual({ ok: true, audio: wav, mediaType: 'audio/wav', characters: 35 });
    for (const [body, type] of [['{"error":"nope"}', 'application/json'], ['nope', 'text/plain']] as const) {
      reply = () => new Response(body, { status: 200, headers: { 'content-type': type } });
      expect(await openrouterVoiceAdapter.synthesize(voiceRequest())).toEqual({ ok: false, failure: 'bad_stream' });
    }
    reply = () => new Response(new Uint8Array(0), { status: 200, headers: { 'content-type': 'audio/pcm' } });
    expect(await openrouterVoiceAdapter.synthesize(voiceRequest())).toEqual({ ok: false, failure: 'bad_stream' });
  });

  it('accepts "vendor/model[:tag][|voice]" and refuses anything that could change the request', async () => {
    for (const ok of ['fishaudio/s1-mini:free|default', 'heygen/made-up.v2|Warm Anna', 'a/b', 'a0/b_c-d.e:free']) expect(openrouterVoiceAdapter.modelLooksRight(ok), ok).toBe(true);
    const n = calls.length;
    for (const bad of ['', 'nomodel', 'A/b', '/b', 'a/', 'a/b|', 'a/b|voice|x', 'a/b?x=1', 'a/../b', 'a/b|v/x', `a/b|${'v'.repeat(61)}`]) {
      expect(openrouterVoiceAdapter.modelLooksRight(bad), bad).toBe(false);
      expect(await openrouterVoiceAdapter.synthesize(voiceRequest({ model: bad })), bad).toEqual({ ok: false, failure: 'http', status: 400 });
    }
    expect(calls.length).toBe(n);
  });
});

describe('pcmToWav', () => {
  const u32 = (a: Uint8Array, at: number) => new DataView(a.buffer, a.byteOffset).getUint32(at, true);
  const u16 = (a: Uint8Array, at: number) => new DataView(a.buffer, a.byteOffset).getUint16(at, true);
  const text = (a: Uint8Array, at: number, n: number) => String.fromCharCode(...a.subarray(at, at + n));

  it('writes a 44-byte RIFF header for 44.1 kHz, mono, 16-bit and then the samples as they are', () => {
    const wav = pcmToWav(PCM);
    expect(wav.length).toBe(44 + PCM.length);
    expect([text(wav, 0, 4), text(wav, 8, 4), text(wav, 12, 4), text(wav, 36, 4)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect([u32(wav, 4), u32(wav, 16), u16(wav, 20), u16(wav, 22), u32(wav, 24), u32(wav, 28), u16(wav, 32), u16(wav, 34), u32(wav, 40)]).toEqual([36 + PCM.length, 16, 1, 1, 44100, 88200, 2, 16, PCM.length]);
    expect(Array.from(wav.subarray(44))).toEqual(Array.from(PCM));
  });

  it('takes a rate and a channel count, and drops a half frame at the end', () => {
    const stereo = pcmToWav(new Uint8Array(10), 24000, 2);
    expect([u16(stereo, 22), u32(stereo, 24), u32(stereo, 28), u16(stereo, 32), u32(stereo, 40), stereo.length]).toEqual([2, 24000, 96000, 4, 8, 52]);
    expect(pcmToWav(new Uint8Array(5)).length).toBe(44 + 4);
    expect(pcmToWav(new Uint8Array(0)).length).toBe(44);
  });
});

describe('OpenRouter: a free key and the audio models (402, 403)', () => {
  it('maps 402 to an http failure and 403 to a refusal in all three adapters, with a code Control can word', async () => {
    const calls3 = [
      () => openrouterAdapter.streamText(textRequest(), () => {}),
      () => openrouterSpeechAdapter.transcribe(speechRequest()),
      () => openrouterVoiceAdapter.synthesize(voiceRequest()),
      () => openrouterAdapter.testConnection!(KEY),
    ];
    for (const run of calls3) {
      reply = () => new Response(JSON.stringify({ error: { message: `no credit for ${KEY}` } }), { status: 402 });
      const credit = await run();
      expect(credit).toEqual({ ok: false, failure: 'http', status: 402 });
      reply = () => new Response(JSON.stringify({ error: { message: `not offered ${KEY}` } }), { status: 403 });
      const api = await run();
      expect(api).toEqual({ ok: false, failure: 'refused', status: 403 });
      expect(seen(credit, api, logged)).not.toContain(KEY);
    }
    expect([openrouterFailureCode(402), openrouterFailureCode(403), openrouterFailureCode(401), openrouterFailureCode(undefined)]).toEqual(['needs_credit', 'not_available_by_api', null, null]);
    // 402 is a spent quota to the platform (next provider); 401 stays auth_failed.
    expect(classifyFailure({ failure: 'http', status: 402 }, { streamed: false, timedOut: false })).toMatchObject({ outcome: 'quota_exhausted', retryable: true });
    reply = () => httpError(401);
    expect(await openrouterAdapter.streamText(textRequest(), () => {})).toEqual({ ok: false, failure: 'http', status: 401 });
  });
});

describe('OpenRouter: the endpoint guard', () => {
  it('lets both audio paths (and the others) through under the fixed base', async () => {
    vi.spyOn(endpointNet, 'lookup').mockImplementation(async () => [{ address: '104.18.0.1', family: 4 } as Resolved]);
    const send = vi.spyOn(endpointNet, 'send').mockResolvedValue(new Response('{}', { status: 200 }));
    for (const path of ['/audio/speech', '/audio/transcriptions', '/chat/completions', '/models']) {
      const got = await guardedFetch(OPENROUTER_BASE_URL, path, { method: 'POST', headers: {}, body: '{}' });
      expect(got.ok, path).toBe(true);
    }
    expect(send.mock.calls.map((c) => c[0].href)).toEqual(['https://openrouter.ai/api/v1/audio/speech', 'https://openrouter.ai/api/v1/audio/transcriptions', 'https://openrouter.ai/api/v1/chat/completions', 'https://openrouter.ai/api/v1/models']);
  });
});
