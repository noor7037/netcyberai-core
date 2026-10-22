import { sseData } from './sse';
import { CALL_TIMEOUT_MS, JSON_ONLY, type AdapterResult, type SpeechAdapter, type SpeechResult, type TextAdapter } from './types';

// OpenAI's Chat Completions API, streamed over fetch (no SDK). Text arrives as choices[0].delta.content; with
// stream_options.include_usage the last chunk carries the token counts; the stream ends with `data: [DONE]`.
const URL = 'https://api.openai.com/v1/chat/completions';

export const openaiAdapter: TextAdapter = {
  providerId: 'openai',
  capability: 'text',
  // As for the other adapter: the code's side of the minors check. Control's clearance is needed as well.
  minorsEligible: true,
  needsKey: true,
  vision: true,
  keyLooksRight: (key) => /^sk-[\x21-\x7e]{20,300}$/.test(key),
  async streamText(request, onDelta): Promise<AdapterResult> {
    const json = request.responseFormat === 'json';
    const body = {
      model: request.model,
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: request.maxTokens,
      messages: [{ role: 'system', content: json ? `${request.system}\n\n${JSON_ONLY}` : request.system }, ...request.messages.map((m) =>
          m.images?.length
            ? { role: m.role, content: [{ type: 'text', text: m.content }, ...m.images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mediaType};base64,${i.base64}` } }))] }
            : { role: m.role, content: m.content }
        ),
      ],
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    };
    let res: Response;
    try {
      res = await fetch(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${request.apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, failure: 'network' };
    }
    if (!res.ok || !res.body) return { ok: false, failure: 'http', status: res.status };
    let text = '';
    let tokensIn = 0;
    let tokensOut = 0;
    let finished = false;
    let refused = false;
    try {
      for await (const data of sseData(res.body)) {
        if (data.trim() === '[DONE]') {
          finished = true;
          break;
        }
        let chunk: { choices?: { delta?: { content?: string | null; refusal?: string | null }; finish_reason?: string | null }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } | null; error?: unknown };
        try {
          chunk = JSON.parse(data);
        } catch {
          return { ok: false, failure: 'bad_stream' };
        }
        if (chunk.error) return { ok: false, failure: 'http', status: 500 };
        const choice = chunk.choices?.[0];
        if (choice?.delta?.refusal) refused = true;
        const piece = choice?.delta?.content;
        if (typeof piece === 'string' && piece) {
          text += piece;
          onDelta(piece);
        }
        if (choice?.finish_reason === 'content_filter') refused = true;
        if (chunk.usage) {
          tokensIn = chunk.usage.prompt_tokens ?? tokensIn;
          tokensOut = chunk.usage.completion_tokens ?? tokensOut;
        }
      }
    } catch {
      return { ok: false, failure: 'network' };
    }
    if (refused) return { ok: false, failure: 'refused' };
    if (!finished) return { ok: false, failure: 'cut_short' };
    return { ok: true, text, tokensIn, tokensOut };
  },
};

// OpenAI's transcription API (M2-7, C281), over fetch (no SDK): one multipart request with the recording, the model
// Control chose and the language; the answer is { text } and, for the newer models, the token counts. The file goes
// with a fixed, neutral name: nothing in the request names the family or the child.
const TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const EXTENSION: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/wav': 'wav' };

export const openaiSpeechAdapter: SpeechAdapter = {
  providerId: 'openai',
  capability: 'speech_to_text',
  minorsEligible: true,
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
      res = await fetch(TRANSCRIBE_URL, { method: 'POST', headers: { authorization: `Bearer ${request.apiKey}` }, body: form, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
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
