import { streamChatCompletions } from './chat-completions';
import { SPEECH_TIMEOUT_MS, type AdapterResult, type SpeechAdapter, type SpeechResult, type TextAdapter } from './types';

// OpenAI's Chat Completions API, streamed over fetch (no SDK; the wire format is shared, ./chat-completions.ts).
const URL = 'https://api.openai.com/v1/chat/completions';

// Not for children (C230-U): OpenAI's Business Terms forbid letting anyone under 13 use the services and sending
// personal information of a child under 13, and the Family app serves children from Class 1. So no profile that
// carries a child's words may run on OpenAI, whatever Control says; it stays available for adult tools.
export const openaiAdapter: TextAdapter = {
  providerId: 'openai',
  capability: 'text',
  minorsEligible: false,
  needsKey: true,
  vision: true,
  keyLooksRight: (key) => /^sk-[\x21-\x7e]{20,300}$/.test(key),
  streamText(request, onDelta): Promise<AdapterResult> {
    return streamChatCompletions(URL, request.apiKey, request, onDelta, { maxTokensField: 'max_completion_tokens', jsonMode: true, includeUsage: true });
  },
};

// OpenAI's transcription API (M2-7, C281), over fetch (no SDK): one multipart request with the recording, the model
// Control chose and the language; the answer is { text } and, for the newer models, the token counts. The file goes
// with a fixed, neutral name: nothing in the request names the family or the child.
const TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const EXTENSION: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/wav': 'wav' };

// Not for children either (C230-U, as above): voice input from a child goes to a provider whose terms allow it.
export const openaiSpeechAdapter: SpeechAdapter = {
  providerId: 'openai',
  capability: 'speech_to_text',
  minorsEligible: false,
  needsKey: true,
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
