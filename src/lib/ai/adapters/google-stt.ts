import { freeCheck } from './connection';
import { googleKeyLooksRight } from './gemini';
import { SPEECH_TIMEOUT_MS, capabilities, type ConnectionTest, type SpeechAdapter, type SpeechResult } from './types';

// Google Cloud Speech-to-Text (W17-A4), over fetch: POST /v1/speech:recognize with an API key in the x-goog-api-key header
// (never in the address). Its own provider id, 'google_stt', for the same reason as 'google_tts': it is a separate Google
// Cloud API, switched on per project, with its own key, circuit and bill, and its terms are Google Cloud's service terms.
// The model Control sets is a recognition model ("latest_short", "latest_long") or "default", which sends none.
const URL = 'https://speech.googleapis.com/v1/speech:recognize';
// A call that answers only for a working key with the API switched on. Unconfirmed: that the operations list is free and
// accepts an API key; confirm it against the vendor before the key test is relied on.
const PROBE_URL = 'https://speech.googleapis.com/v1/operations?pageSize=1';
const LANGUAGE: Record<'en' | 'hi', string> = { en: 'en-IN', hi: 'hi-IN' };
const MODEL = /^[a-z0-9_]{1,40}$/;

// The sample rate is in a WAV file's header (bytes 24-27, little-endian); Opus recordings are read at 48 kHz.
function wavRate(audio: Uint8Array): number | null {
  const tag = (at: number) => String.fromCharCode(...audio.subarray(at, at + 4));
  if (audio.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  const rate = new DataView(audio.buffer, audio.byteOffset, audio.byteLength).getUint32(24, true);
  return rate >= 8_000 && rate <= 48_000 ? rate : null;
}

export const googleSttAdapter: SpeechAdapter = {
  providerId: 'google_stt',
  capability: 'speech_to_text',
  termsNote: null,
  needsKey: true,
  capabilities: capabilities(['stt']),
  keyLooksRight: googleKeyLooksRight,
  async transcribe(request): Promise<SpeechResult> {
    // mp4 is not a container the recognizer reads: 415 at once, with no call, so the chain moves to the backup.
    if (request.mediaType === 'audio/mp4') return { ok: false, failure: 'endpoint', status: 415 };
    if (request.model !== 'default' && !MODEL.test(request.model)) return { ok: false, failure: 'http', status: 400 };
    let encoding: string;
    let sampleRateHertz: number;
    if (request.mediaType === 'audio/wav') {
      const rate = wavRate(request.audio);
      if (rate === null) return { ok: false, failure: 'http', status: 400 };
      encoding = 'LINEAR16';
      sampleRateHertz = rate;
    } else {
      encoding = request.mediaType === 'audio/ogg' ? 'OGG_OPUS' : 'WEBM_OPUS';
      sampleRateHertz = 48_000;
    }
    let res: Response;
    try {
      res = await fetch(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': request.apiKey },
        body: JSON.stringify({
          config: { encoding, sampleRateHertz, languageCode: LANGUAGE[request.language], model: request.model === 'default' ? undefined : request.model },
          audio: { content: Buffer.from(request.audio).toString('base64') },
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, failure: 'network' };
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, failure: 'http', status: res.status };
    }
    const body = (await res.json().catch(() => null)) as { results?: { alternatives?: { transcript?: unknown }[] }[] } | null;
    if (!body) return { ok: false, failure: 'bad_stream' };
    const text = (body.results ?? [])
      .map((r) => {
        const t = r?.alternatives?.[0]?.transcript;
        return typeof t === 'string' ? t.trim() : '';
      })
      .filter(Boolean)
      .join(' ');
    // Silence is an answer with no results: the call worked, nothing was heard (the caller treats empty as "heard nothing").
    return { ok: true, text, tokensIn: 0, tokensOut: 0 };
  },
  async testConnection(apiKey): Promise<ConnectionTest> {
    const r = await freeCheck(PROBE_URL, { 'x-goog-api-key': apiKey });
    return r.ok ? { ok: true, models: ['default', 'latest_short', 'latest_long'] } : r;
  },
};
