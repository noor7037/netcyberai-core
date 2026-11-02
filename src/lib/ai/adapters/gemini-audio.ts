import { googleKeyLooksRight } from './gemini';
import { audioFromBase64 } from './voice-audio';
import {
  SPEECH_TIMEOUT_MS,
  VOICE_TIMEOUT_MS,
  capabilities,
  type AdapterFailure,
  type RealtimeAdapter,
  type RealtimeResult,
  type SpeechAdapter,
  type SpeechResult,
  type VoiceAdapter,
  type VoiceResult,
} from './types';

// Google's Gemini API (AI Studio) for sound (W17-A4): a voice, an ear, and a Live token. All three use the same key as the
// Gemini text adapter (one Gemini key in Control, the same terms note and clearance), so the speech adapter declares no
// key rules of its own. The key goes in the x-goog-api-key header, never in the address; nothing is logged or thrown but
// the one case in mintToken; a failure says only its kind. The fixed vendor addresses are called with plain fetch and no
// redirects, as the other vendor adapters do; the endpoint guard is for addresses the founder types.
const BASE = 'https://generativelanguage.googleapis.com';
const MINT_TIMEOUT_MS = 8_000;
// A model id becomes part of the address, so only this shape goes in.
const GEMINI_MODEL = /^[a-z0-9][a-z0-9.-]{1,60}$/;
const VOICE_NAME = /^[A-Za-z]{2,30}$/;
// Gemini's speech models speak in a named voice; a bare model id (what Control's picker lists) gets this one.
export const GEMINI_DEFAULT_VOICE = 'Kore';

type Part = { text?: unknown; inlineData?: { data?: unknown } };
type Generated = { candidates?: { content?: { parts?: Part[] } }[]; usageMetadata?: { promptTokenCount?: unknown; candidatesTokenCount?: unknown } };

async function generate(model: string, apiKey: string, body: unknown, timeoutMs: number): Promise<{ ok: true; answer: Generated } | { ok: false; failure: AdapterFailure; status?: number }> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, failure: 'network' };
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    return { ok: false, failure: 'http', status: res.status };
  }
  const answer = (await res.json().catch(() => null)) as Generated | null;
  return answer ? { ok: true, answer } : { ok: false, failure: 'bad_stream' };
}

// ---- voice -------------------------------------------------------------------------------------------------------

// Gemini returns raw PCM (24 kHz, signed 16-bit, mono, little-endian) with no header, which no player opens. A 44-byte
// RIFF/WAVE header makes it a file the phone can play. Pure, so it is tested without a network.
export function pcmToWav(samples: Uint8Array, sampleRate = 24_000, channels = 1): Uint8Array {
  const bytesPerSample = 2;
  const out = new Uint8Array(44 + samples.length);
  const view = new DataView(out.buffer);
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // size of the fmt chunk
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true); // bytes per second
  view.setUint16(32, channels * bytesPerSample, true); // block align
  view.setUint16(34, bytesPerSample * 8, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, samples.length, true);
  out.set(samples, 44);
  return out;
}

// The model string is "<model>/<voiceName>", for example "gemini-2.5-flash-preview-tts/Kore"; a bare model id takes the
// default voice. Unconfirmed: the exact speech model ids and voice names are the vendor's to change. Control's picker
// fills from the Gemini text adapter's model list (the ones that can generateContent), so confirm the ids against it.
function splitVoice(model: string): { model: string; voice: string } | null {
  const [id = '', voice = GEMINI_DEFAULT_VOICE, ...rest] = model.split('/');
  return rest.length === 0 && GEMINI_MODEL.test(id) && /tts/.test(id) && VOICE_NAME.test(voice) ? { model: id, voice } : null;
}

export const geminiVoiceAdapter: VoiceAdapter = {
  providerId: 'gemini',
  capability: 'text_to_speech',
  termsNote: 'adults_only',
  needsKey: true,
  capabilities: capabilities(['tts']),
  keyLooksRight: googleKeyLooksRight,
  modelLooksRight: (model) => splitVoice(model) !== null,
  async synthesize(request): Promise<VoiceResult> {
    const picked = splitVoice(request.model);
    if (!picked) return { ok: false, failure: 'http', status: 400 };
    // The text goes alone: Gemini's speech models read the language from the words themselves, and an instruction such
    // as "Say this in Hindi:" risks being read aloud as part of the line.
    const made = await generate(
      picked.model,
      request.apiKey,
      {
        contents: [{ parts: [{ text: request.text }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: picked.voice } } } },
      },
      VOICE_TIMEOUT_MS
    );
    if (!made.ok) return made;
    const pcm = audioFromBase64(made.answer.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data);
    // 16-bit samples: an odd length is not audio.
    if (!pcm || pcm.length % 2 !== 0) return { ok: false, failure: 'bad_stream' };
    return { ok: true, audio: pcmToWav(pcm), mediaType: 'audio/wav', characters: request.text.length };
  },
};

// ---- speech to text ----------------------------------------------------------------------------------------------

const PROMPT = 'Transcribe this recording exactly, in the language spoken (Hindi or English). Reply with the words only.';
// What Gemini documents as accepted: wav, mp3, aiff, aac, ogg, flac. Not webm (the phone's usual recording) and, since
// nothing confirms an mp4 container is read as aac, not mp4 either: both answer 415 at once, with no call, so the
// platform's chain moves to the backup provider.
const GEMINI_AUDIO: Partial<Record<string, string>> = { 'audio/wav': 'audio/wav', 'audio/ogg': 'audio/ogg' };

export const geminiSpeechAdapter: SpeechAdapter = {
  providerId: 'gemini',
  capability: 'speech_to_text',
  termsNote: 'adults_only',
  needsKey: true,
  capabilities: capabilities(['stt']),
  async transcribe(request): Promise<SpeechResult> {
    const mimeType = GEMINI_AUDIO[request.mediaType];
    if (!mimeType) return { ok: false, failure: 'endpoint', status: 415 };
    if (!GEMINI_MODEL.test(request.model)) return { ok: false, failure: 'http', status: 400 };
    const made = await generate(
      request.model,
      request.apiKey,
      { contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType, data: Buffer.from(request.audio).toString('base64') } }] }] },
      SPEECH_TIMEOUT_MS
    );
    if (!made.ok) return made;
    const parts = made.answer.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('').trim();
    if (!text) return { ok: false, failure: 'bad_stream' };
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    return { ok: true, text, tokensIn: n(made.answer.usageMetadata?.promptTokenCount), tokensOut: n(made.answer.usageMetadata?.candidatesTokenCount) };
  },
};

// ---- realtime (Live) token ---------------------------------------------------------------------------------------

const LIVE_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

// Gemini Live's ephemeral token, minted here so the phone can connect to Google directly (no audio through this server).
// The phone's realtime leg is still the OpenAI-shaped stub, so today this only lets Control choose Gemini for "Live
// voice call" and mint a token. Before the phone really uses it, the child-safety rules (as OpenAI's session carries in
// openai-realtime.ts) must be locked into the token's config; they are not here because that field is unconfirmed.
// Unconfirmed: the auth_tokens request fields and whether the model needs a "models/" prefix.
export const geminiRealtimeAdapter: RealtimeAdapter = {
  providerId: 'gemini',
  capability: 'realtime',
  termsNote: 'adults_only',
  needsKey: true,
  capabilities: capabilities(['realtime']),
  keyLooksRight: googleKeyLooksRight,
  modelLooksRight: (model) => GEMINI_MODEL.test(model),
  async mintToken(request): Promise<RealtimeResult> {
    // No key: this provider is not set up, and no token is ever minted for it.
    if (!request.apiKey) throw new Error('not_switched_on');
    if (!GEMINI_MODEL.test(request.model)) return { ok: false, failure: 'http', status: 400 };
    const now = Date.now();
    const newSessionExpireTime = new Date(now + 60_000).toISOString();
    let res: Response;
    try {
      res = await fetch(`${BASE}/v1alpha/auth_tokens`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': request.apiKey },
        body: JSON.stringify({
          uses: 1,
          expireTime: new Date(now + 30 * 60_000).toISOString(),
          newSessionExpireTime,
          liveConnectConstraints: { model: request.model, config: { responseModalities: ['AUDIO'] } },
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(MINT_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, failure: 'network' };
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, failure: 'http', status: res.status };
    }
    const body = (await res.json().catch(() => null)) as { name?: unknown } | null;
    if (typeof body?.name !== 'string' || !body.name) return { ok: false, failure: 'bad_stream' };
    // The phone must open its session within the minute (newSessionExpireTime); that is the time it is told.
    return { ok: true, token: body.name, expiresAt: Date.parse(newSessionExpireTime), url: LIVE_URL, model: request.model };
  },
};
