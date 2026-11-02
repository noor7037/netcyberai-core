import { modelIds } from './connection';
import { readAudio } from './voice-audio';
import { CALL_TIMEOUT_MS, SPEECH_TIMEOUT_MS, VOICE_TIMEOUT_MS, capabilities, type AdapterFailure, type ConnectionTest, type SpeechAdapter, type SpeechMediaType, type SpeechResult, type SpeechToSpeechAdapter, type VoiceAdapter, type VoiceResult } from './types';

// ElevenLabs (W17-A2): text to speech, speech to text (Scribe) and speech to speech, over fetch (no SDK), one key in the
// `xi-api-key` header (never Authorization, never in the address). The host is fixed here, so the calls use fetch with
// redirect refused, like the OpenAI and Google voice adapters; the endpoint guard is for an address the founder types
// (and takes no multipart body).
//
// Terms: ElevenLabs' free plan is not licensed for commercial use, so every adapter below carries
// 'paid_plan_for_commercial_use' and Control shows that advice beside the provider's switch. Clearing it for children's
// words is still the founder's decision there.
//
// The vendor's wire details below were written from its public docs without a live key: confirm each against the
// current docs before a child hears it (the test file lists them).
const BASE = 'https://api.elevenlabs.io';
const OUTPUT_FORMAT = 'mp3_44100_128';

// The model string for a voice is `<model_id>/<voice_id>`: Control keeps one model string per profile and the vendor
// needs both. eleven_multilingual_v2 costs 1 credit per character and detects the language itself; eleven_flash_v2_5
// costs 0.5 and takes a language_code.
const TTS_MODELS = ['eleven_flash_v2_5', 'eleven_multilingual_v2'] as const;
const VOICE_ID = /^[A-Za-z0-9]{10,40}$/;
const STS_MODEL = 'eleven_multilingual_sts_v2';
const STT_MODEL = /^scribe_v[0-9a-z_]+$/;
// Keys are letters and digits and often start with `sk_`.
const KEY = /^[A-Za-z0-9_]{20,200}$/;
const keyLooksRight = (key: string) => KEY.test(key);

function parseVoiceModel(model: string, allowed: readonly string[]): { modelId: string; voiceId: string } | null {
  const [modelId, voiceId, extra] = model.split('/');
  return extra === undefined && allowed.includes(modelId) && VOICE_ID.test(voiceId ?? '') ? { modelId, voiceId } : null;
}

// ---- scope errors ------------------------------------------------------------------------------------------------
// A key made with limited scopes is refused with 401 and { detail: { status: 'missing_permissions', message } }. That is
// the founder's setup to fix, not a bad key, so it maps to 'refused' (the key is read, understood and turned down).
export const ELEVENLABS_SCOPES = ['text_to_speech', 'speech_to_text', 'speech_to_speech', 'voices_read'] as const;
export type ElevenLabsScope = (typeof ELEVENLABS_SCOPES)[number];

export function isMissingPermission(status: number, body: unknown): boolean {
  if (status !== 401) return false;
  const d = (body as { detail?: { status?: unknown; message?: unknown } } | null)?.detail;
  return d?.status === 'missing_permissions' || (typeof d?.message === 'string' && /permission/i.test(d.message));
}

// The scope the vendor's message names (for Control's "the key lacks the text_to_speech scope"), or null. Only a name
// from our own list comes back, never the vendor's text.
export function elevenlabsScopeMessage(status: number, body: unknown): ElevenLabsScope | null {
  if (!isMissingPermission(status, body)) return null;
  const message = String((body as { detail?: { message?: unknown } } | null)?.detail?.message ?? '');
  return ELEVENLABS_SCOPES.find((s) => message.includes(s)) ?? null;
}

// Failure for a non-2xx answer: the body is read only to tell a missing scope from any other refusal, and dropped.
async function failureOf(res: Response): Promise<{ ok: false; failure: AdapterFailure; status: number }> {
  if (res.status === 401) {
    const body = await res.json().catch(() => null);
    return { ok: false, failure: isMissingPermission(401, body) ? 'refused' : 'http', status: 401 };
  }
  await res.body?.cancel().catch(() => {});
  return { ok: false, failure: 'http', status: res.status };
}

async function call(path: string, init: { method: 'GET' | 'POST'; apiKey: string; body?: BodyInit; json?: boolean }, timeoutMs: number): Promise<{ ok: true; res: Response } | { ok: false; failure: AdapterFailure; status?: number }> {
  let res: Response;
  try {
    // No content-type for a form: fetch sets the multipart boundary itself.
    const headers: Record<string, string> = { 'xi-api-key': init.apiKey, ...(init.json ? { 'content-type': 'application/json' } : {}) };
    res = await fetch(`${BASE}${path}`, { method: init.method, headers, body: init.body, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return { ok: false, failure: 'network' };
  }
  return res.ok ? { ok: true, res } : failureOf(res);
}

const EXTENSION: Record<SpeechMediaType, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/wav': 'wav' };
// A copy into a fresh ArrayBuffer (a Blob takes a plain buffer); a fixed, neutral file name: nothing names the child.
const recording = (audio: Uint8Array, mediaType: SpeechMediaType) => new Blob([new Uint8Array(audio)], { type: mediaType });

// ---- text to speech ----------------------------------------------------------------------------------------------

// The voices of GET /v1/voices as { id, name }, for a later screen that shows a voice by its name; the model picker
// keeps to ids (a name is free text and has no place in a model string).
export function voiceLabels(body: unknown): { id: string; name: string }[] {
  const voices = (body as { voices?: { voice_id?: unknown; name?: unknown }[] } | null)?.voices ?? [];
  return voices.flatMap((v) => (typeof v?.voice_id === 'string' && VOICE_ID.test(v.voice_id) ? [{ id: v.voice_id, name: typeof v.name === 'string' ? v.name : '' }] : []));
}

// For each voice, `eleven_flash_v2_5/<id>` then `eleven_multilingual_v2/<id>`.
export function voiceModels(body: unknown): string[] {
  return voiceLabels(body).flatMap((v) => TTS_MODELS.map((m) => `${m}/${v.id}`));
}

export const elevenlabsVoiceAdapter: VoiceAdapter = {
  providerId: 'elevenlabs',
  capability: 'text_to_speech',
  termsNote: 'paid_plan_for_commercial_use',
  needsKey: true,
  capabilities: capabilities(['tts']),
  keyLooksRight,
  modelLooksRight: (model) => parseVoiceModel(model, TTS_MODELS) !== null,
  async synthesize(request): Promise<VoiceResult> {
    const parsed = parseVoiceModel(request.model, TTS_MODELS);
    if (!parsed) return { ok: false, failure: 'http', status: 400 };
    // language_code only for the flash model, which accepts it (confirm against the vendor's docs); multilingual_v2
    // detects the language from the text.
    const body = { text: request.text, model_id: parsed.modelId, ...(parsed.modelId === 'eleven_flash_v2_5' ? { language_code: request.language } : {}) };
    const got = await call(`/v1/text-to-speech/${parsed.voiceId}?output_format=${OUTPUT_FORMAT}`, { method: 'POST', apiKey: request.apiKey, body: JSON.stringify(body), json: true }, VOICE_TIMEOUT_MS);
    if (!got.ok) return got;
    const audio = await readAudio(got.res);
    return audio ? { ok: true, audio, mediaType: 'audio/mpeg', characters: request.text.length } : { ok: false, failure: 'bad_stream' };
  },
  // GET /v1/voices: free, and answers only for a working key (one that may read voices).
  async testConnection(apiKey): Promise<ConnectionTest> {
    const got = await call('/v1/voices', { method: 'GET', apiKey }, CALL_TIMEOUT_MS);
    if (!got.ok) return got;
    const body = await got.res.json().catch(() => null);
    // A list that cannot be read still means the key works: the picker then says the list is unavailable.
    return body ? { ok: true, models: modelIds(voiceModels(body)) } : { ok: true };
  },
};

// ---- speech to text (Scribe) -------------------------------------------------------------------------------------

// Scribe drops the nukta dots in Hindi (ज़ comes back as ज). The adapter does not repair the text: a child's words are
// never altered. A comparison (the tests) folds nukta (U+093C) on both sides.
export const elevenlabsSpeechAdapter: SpeechAdapter = {
  providerId: 'elevenlabs',
  capability: 'speech_to_text',
  termsNote: 'paid_plan_for_commercial_use',
  needsKey: true,
  capabilities: capabilities(['stt']),
  keyLooksRight,
  async transcribe(request): Promise<SpeechResult> {
    if (!STT_MODEL.test(request.model)) return { ok: false, failure: 'http', status: 400 };
    const form = new FormData();
    form.append('file', recording(request.audio, request.mediaType), `audio.${EXTENSION[request.mediaType] ?? 'webm'}`);
    form.append('model_id', request.model);
    form.append('language_code', request.language);
    const got = await call('/v1/speech-to-text', { method: 'POST', apiKey: request.apiKey, body: form }, SPEECH_TIMEOUT_MS);
    if (!got.ok) return got;
    const body = (await got.res.json().catch(() => null)) as { text?: unknown } | null;
    // Billed by audio length, which the answer does not give here, so no tokens are counted.
    return typeof body?.text === 'string' ? { ok: true, text: body.text, tokensIn: 0, tokensOut: 0 } : { ok: false, failure: 'bad_stream' };
  },
  // The voice adapter's free check: the same key.
  testConnection: (apiKey) => elevenlabsVoiceAdapter.testConnection!(apiKey),
};

// ---- speech to speech --------------------------------------------------------------------------------------------

export const elevenlabsStsAdapter: SpeechToSpeechAdapter = {
  providerId: 'elevenlabs',
  capability: 'speech_to_speech',
  termsNote: 'paid_plan_for_commercial_use',
  needsKey: true,
  capabilities: capabilities(['sts']),
  keyLooksRight,
  modelLooksRight: (model) => parseVoiceModel(model, [STS_MODEL]) !== null,
  async convert(request): Promise<VoiceResult> {
    const parsed = parseVoiceModel(request.model, [STS_MODEL]);
    if (!parsed) return { ok: false, failure: 'http', status: 400 };
    const form = new FormData();
    form.append('audio', recording(request.audio, request.mediaType), `audio.${EXTENSION[request.mediaType] ?? 'webm'}`);
    form.append('model_id', parsed.modelId);
    const got = await call(`/v1/speech-to-speech/${parsed.voiceId}?output_format=${OUTPUT_FORMAT}`, { method: 'POST', apiKey: request.apiKey, body: form }, CALL_TIMEOUT_MS);
    if (!got.ok) return got;
    const audio = await readAudio(got.res);
    // Billed by the length of the recording, not characters.
    return audio ? { ok: true, audio, mediaType: 'audio/mpeg', characters: 0 } : { ok: false, failure: 'bad_stream' };
  },
};
