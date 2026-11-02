import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adapterFor, keyedProviderFor, nonTextProviderIds, providerCapabilities, speechAdapterFor, voiceAdapterFor } from '@/lib/ai/adapters';
import { endpointNet, type Resolved } from '@/lib/ai/adapters/endpoint-guard';
import { SARVAM_MIN_MAX_TOKENS, SARVAM_TTS_CHARS, SARVAM_VOICE_MODELS, joinWav, sarvamAdapter, sarvamSpeechAdapter, sarvamVoiceAdapter, splitForSpeech } from '@/lib/ai/adapters/sarvam';
import type { AdapterRequest, SpeechRequest, VoiceRequest } from '@/lib/ai/adapters/types';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// W17-A1: the Sarvam adapter. Every call leaves through the endpoint guard, so the guard's network is replaced (no name is
// resolved, no connection opened). Made-up keys, text and audio only.

const KEY = `sv-${'S'.repeat(30)}KEYS`;

// A tiny but valid WAV: mono, 16-bit, 8 kHz, with the given sample bytes.
function wav(data: number[], rate = 8000): Uint8Array {
  const out = new Uint8Array(44 + data.length);
  const view = new DataView(out.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => (out[at + i] = c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + data.length, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, data.length, true);
  out.set(data, 44);
  return out;
}
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint32(at, true);

type Sent = { url: URL; init: { method: string; headers: Record<string, string>; body?: string | Uint8Array } };
let sent: Sent[] = [];
let reply: (n: number) => Response = () => new Response('{}', { status: 200 });
beforeEach(() => {
  sent = [];
  vi.spyOn(endpointNet, 'lookup').mockImplementation(async () => [{ address: '8.8.4.4', family: 4 } as Resolved]);
  vi.spyOn(endpointNet, 'send').mockImplementation(async (url, _to, init) => {
    sent.push({ url, init: init as Sent['init'] });
    return reply(sent.length - 1);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  reply = () => new Response('{}', { status: 200 });
});

const audioReply = (...files: Uint8Array[]) => new Response(JSON.stringify({ audios: files.map(b64) }), { status: 200, headers: { 'content-type': 'application/json' } });
const bodyJson = (s: Sent) => JSON.parse(String(s.init.body));
const seen = (...v: unknown[]) => JSON.stringify(v, (_k, x) => (x instanceof Uint8Array ? Array.from(x) : x));
const sse = (events: unknown[]) => new Response(events.map((d) => `data: ${typeof d === 'string' ? d : JSON.stringify(d)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });

const speech = (over: Partial<SpeechRequest> = {}): SpeechRequest => ({ apiKey: KEY, model: 'saaras:v3', audio: new Uint8Array([1, 2, 3, 4]), mediaType: 'audio/webm', language: 'hi', ...over });
const voice = (over: Partial<VoiceRequest> = {}): VoiceRequest => ({ apiKey: KEY, model: 'bulbul:v4-flash/chhavi_hi_kids', text: 'नमस्ते बच्चो।', language: 'hi', ...over });
const chat = (over: Partial<AdapterRequest> = {}): AdapterRequest => ({ apiKey: KEY, model: 'sarvam-105b', system: 'Explain for a Class 6 student.', messages: [{ role: 'user', content: 'Why do magnets attract iron?' }], maxTokens: 400, ...over });

describe('speech to text', () => {
  it('posts a multipart body with the key header, the model and the language code', async () => {
    reply = () => new Response(JSON.stringify({ transcript: 'मुझे भिन्न समझाओ' }), { status: 200 });
    const got = await sarvamSpeechAdapter.transcribe(speech());
    expect(got).toEqual({ ok: true, text: 'मुझे भिन्न समझाओ', tokensIn: 0, tokensOut: 0 });
    expect(sent[0].url.href).toBe('https://api.sarvam.ai/speech-to-text');
    const h = sent[0].init.headers;
    expect(h['api-subscription-key']).toBe(KEY);
    expect(Object.keys(h).map((k) => k.toLowerCase())).not.toContain('authorization');
    expect(h['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    const text = Buffer.from(sent[0].init.body as Uint8Array).toString('latin1');
    expect(text).toContain('name="model"\r\n\r\nsaaras:v3');
    expect(text).toContain('name="language_code"\r\n\r\nhi-IN');
    expect(text).toContain('name="file"; filename="audio.webm"');
    expect(text).toContain('content-type: audio/webm');
    expect(h['content-length']).toBe(String((sent[0].init.body as Uint8Array).length));
  });

  it('asks for en-IN for English and takes saaras:v4; any other model string is refused before it leaves', async () => {
    reply = () => new Response(JSON.stringify({ transcript: 'What is a fraction?' }), { status: 200 });
    await sarvamSpeechAdapter.transcribe(speech({ language: 'en', model: 'saaras:v4', mediaType: 'audio/wav' }));
    const text = Buffer.from(sent[0].init.body as Uint8Array).toString('latin1');
    expect(text).toContain('name="language_code"\r\n\r\nen-IN');
    expect(text).toContain('saaras:v4');
    expect(text).toContain('filename="audio.wav"');
    expect(await sarvamSpeechAdapter.transcribe(speech({ model: 'saarika:v2.5' }))).toEqual({ ok: false, failure: 'http', status: 400 });
    expect(sent).toHaveLength(1);
  });

  it('an empty transcript is an answer; a vendor refusal or an unreadable answer is a failure', async () => {
    reply = () => new Response(JSON.stringify({ transcript: '' }), { status: 200 });
    expect(await sarvamSpeechAdapter.transcribe(speech())).toMatchObject({ ok: true, text: '' });
    reply = () => new Response('{"detail":"no"}', { status: 403 });
    expect(await sarvamSpeechAdapter.transcribe(speech())).toEqual({ ok: false, failure: 'http', status: 403 });
    reply = () => new Response('not json', { status: 200 });
    expect(await sarvamSpeechAdapter.transcribe(speech())).toEqual({ ok: false, failure: 'bad_stream' });
    reply = () => new Response('{}', { status: 200 });
    expect(await sarvamSpeechAdapter.transcribe(speech())).toEqual({ ok: false, failure: 'bad_stream' });
  });
});

describe('text to speech', () => {
  it('posts the line with the speaker and model split from the model string, and returns the WAV', async () => {
    const file = wav([1, 2, 3, 4, 5, 6]);
    reply = () => audioReply(file);
    const got = await sarvamVoiceAdapter.synthesize(voice());
    expect(got).toMatchObject({ ok: true, mediaType: 'audio/wav', characters: 'नमस्ते बच्चो।'.length });
    expect(got.ok && Array.from(got.audio)).toEqual(Array.from(file));
    expect(sent[0].url.href).toBe('https://api.sarvam.ai/text-to-speech');
    expect(sent[0].init.headers['api-subscription-key']).toBe(KEY);
    expect(Object.keys(sent[0].init.headers).map((k) => k.toLowerCase())).not.toContain('authorization');
    expect(bodyJson(sent[0])).toEqual({ text: 'नमस्ते बच्चो।', target_language_code: 'hi-IN', speaker: 'chhavi_hi_kids', model: 'bulbul:v4-flash' });
    await sarvamVoiceAdapter.synthesize(voice({ language: 'en', model: 'bulbul:v3/anushka', text: 'Hello' }));
    expect(bodyJson(sent[1])).toEqual({ text: 'Hello', target_language_code: 'en-IN', speaker: 'anushka', model: 'bulbul:v3' });
  });

  it('checks the model string, and maps failures to their kind', async () => {
    expect(sarvamVoiceAdapter.modelLooksRight('bulbul:v4-flash/chhavi_hi_kids')).toBe(true);
    expect(sarvamVoiceAdapter.modelLooksRight('bulbul:v3/anushka')).toBe(true);
    for (const bad of ['bulbul:v3', 'bulbul:v3/', 'bulbul:v3/Anushka', 'sarvam-105b', 'bulbul:v3/a b', '']) expect(sarvamVoiceAdapter.modelLooksRight(bad), bad).toBe(false);
    expect(await sarvamVoiceAdapter.synthesize(voice({ model: 'bulbul:v3' }))).toEqual({ ok: false, failure: 'http', status: 400 });
    expect(sent).toHaveLength(0);
    reply = () => new Response('{}', { status: 429 });
    expect(await sarvamVoiceAdapter.synthesize(voice())).toEqual({ ok: false, failure: 'http', status: 429 });
    reply = () => new Response(JSON.stringify({ audios: [] }), { status: 200 });
    expect(await sarvamVoiceAdapter.synthesize(voice())).toEqual({ ok: false, failure: 'bad_stream' });
    reply = () => new Response(JSON.stringify({ audios: ['not base64!'] }), { status: 200 });
    expect(await sarvamVoiceAdapter.synthesize(voice())).toEqual({ ok: false, failure: 'bad_stream' });
  });

  it('splits a long line on sentence ends, asks for each piece in order and joins the audio into one WAV', async () => {
    const sentence = (n: number) => `Sentence number ${n} is here ` + 'x'.repeat(400) + '.';
    const text = [1, 2, 3].map(sentence).join(' ');
    expect(text.length).toBeGreaterThan(SARVAM_TTS_CHARS);
    const files = [wav([1, 1, 1, 1]), wav([2, 2, 2, 2]), wav([3, 3, 3, 3])];
    reply = (n) => audioReply(files[n]);
    const got = await sarvamVoiceAdapter.synthesize(voice({ language: 'en', text }));
    expect(sent.length).toBeGreaterThan(1);
    const pieces = sent.map((s) => bodyJson(s).text as string);
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(SARVAM_TTS_CHARS);
    expect(pieces.join(' ')).toBe(text);
    expect(sent.map((s) => bodyJson(s).text.slice(0, 22))).toEqual(pieces.map((p) => p.slice(0, 22)));
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    const used = files.slice(0, sent.length);
    expect(got.audio.length).toBe(44 + 4 * used.length);
    expect(u32(got.audio, 4)).toBe(got.audio.length - 8);
    expect(u32(got.audio, 40)).toBe(4 * used.length);
    expect(Array.from(got.audio.slice(44))).toEqual(used.flatMap((f) => Array.from(f.slice(44))));
    expect(got.characters).toBe(text.length);
  });

  it('a piece the vendor refuses ends the line; the earlier pieces are not returned', async () => {
    const text = ['One ' + 'a'.repeat(600) + '.', 'Two ' + 'b'.repeat(600) + '.'].join(' ');
    reply = (n) => (n === 0 ? audioReply(wav([1, 2])) : new Response('{}', { status: 500 }));
    expect(await sarvamVoiceAdapter.synthesize(voice({ language: 'en', text }))).toEqual({ ok: false, failure: 'http', status: 500 });
  });

  it('testConnection speaks one word, returns the fixed model list (child voices first) and reports a refused key', async () => {
    reply = () => audioReply(wav([1, 2]));
    const got = await sarvamVoiceAdapter.testConnection!(KEY);
    expect(bodyJson(sent[0])).toEqual({ text: 'Namaste', target_language_code: 'en-IN', speaker: 'anushka', model: 'bulbul:v4-flash' });
    expect(got).toEqual({ ok: true, models: [...SARVAM_VOICE_MODELS] });
    expect(got.ok && got.models!.slice(0, 4)).toEqual(['bulbul:v4-flash/nupur_en_kids', 'bulbul:v4-flash/chhavi_hi_kids', 'bulbul:v4-flash/kunal_hi_kids', 'bulbul:v4-flash/ritu_hi_kids']);
    expect(got.ok && got.models!.slice(4, 11)).toEqual(['anushka', 'manisha', 'vidya', 'arya', 'abhilash', 'karun', 'hitesh'].map((s) => `bulbul:v4-flash/${s}`));
    expect(got.ok && got.models!.every((m) => sarvamVoiceAdapter.modelLooksRight(m))).toBe(true);
    for (const status of [401, 403]) {
      reply = () => new Response('{}', { status });
      expect(await sarvamVoiceAdapter.testConnection!(KEY)).toEqual({ ok: false, failure: 'http', status });
    }
  });
});

describe('joinWav and splitForSpeech', () => {
  it('joins files into one header with both sizes rewritten', () => {
    const a = wav([1, 2, 3, 4]);
    const b = wav([5, 6]);
    const c = wav([7, 8, 9, 10, 11, 12]);
    const joined = joinWav([a, b, c]);
    expect(joined.length).toBe(44 + 12);
    expect(new TextDecoder().decode(joined.slice(0, 4))).toBe('RIFF');
    expect(u32(joined, 4)).toBe(joined.length - 8);
    expect(new TextDecoder().decode(joined.slice(36, 40))).toBe('data');
    expect(u32(joined, 40)).toBe(12);
    expect(Array.from(joined.slice(44))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    // One header only: the 'RIFF' tag is found once.
    expect(Buffer.from(joined).toString('latin1').match(/RIFF/g)).toHaveLength(1);
    expect(Array.from(joinWav([a]))).toEqual(Array.from(a));
  });

  it('refuses parts that are not WAV or differ in format', () => {
    expect(() => joinWav([])).toThrow();
    expect(() => joinWav([new Uint8Array([1, 2, 3])])).toThrow();
    expect(() => joinWav([wav([1, 2], 8000), wav([1, 2], 16000)])).toThrow();
  });

  it('keeps a data chunk whose size says "to the end" and drops chunks after the data', () => {
    const open = wav([1, 2, 3, 4]);
    new DataView(open.buffer).setUint32(40, 0xffffffff, true);
    expect(Array.from(joinWav([open, wav([5, 6])]).slice(44))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('splits at sentence ends (. ! ? । and new lines), then at spaces, then hard; nothing is lost', () => {
    expect(splitForSpeech('One. Two! Three? चार। पाँच\nछह', 1000)).toEqual(['One. Two! Three? चार। पाँच छह']);
    expect(splitForSpeech('One two. Three four. Five six.', 12)).toEqual(['One two.', 'Three four.', 'Five six.']);
    expect(splitForSpeech('एक दो तीन। चार पाँच छह।', 14)).toEqual(['एक दो तीन।', 'चार पाँच छह।']);
    const long = 'word '.repeat(50).trim();
    const pieces = splitForSpeech(long, 40);
    expect(pieces.every((p) => p.length <= 40)).toBe(true);
    expect(pieces.join(' ')).toBe(long);
    const hard = splitForSpeech('x'.repeat(95), 40);
    expect(hard.map((p) => p.length)).toEqual([40, 40, 15]);
    expect(splitForSpeech('   \n  ')).toEqual([]);
  });
});

describe('text', () => {
  it('sends the key header (no Bearer), raises a small max_tokens to the floor and leaves a larger one', async () => {
    reply = () => sse([{ choices: [{ delta: { content: 'Magnets ' } }] }, { choices: [{ delta: { content: 'pull iron.' }, finish_reason: 'stop' }] }]);
    const got = await sarvamAdapter.streamText(chat({ maxTokens: 300 }), () => {});
    expect(got).toMatchObject({ ok: true, text: 'Magnets pull iron.' });
    expect(sent[0].url.href).toBe('https://api.sarvam.ai/v2/chat/completions');
    expect(sent[0].init.headers['api-subscription-key']).toBe(KEY);
    expect(Object.keys(sent[0].init.headers).map((k) => k.toLowerCase())).not.toContain('authorization');
    expect(bodyJson(sent[0])).toMatchObject({ model: 'sarvam-105b', stream: true, max_tokens: SARVAM_MIN_MAX_TOKENS });
    expect(bodyJson(sent[0]).max_completion_tokens).toBeUndefined();
    await sarvamAdapter.streamText(chat({ maxTokens: 4000 }), () => {});
    expect(bodyJson(sent[1]).max_tokens).toBe(4000);
    expect(await sarvamAdapter.streamText(chat({ model: 'gpt-4o' }), () => {})).toEqual({ ok: false, failure: 'http', status: 400 });
  });

  it('never passes the reasoning to the caller or into the text', async () => {
    reply = () =>
      sse([
        { choices: [{ delta: { reasoning_content: 'Let me think about iron. ' } }] },
        { choices: [{ delta: { reasoning_content: 'It is ferromagnetic.', content: null } }] },
        { choices: [{ delta: { content: 'Iron is ' , reasoning_content: 'more thinking' } }] },
        { choices: [{ delta: { content: 'magnetic.' }, finish_reason: 'stop' }] },
        '[DONE]',
      ]);
    const deltas: string[] = [];
    const got = await sarvamAdapter.streamText(chat(), (d) => deltas.push(d));
    expect(got).toMatchObject({ ok: true, text: 'Iron is magnetic.' });
    expect(deltas).toEqual(['Iron is ', 'magnetic.']);
    expect(seen(got, deltas)).not.toMatch(/think|ferromagnetic/);
  });

  it('an empty answer cut by the length limit is cut_short, so the backup runs; a vendor error is http', async () => {
    reply = () => sse([{ choices: [{ delta: { reasoning_content: 'Thinking and thinking' } }] }, { choices: [{ delta: {}, finish_reason: 'length' }] }, '[DONE]']);
    expect(await sarvamAdapter.streamText(chat(), () => {})).toEqual({ ok: false, failure: 'cut_short' });
    reply = () => new Response('{}', { status: 401 });
    expect(await sarvamAdapter.streamText(chat(), () => {})).toEqual({ ok: false, failure: 'http', status: 401 });
  });

  it('a partly written answer cut by the limit is still handed on with its finish reason', async () => {
    reply = () => sse([{ choices: [{ delta: { content: 'Iron is' } }] }, { choices: [{ delta: {}, finish_reason: 'length' }] }, '[DONE]']);
    expect(await sarvamAdapter.streamText(chat(), () => {})).toMatchObject({ ok: true, text: 'Iron is', finish: 'length' });
  });

  it('testConnection proves the key with the voice check and names the one chat model', async () => {
    reply = () => audioReply(wav([1, 2]));
    expect(await sarvamAdapter.testConnection!(KEY)).toEqual({ ok: true, models: ['sarvam-105b'] });
    expect(sent[0].url.pathname).toBe('/text-to-speech');
    reply = () => new Response('{}', { status: 403 });
    expect(await sarvamAdapter.testConnection!(KEY)).toEqual({ ok: false, failure: 'http', status: 403 });
  });
});

describe('declared, keyed and registered', () => {
  it('keys of a plausible shape are accepted, others not', () => {
    for (const a of [sarvamAdapter, sarvamSpeechAdapter, sarvamVoiceAdapter]) {
      expect(a.keyLooksRight?.(KEY)).toBe(true);
      expect(a.keyLooksRight?.('sk_abc.DEF-123_xyz.4567890')).toBe(true);
      expect(a.keyLooksRight?.('short')).toBe(false);
      expect(a.keyLooksRight?.('has space in the key 123456')).toBe(false);
      expect(a.keyLooksRight?.('k'.repeat(201))).toBe(false);
      expect(a.termsNote).toBeNull();
      expect(a.needsKey).toBe(true);
    }
  });

  it('every registry finds it, with the capabilities it declares', () => {
    expect(adapterFor('sarvam')).toBe(sarvamAdapter);
    expect(speechAdapterFor('sarvam')).toBe(sarvamSpeechAdapter);
    expect(voiceAdapterFor('sarvam')).toBe(sarvamVoiceAdapter);
    expect(keyedProviderFor('sarvam')?.providerId).toBe('sarvam');
    expect(keyedProviderFor('sarvam')?.keyLooksRight(KEY)).toBe(true);
    expect(providerCapabilities('sarvam')).toEqual({ text: true, vision: false, stream: true, json: false, stt: true, tts: true, sts: false, realtime: false });
    expect(sarvamSpeechAdapter.capabilities).toMatchObject({ stt: true, tts: false });
    expect(sarvamVoiceAdapter.capabilities).toMatchObject({ tts: true, stt: false });
    // It has a text adapter, so it is not one of the providers that only a voice or speech feature can choose.
    expect(nonTextProviderIds()).not.toContain('sarvam');
  });

  it('its name and about line are in both languages', () => {
    for (const key of ['control.ai.provider.name.sarvam', 'control.ai.provider.about.sarvam'] as const) {
      expect(en[key]).toBeTruthy();
      expect(hi[key]).toBeTruthy();
    }
    expect(en['control.ai.provider.name.sarvam']).toBe('Sarvam (India: speech and voices)');
  });

  it('the key is in no result and no address', async () => {
    reply = () => audioReply(wav([1, 2]));
    const got = await sarvamVoiceAdapter.synthesize(voice());
    expect(seen(got)).not.toContain(KEY);
    expect(sent.every((s) => !s.url.href.includes(KEY))).toBe(true);
    reply = () => new Response(`{"echo":"${KEY}"}`, { status: 500 });
    expect(seen(await sarvamVoiceAdapter.synthesize(voice()), await sarvamSpeechAdapter.transcribe(speech()), await sarvamAdapter.streamText(chat(), () => {}))).not.toContain(KEY);
  });
});
