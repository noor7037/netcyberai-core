import { streamChatCompletions } from './chat-completions';
import { MODEL_ID, MODEL_LIST_MAX, dataIds, modelIds } from './connection';
import { readAudio } from './voice-audio';
import { CALL_TIMEOUT_MS, SPEECH_TIMEOUT_MS, VOICE_TIMEOUT_MS, capabilities, type AdapterResult, type ConnectionTest, type SpeechAdapter, type SpeechResult, type TextAdapter, type VoiceAdapter, type VoiceResult } from './types';

// OpenRouter (W17-A3): one key that reaches many vendors' models, several of them free, for text, photos, speech to
// text and text to speech. It is a dedicated service rather than a switch on `openai_compatible` (the lead's decision):
// the generic service is the door for any text vendor at an address the founder types, and stays untouched. OpenRouter's
// audio routes, its `voice` field and the raw PCM that some voices answer with are one vendor's own shape, so they live
// in a named adapter with a fixed address, a key and nothing else to save: no schema change, no per-service switch.
//
// The address is fixed here (like NVIDIA's), so the founder-address guard (./endpoint-guard.ts) is not used: its send
// takes a string body and the transcription call is multipart. Every call here goes to OPENROUTER_BASE_URL with
// `redirect: 'error'`, a key only in the Authorization header, and nothing a vendor says is kept, logged or thrown.
export const OPENROUTER = 'openrouter';
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
// OpenRouter asks apps to say who they are (its rankings and its abuse handling read these two headers).
const APP_HEADERS = { 'HTTP-Referer': 'https://www.netcyberai.com', 'X-Title': 'NetCyberAI' } as const;

const authHeaders = (apiKey: string): Record<string, string> => ({ authorization: `Bearer ${apiKey}`, ...APP_HEADERS });

// A free key ($0 of credit) reaches text; the audio models answer 402 (needs credit) or 403 (not offered by API). They
// are told apart so Control can word each: 402 stays an `http` failure (the platform reads it as a spent quota and moves
// to the next provider), 403 is `refused` (the vendor declined this call; nothing to retry on this key).
export function openrouterFailureCode(status: number | undefined): 'needs_credit' | 'not_available_by_api' | null {
  return status === 402 ? 'needs_credit' : status === 403 ? 'not_available_by_api' : null;
}
type HttpFailure = { ok: false; failure: 'http' | 'refused'; status: number };
const failedWith = (status: number): HttpFailure => (status === 403 ? { ok: false, failure: 'refused', status } : { ok: false, failure: 'http', status });

// ---- text and photos ----------------------------------------------------------------------------------------------

export const openrouterAdapter: TextAdapter = {
  providerId: OPENROUTER,
  capability: 'text',
  termsNote: null,
  needsKey: true,
  needsBaseUrl: false,
  capabilities: capabilities(['text', 'vision', 'stream']),
  // OpenRouter keys start "sk-or-" (then "v1-" and hex today); only the shape and length are held to, not the tail.
  keyLooksRight: (key) => /^(?=.{20,200}$)sk-or-[A-Za-z0-9_-]+$/.test(key),
  async streamText(request, onDelta): Promise<AdapterResult> {
    // Photos go as OpenAI `image_url` content parts, which the shared helper already builds from ChatMessage.images.
    // JSON mode is not declared (a free model may not honour response_format); JSON is asked for in the instructions.
    const url = `${OPENROUTER_BASE_URL}/chat/completions`;
    const r = await streamChatCompletions(url, request.apiKey, request, onDelta, {
      maxTokensField: 'max_tokens',
      jsonMode: false,
      includeUsage: true,
      send: (init) => fetch(url, { method: 'POST', ...init, headers: { ...init.headers, ...APP_HEADERS }, redirect: 'error' }),
    });
    return !r.ok && r.failure === 'http' && r.status === 403 ? failedWith(403) : r;
  },
  // GET /models: lists every model OpenRouter offers. The free ones ("...:free") come first so they survive the
  // picker's cap (OpenRouter lists more models than Control keeps); ids stay exactly as the vendor lists them.
  async testConnection(apiKey): Promise<ConnectionTest> {
    let res: Response;
    try {
      res = await fetch(`${OPENROUTER_BASE_URL}/models`, { method: 'GET', headers: authHeaders(apiKey), redirect: 'error', signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
    } catch {
      return { ok: false, failure: 'network' };
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return failedWith(res.status);
    }
    // A list that cannot be read still means the call worked: the picker then says the list is unavailable.
    const body = await res.json().catch(() => null);
    if (!body) return { ok: true };
    let raw: unknown[] = [];
    try {
      raw = dataIds(body);
    } catch {
      raw = [];
    }
    const free = (v: unknown) => typeof v === 'string' && v.endsWith(':free');
    const ids = [...modelIds(raw.filter(free)), ...modelIds(raw.filter((v) => !free(v)))];
    return { ok: true, models: ids.slice(0, MODEL_LIST_MAX) };
  },
};

// ---- speech to text -----------------------------------------------------------------------------------------------

const EXTENSION: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/wav': 'wav' };

export const openrouterSpeechAdapter: SpeechAdapter = {
  providerId: OPENROUTER,
  capability: 'speech_to_text',
  termsNote: null,
  needsKey: true,
  capabilities: capabilities(['stt']),
  keyLooksRight: (key) => openrouterAdapter.keyLooksRight(key),
  testConnection: (apiKey) => openrouterAdapter.testConnection!(apiKey),
  // One multipart request, as OpenAI's: the recording under a fixed neutral name, the model Control chose, the language.
  async transcribe(request): Promise<SpeechResult> {
    if (!MODEL_ID.test(request.model)) return { ok: false, failure: 'http', status: 400 };
    const form = new FormData();
    // A copy into a fresh ArrayBuffer: a Blob takes a plain buffer, never a view of a shared one.
    form.append('file', new Blob([new Uint8Array(request.audio)], { type: request.mediaType }), `audio.${EXTENSION[request.mediaType] ?? 'webm'}`);
    form.append('model', request.model);
    form.append('language', request.language);
    let res: Response;
    try {
      // No content-type header: fetch sets the multipart boundary itself.
      res = await fetch(`${OPENROUTER_BASE_URL}/audio/transcriptions`, { method: 'POST', headers: authHeaders(request.apiKey), body: form, redirect: 'error', signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS) });
    } catch {
      return { ok: false, failure: 'network' };
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return failedWith(res.status);
    }
    let body: { text?: unknown; usage?: { input_tokens?: unknown; output_tokens?: unknown } | null };
    try {
      body = await res.json();
    } catch {
      return { ok: false, failure: 'bad_stream' };
    }
    if (typeof body?.text !== 'string') return { ok: false, failure: 'bad_stream' };
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    return { ok: true, text: body.text, tokensIn: n(body.usage?.input_tokens), tokensOut: n(body.usage?.output_tokens) };
  },
};

// ---- text to speech -----------------------------------------------------------------------------------------------

// A model id of OpenRouter already holds a slash ("vendor/model"), so the model string Control saves is
// "<model id>|<voice>" with a vertical bar: "fishaudio/s1-mini:free|default". No voice part: the neutral default below.
const TTS_MODEL = /^[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9._:-]+(\|[A-Za-z0-9._ -]{1,60})?$/;
export const OPENROUTER_DEFAULT_VOICE = 'alloy';
// Some voices answer raw PCM whatever else is asked (HeyGen needs both a voice and response_format 'pcm' and refuses
// mp3), so PCM is always asked for. It comes as 44.1 kHz, signed 16-bit little-endian, mono.
export const OPENROUTER_PCM_RATE = 44_100;
// Raw PCM is bulky (about 88 kB a second): a long line is allowed more room than the mp3 ceiling in ./voice-audio.ts.
const PCM_AUDIO_MAX = 8_000_000;

// Raw samples as a WAV file a phone can play: a 44-byte RIFF header and the samples, whole 16-bit frames only (a
// stray last byte would be half a sample).
export function pcmToWav(samples: Uint8Array, sampleRate = OPENROUTER_PCM_RATE, channels = 1): Uint8Array {
  const frame = channels * 2;
  const dataLength = samples.length - (samples.length % frame);
  const out = new Uint8Array(44 + dataLength);
  const view = new DataView(out.buffer);
  const ascii = (at: number, s: string) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // the fmt chunk's size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * frame, true); // bytes a second
  view.setUint16(32, frame, true); // bytes a frame
  view.setUint16(34, 16, true); // bits a sample
  ascii(36, 'data');
  view.setUint32(40, dataLength, true);
  out.set(samples.subarray(0, dataLength), 44);
  return out;
}

export const openrouterVoiceAdapter: VoiceAdapter = {
  providerId: OPENROUTER,
  capability: 'text_to_speech',
  termsNote: null,
  needsKey: true,
  capabilities: capabilities(['tts']),
  keyLooksRight: (key) => openrouterAdapter.keyLooksRight(key),
  modelLooksRight: (model) => TTS_MODEL.test(model),
  async synthesize(request): Promise<VoiceResult> {
    if (!TTS_MODEL.test(request.model)) return { ok: false, failure: 'http', status: 400 };
    const [model, voice] = request.model.split('|');
    let res: Response;
    try {
      res = await fetch(`${OPENROUTER_BASE_URL}/audio/speech`, {
        method: 'POST',
        headers: { ...authHeaders(request.apiKey), 'content-type': 'application/json' },
        body: JSON.stringify({ model, input: request.text, voice: voice || OPENROUTER_DEFAULT_VOICE, response_format: 'pcm' }),
        redirect: 'error',
        signal: AbortSignal.timeout(VOICE_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, failure: 'network' };
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return failedWith(res.status);
    }
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    const characters = request.text.length;
    // Fish Audio answers mp3 whatever is asked: handed on as it is.
    if (type.startsWith('audio/mpeg') || type.startsWith('audio/mp3')) {
      const audio = await readAudio(res);
      return audio ? { ok: true, audio, mediaType: 'audio/mpeg', characters } : { ok: false, failure: 'bad_stream' };
    }
    // JSON or text is a vendor's error sent with a 200: not audio.
    if (/json|text\//i.test(type)) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, failure: 'bad_stream' };
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch {
      return { ok: false, failure: 'bad_stream' };
    }
    if (bytes.length === 0 || bytes.length > PCM_AUDIO_MAX) return { ok: false, failure: 'bad_stream' };
    // Already a WAV file (a RIFF header): not wrapped twice.
    if (type.includes('wav') && bytes.length > 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF') return { ok: true, audio: bytes, mediaType: 'audio/wav', characters };
    const wav = pcmToWav(bytes);
    return wav.length > 44 ? { ok: true, audio: wav, mediaType: 'audio/wav', characters } : { ok: false, failure: 'bad_stream' };
  },
  // The text adapter's check: the same key.
  testConnection: (apiKey) => openrouterAdapter.testConnection!(apiKey),
};
