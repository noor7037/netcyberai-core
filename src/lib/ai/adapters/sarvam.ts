import { streamChatCompletions } from './chat-completions';
import { guardedFetch } from './endpoint-guard';
import { audioFromBase64 } from './voice-audio';
import { SPEECH_TIMEOUT_MS, VOICE_TIMEOUT_MS, capabilities, type AdapterFailure, type AdapterResult, type ConnectionTest, type SpeechAdapter, type SpeechMediaType, type SpeechResult, type TextAdapter, type VoiceAdapter, type VoiceResult } from './types';

// Sarvam (W17-A1): an Indian speech company. Hindi and Hindi-English speech to text (saaras), child-friendly Indian voices
// (bulbul) and a chat model (sarvam-105b), all behind one address and one key. The key goes in the `api-subscription-key`
// header, never as a Bearer token. Every call leaves through the endpoint guard (./endpoint-guard.ts) like the founder-set
// address does: https only, a public address, no redirect followed. The address is fixed here; the founder saves only the key.
//
// Nothing is known of Sarvam's terms for a product children use, so no note: the founder reads them before clearing it
// for children's words, as for every provider. The adapter keeps nothing: no key, no recording, no text, no audio is
// stored or logged, and a failure says only its kind.
export const SARVAM = 'sarvam';
export const SARVAM_BASE_URL = 'https://api.sarvam.ai';
const KEY_HEADER = 'api-subscription-key';

// Letters, digits, dashes, underscores and dots; the vendor shapes its keys as it likes, so only the length is held to.
export const sarvamKeyLooksRight = (key: string) => /^[A-Za-z0-9._-]{16,200}$/.test(key);

const LANGUAGE: Record<'en' | 'hi', string> = { en: 'en-IN', hi: 'hi-IN' };

// ---- one call, through the guard ------------------------------------------------------------------------------------

type Sent = { ok: true; res: Response } | { ok: false; failure: AdapterFailure; status?: number };

async function send(path: string, init: { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: string | Uint8Array }, apiKey: string, timeoutMs: number): Promise<Sent> {
  try {
    const got = await guardedFetch(SARVAM_BASE_URL, path, { ...init, headers: { ...init.headers, [KEY_HEADER]: apiKey }, signal: AbortSignal.timeout(timeoutMs) });
    if (!got.ok) return { ok: false, failure: 'network' };
    if (!got.res.ok) {
      await got.res.body?.cancel().catch(() => {});
      return { ok: false, failure: 'http', status: got.res.status };
    }
    return { ok: true, res: got.res };
  } catch {
    return { ok: false, failure: 'network' };
  }
}

// ---- speech to text -------------------------------------------------------------------------------------------------

// The saaras family; the model string is the one Control chose ("saaras:v3" by default, "saaras:v4" allowed).
export const SARVAM_STT_DEFAULT_MODEL = 'saaras:v3';
const STT_MODEL = /^saaras:v[0-9.]+$/;
const EXTENSION: Record<SpeechMediaType, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/wav': 'wav' };

// A multipart body built by hand: the guard sends bytes, and a FormData would not survive it. The recording goes with a
// fixed, neutral name: nothing in the request names the family or the child.
export function multipartBody(fields: Record<string, string>, file: { name: string; type: string; bytes: Uint8Array }): { body: Uint8Array; contentType: string } {
  const boundary = `----sarvam${crypto.randomUUID().replace(/-/g, '')}`;
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const [name, value] of Object.entries(fields)) parts.push(enc.encode(`--${boundary}\r\ncontent-disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  parts.push(enc.encode(`--${boundary}\r\ncontent-disposition: form-data; name="file"; filename="${file.name}"\r\ncontent-type: ${file.type}\r\n\r\n`), file.bytes, enc.encode(`\r\n--${boundary}--\r\n`));
  const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    body.set(p, at);
    at += p.length;
  }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

export const sarvamSpeechAdapter: SpeechAdapter = {
  providerId: SARVAM,
  capability: 'speech_to_text',
  termsNote: null,
  needsKey: true,
  capabilities: capabilities(['stt']),
  keyLooksRight: sarvamKeyLooksRight,
  async transcribe(request): Promise<SpeechResult> {
    if (!STT_MODEL.test(request.model)) return { ok: false, failure: 'http', status: 400 };
    // Hindi-English mixed speech needs no setting of its own: saaras reads it as it comes.
    const { body, contentType } = multipartBody({ model: request.model, language_code: LANGUAGE[request.language] }, { name: `audio.${EXTENSION[request.mediaType] ?? 'webm'}`, type: request.mediaType, bytes: request.audio });
    const sent = await send('/speech-to-text', { method: 'POST', headers: { 'content-type': contentType, 'content-length': String(body.length) }, body }, request.apiKey, SPEECH_TIMEOUT_MS);
    if (!sent.ok) return sent;
    let answer: { transcript?: unknown } | null;
    try {
      answer = await sent.res.json();
    } catch {
      return { ok: false, failure: 'bad_stream' };
    }
    if (typeof answer?.transcript !== 'string') return { ok: false, failure: 'bad_stream' };
    // Nothing heard is an answer, not a failure: the caller asks the child to say it again.
    return { ok: true, text: answer.transcript, tokensIn: 0, tokensOut: 0 };
  },
  // The key is proved by the voice call (the one cheap call the vendor has that needs no recording).
  testConnection: (apiKey) => sarvamVoiceAdapter.testConnection!(apiKey),
};

// ---- text to speech -------------------------------------------------------------------------------------------------

// Confirm against Sarvam's live voice list: the child voices are what the founder asked for and are kept even if one
// turns out not to exist (a missing voice fails at the first try in Control, not for a child).
export const SARVAM_CHILD_SPEAKERS = ['nupur_en_kids', 'chhavi_hi_kids', 'kunal_hi_kids', 'ritu_hi_kids'] as const;
export const SARVAM_SPEAKERS = ['anushka', 'manisha', 'vidya', 'arya', 'abhilash', 'karun', 'hitesh'] as const;
// The child voices are offered on the fast model only; the other speakers on both.
export const SARVAM_VOICE_MODELS: readonly string[] = [
  ...SARVAM_CHILD_SPEAKERS.map((s) => `bulbul:v4-flash/${s}`),
  ...SARVAM_SPEAKERS.map((s) => `bulbul:v4-flash/${s}`),
  ...SARVAM_SPEAKERS.map((s) => `bulbul:v3/${s}`),
];
const VOICE_MODEL = /^bulbul:v[0-9a-z.-]+\/[a-z][a-z0-9_]{1,40}$/;

// The most characters one request may send. Confirm against the vendor's docs; the platform's own VOICE_TEXT_MAX (600) is
// lower, so a line is never split in practice. Longer text is split on sentence ends and the pieces joined again.
export const SARVAM_TTS_CHARS = 1000;

// Text cut into pieces of at most `max` characters, at sentence ends (. ! ? । and new lines) where it can, else at a space,
// else hard. Empty pieces are dropped.
export function splitForSpeech(text: string, max: number = SARVAM_TTS_CHARS): string[] {
  const sentences = text.match(/[^.!?।\n]*(?:[.!?।]+["')\]]*|\n)|[^.!?।\n]+/g) ?? [];
  const pieces: string[] = [];
  let current = '';
  const flush = () => {
    if (current.trim()) pieces.push(current.trim());
    current = '';
  };
  for (let sentence of sentences) {
    sentence = sentence.replace(/\s+/g, ' ');
    while (sentence.length > max) {
      const cut = sentence.lastIndexOf(' ', max);
      const at = cut > 0 ? cut : max;
      flush();
      pieces.push(sentence.slice(0, at).trim());
      sentence = sentence.slice(at);
    }
    if (current.length + sentence.length > max) flush();
    current += sentence;
  }
  flush();
  return pieces.filter(Boolean);
}

const u32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
const tag = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

function parseWav(b: Uint8Array): { head: Uint8Array; fmt: string; data: Uint8Array } {
  if (b.length < 12 || tag(b, 0) !== 'RIFF' || tag(b, 8) !== 'WAVE') throw new Error('not_wav');
  let pos = 12;
  let fmt = '';
  while (pos + 8 <= b.length) {
    const id = tag(b, pos);
    const size = u32(b, pos + 4);
    const start = pos + 8;
    if (id === 'fmt ') fmt = Array.from(b.subarray(start, start + size)).join(',');
    if (id === 'data') {
      // A size of 0 or 0xFFFFFFFF (a stream's placeholder) or one past the end means "to the end of the file".
      const end = size === 0 || size === 0xffffffff || start + size > b.length ? b.length : start + size;
      if (!fmt) throw new Error('not_wav');
      return { head: b.slice(0, start), fmt, data: b.subarray(start, end) };
    }
    pos = start + size + (size & 1);
  }
  throw new Error('not_wav');
}

// Several WAV files of the same format as one: the first file's header, every file's samples, and the two sizes (the
// RIFF's and the data chunk's) written again. Throws when a part is not a WAV or its format differs from the first's.
export function joinWav(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 0) throw new Error('not_wav');
  const parsed = parts.map(parseWav);
  if (parsed.some((p) => p.fmt !== parsed[0].fmt)) throw new Error('wav_format');
  const dataLength = parsed.reduce((n, p) => n + p.data.length, 0);
  const head = parsed[0].head;
  const out = new Uint8Array(head.length + dataLength);
  out.set(head, 0);
  let at = head.length;
  for (const p of parsed) {
    out.set(p.data, at);
    at += p.data.length;
  }
  const view = new DataView(out.buffer);
  view.setUint32(4, out.length - 8, true);
  view.setUint32(head.length - 4, dataLength, true);
  return out;
}

// One piece of text spoken: the WAV files the vendor returned (one per text sent; one text is sent).
async function speakPiece(apiKey: string, text: string, language: 'en' | 'hi', model: string, speaker: string): Promise<{ ok: true; audios: Uint8Array[] } | { ok: false; failure: AdapterFailure; status?: number }> {
  const payload = JSON.stringify({ text, target_language_code: LANGUAGE[language], speaker, model });
  const sent = await send('/text-to-speech', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) }, body: payload }, apiKey, VOICE_TIMEOUT_MS);
  if (!sent.ok) return sent;
  const answer = (await sent.res.json().catch(() => null)) as { audios?: unknown } | null;
  const list = Array.isArray(answer?.audios) ? answer.audios : [];
  const audios = list.map((a) => audioFromBase64(a));
  return audios.length > 0 && audios.every((a): a is Uint8Array => a !== null) ? { ok: true, audios } : { ok: false, failure: 'bad_stream' };
}

export const sarvamVoiceAdapter: VoiceAdapter = {
  providerId: SARVAM,
  capability: 'text_to_speech',
  termsNote: null,
  needsKey: true,
  capabilities: capabilities(['tts']),
  keyLooksRight: sarvamKeyLooksRight,
  modelLooksRight: (model) => VOICE_MODEL.test(model),
  async synthesize(request): Promise<VoiceResult> {
    if (!VOICE_MODEL.test(request.model)) return { ok: false, failure: 'http', status: 400 };
    const [model, speaker] = request.model.split('/');
    const pieces = splitForSpeech(request.text);
    if (pieces.length === 0) return { ok: false, failure: 'http', status: 400 };
    const files: Uint8Array[] = [];
    for (const piece of pieces) {
      const got = await speakPiece(request.apiKey, piece, request.language, model, speaker);
      if (!got.ok) return got;
      files.push(...got.audios);
    }
    try {
      return { ok: true, audio: files.length === 1 ? files[0] : joinWav(files), mediaType: 'audio/wav', characters: request.text.length };
    } catch {
      return { ok: false, failure: 'bad_stream' };
    }
  },
  // One word spoken: proves the key and that the voice service is on. The model list is fixed (the vendor has no free list
  // call that is confirmed), for Control's picker.
  async testConnection(apiKey): Promise<ConnectionTest> {
    const got = await speakPiece(apiKey, 'Namaste', 'en', 'bulbul:v4-flash', 'anushka');
    return got.ok ? { ok: true, models: [...SARVAM_VOICE_MODELS] } : { ok: false, failure: got.failure, ...(got.status ? { status: got.status } : {}) };
  },
};

// ---- text -----------------------------------------------------------------------------------------------------------

const CHAT_URL = `${SARVAM_BASE_URL}/v2/chat/completions`;
const CHAT_MODEL = /^sarvam-[a-z0-9-]+$/;
// The chat model always reasons first and the reasoning counts toward the limit, so a small limit is spent before the
// answer starts: never ask for less than this.
export const SARVAM_MIN_MAX_TOKENS = 1500;

// Slow (six to nine seconds an answer), so not for a live child chat; it is here for the backup chain and for trying.
export const sarvamAdapter: TextAdapter = {
  providerId: SARVAM,
  capability: 'text',
  termsNote: null,
  needsKey: true,
  capabilities: capabilities(['text', 'stream']),
  keyLooksRight: sarvamKeyLooksRight,
  async streamText(request, onDelta): Promise<AdapterResult> {
    if (!CHAT_MODEL.test(request.model)) return { ok: false, failure: 'http', status: 400 };
    // Only delta.content reaches onDelta and the returned text (the shared helper reads nothing else), so the model's
    // reasoning_content is never shown, kept or counted as the answer.
    const result = await streamChatCompletions(CHAT_URL, request.apiKey, { ...request, maxTokens: Math.max(request.maxTokens, SARVAM_MIN_MAX_TOKENS) }, onDelta, {
      maxTokensField: 'max_tokens',
      jsonMode: false,
      includeUsage: false,
      headers: { [KEY_HEADER]: request.apiKey },
      send: async (init) => {
        const got = await guardedFetch(SARVAM_BASE_URL, '/v2/chat/completions', { method: 'POST', ...init });
        return got.ok ? got.res : null;
      },
    });
    // Thinking used up the whole limit: nothing of an answer was written, so the backup provider runs.
    if (result.ok && result.text.trim() === '' && result.finish === 'length') return { ok: false, failure: 'cut_short' };
    return result;
  },
  // No model-list call is confirmed, so the key is proved by the voice check; the one chat model is named.
  async testConnection(apiKey): Promise<ConnectionTest> {
    const got = await sarvamVoiceAdapter.testConnection!(apiKey);
    return got.ok ? { ok: true, models: ['sarvam-105b'] } : got;
  },
};
