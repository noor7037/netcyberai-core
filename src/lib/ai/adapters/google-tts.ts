import { freeCheck } from './connection';
import { googleKeyLooksRight } from './gemini';
import { audioFromBase64 } from './voice-audio';
import { VOICE_TIMEOUT_MS, capabilities, type ConnectionTest, type VoiceAdapter, type VoiceResult } from './types';

// Google Cloud Text-to-Speech (C386: a server voice), over fetch: POST /v1/text:synthesize with an API key in the
// x-goog-api-key header (never in the address), mp3 out. It has Indian voices for both of the app's languages (en-IN and
// hi-IN), which OpenAI's single voice does not.
//
// Its own provider id, 'google_tts', not the Gemini or Vertex AI one: Cloud Text-to-Speech is a separate Google Cloud
// API, switched on per project, and a key is usually restricted to the APIs it may call (an AI Studio key to the Gemini
// API, an express-mode key to Vertex AI). Its terms are Google Cloud's service terms, not the generative AI terms the
// Gemini clearance was read against, so the founder reads and clears it on its own; its key, circuit and bill stay apart.
// No terms note yet: nobody has read Google Cloud's terms for a children's product (docs/family-app/AI_PROVIDERS.md).
//
// The model Control sets is the voice, without its language: "Neural2-A" becomes en-IN-Neural2-A for an English line
// and hi-IN-Neural2-A for a Hindi one, so one choice serves both languages; "default" lets Google pick the language's
// default voice. Control's model list comes from the voices both languages have (the key test, voices.list: free).
const URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const VOICES_URL = 'https://texttospeech.googleapis.com/v1/voices';
export const GOOGLE_LANGUAGE: Record<'en' | 'hi', string> = { en: 'en-IN', hi: 'hi-IN' };
const VOICE_SUFFIX = /^(default|[A-Z][A-Za-z0-9]{1,15}(-[A-Za-z0-9]{1,15}){1,3})$/;
export const googleVoiceLooksRight = (model: string) => VOICE_SUFFIX.test(model);

// The voices that exist in both en-IN and hi-IN, by their suffix ("Neural2-A"), and "default".
export function sharedVoices(body: unknown): string[] {
  const voices = (body as { voices?: { name?: unknown }[] })?.voices ?? [];
  const names = voices.map((v) => (typeof v?.name === 'string' ? v.name : ''));
  const of = (lang: string) => new Set(names.filter((n) => n.startsWith(`${lang}-`)).map((n) => n.slice(lang.length + 1)));
  const en = of(GOOGLE_LANGUAGE.en);
  const both = [...of(GOOGLE_LANGUAGE.hi)].filter((s) => en.has(s) && VOICE_SUFFIX.test(s));
  return ['default', ...both];
}

export const googleTtsAdapter: VoiceAdapter = {
  providerId: 'google_tts',
  capability: 'text_to_speech',
  termsNote: null,
  needsKey: true,
  capabilities: capabilities(['tts']),
  keyLooksRight: googleKeyLooksRight,
  modelLooksRight: googleVoiceLooksRight,
  async synthesize(request): Promise<VoiceResult> {
    if (!VOICE_SUFFIX.test(request.model)) return { ok: false, failure: 'http', status: 400 };
    const languageCode = GOOGLE_LANGUAGE[request.language];
    const body = {
      input: { text: request.text },
      voice: { languageCode, ...(request.model === 'default' ? {} : { name: `${languageCode}-${request.model}` }) },
      audioConfig: { audioEncoding: 'MP3' },
    };
    let res: Response;
    try {
      res = await fetch(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': request.apiKey },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(VOICE_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, failure: 'network' };
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, failure: 'http', status: res.status };
    }
    const answer = (await res.json().catch(() => null)) as { audioContent?: unknown } | null;
    const audio = audioFromBase64(answer?.audioContent);
    return audio ? { ok: true, audio, mediaType: 'audio/mpeg', characters: request.text.length } : { ok: false, failure: 'bad_stream' };
  },
  // voices.list: free, and answers only for a working key with the API switched on.
  testConnection(apiKey): Promise<ConnectionTest> {
    return freeCheck(VOICES_URL, { 'x-goog-api-key': apiKey }, sharedVoices);
  },
};
