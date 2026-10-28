import { streamChatCompletions } from './chat-completions';
import { dataIds, freeCheck } from './connection';
import { readAudio } from './voice-audio';
import { SPEECH_TIMEOUT_MS, VOICE_TIMEOUT_MS, capabilities, type AdapterResult, type ConnectionTest, type SpeechAdapter, type SpeechResult, type TextAdapter, type VoiceAdapter, type VoiceResult } from './types';

// OpenAI's Chat Completions API, streamed over fetch (no SDK; the wire format is shared, ./chat-completions.ts).
const URL = 'https://api.openai.com/v1/chat/completions';

// Not for children (C230-U): OpenAI's Business Terms forbid letting anyone under 13 use the services and sending
// personal information of a child under 13, and the Family app serves children from Class 1. Control shows that note
// beside its switch (C368); whether a child's words may go to it is the founder's clearance there.
export const openaiAdapter: TextAdapter = {
  providerId: 'openai',
  capability: 'text',
  termsNote: 'no_under_13',
  needsKey: true,
  capabilities: capabilities(['text', 'vision', 'stream', 'json']),
  keyLooksRight: (key) => /^sk-[\x21-\x7e]{20,300}$/.test(key),
  streamText(request, onDelta): Promise<AdapterResult> {
    return streamChatCompletions(URL, request.apiKey, request, onDelta, { maxTokensField: 'max_completion_tokens', jsonMode: true, includeUsage: true });
  },
  // GET /v1/models: free, and answers only for a working key (G5); its ids fill Control's model picker (G6).
  testConnection(apiKey): Promise<ConnectionTest> {
    return freeCheck('https://api.openai.com/v1/models', { authorization: `Bearer ${apiKey}` }, dataIds);
  },
};

// OpenAI's transcription API (M2-7, C281), over fetch (no SDK): one multipart request with the recording, the model
// Control chose and the language; the answer is { text } and, for the newer models, the token counts. The file goes
// with a fixed, neutral name: nothing in the request names the family or the child.
const TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const EXTENSION: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/wav': 'wav' };

// The same terms and note as the text adapter above.
export const openaiSpeechAdapter: SpeechAdapter = {
  providerId: 'openai',
  capability: 'speech_to_text',
  termsNote: 'no_under_13',
  needsKey: true,
  capabilities: capabilities(['stt']),
  async transcribe(request): Promise<SpeechResult> {
    const form = new FormData();
    // A copy into a fresh ArrayBuffer: a Blob takes a plain buffer, never a view of a shared one.
    form.append('file', new Blob([new Uint8Array(request.audio)], { type: request.mediaType }), `audio.${EXTENSION[request.mediaType] ?? 'webm'}`);
    form.append('model', request.model);
    form.append('language', request.language);
    form.append('response_format', 'json');
    let res: Response;
    try {
      res = await fetch(TRANSCRIBE_URL, { method: 'POST', headers: { authorization: `Bearer ${request.apiKey}` }, body: form, signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS) });
    } catch {
      return { ok: false, failure: 'network' };
    }
    if (!res.ok) return { ok: false, failure: 'http', status: res.status };
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

// OpenAI's speech API (C386: a server voice), over fetch: POST /v1/audio/speech with the model Control chose, one fixed
// voice and mp3 out. The voice reads English and Hindi alike (the language is in the text); the newer gpt-4o models also
// take a line of instructions, the older tts-1 models do not, so it is sent only to them. The same key as the text
// adapter above (one OpenAI key in Control), the same terms note.
const VOICE_URL = 'https://api.openai.com/v1/audio/speech';
export const OPENAI_VOICE = 'nova';
const OPENAI_TTS_MODEL = /^[a-z0-9][a-z0-9.-]{1,60}$/;
const VOICE_INSTRUCTIONS: Record<'en' | 'hi', string> = {
  en: 'Read clearly and warmly, at a steady pace, for a school child in India, with an Indian English accent.',
  hi: 'Read clearly and warmly in Hindi, at a steady pace, for a school child in India.',
};

export const openaiVoiceAdapter: VoiceAdapter = {
  providerId: 'openai',
  capability: 'text_to_speech',
  termsNote: 'no_under_13',
  needsKey: true,
  capabilities: capabilities(['tts']),
  keyLooksRight: (key) => openaiAdapter.keyLooksRight(key),
  modelLooksRight: (model) => OPENAI_TTS_MODEL.test(model),
  async synthesize(request): Promise<VoiceResult> {
    if (!OPENAI_TTS_MODEL.test(request.model)) return { ok: false, failure: 'http', status: 400 };
    const body = {
      model: request.model,
      input: request.text,
      voice: OPENAI_VOICE,
      response_format: 'mp3',
      ...(request.model.startsWith('gpt-') ? { instructions: VOICE_INSTRUCTIONS[request.language] } : {}),
    };
    let res: Response;
    try {
      res = await fetch(VOICE_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${request.apiKey}`, 'content-type': 'application/json' },
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
    const audio = await readAudio(res);
    return audio ? { ok: true, audio, mediaType: 'audio/mpeg', characters: request.text.length } : { ok: false, failure: 'bad_stream' };
  },
  // The text adapter's free check: the same key.
  testConnection: (apiKey) => openaiAdapter.testConnection!(apiKey),
};
