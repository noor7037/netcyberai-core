import { sseData } from './sse';
import { CALL_TIMEOUT_MS, JSON_ONLY, type AdapterRequest, type AdapterResult } from './types';

// The Chat Completions wire format, streamed over fetch (no SDK), shared by every vendor that speaks it: OpenAI itself,
// Cloudflare Workers AI's OpenAI-compatible route and Gemini's (C230-U). Text arrives as choices[0].delta.content; the
// token counts come in a chunk's `usage` when the vendor sends one, and are estimated from the text when it sends none
// (four characters a token), so the limits summed from them (a school's monthly Copilot tokens) still bite. The stream
// ends with `data: [DONE]` or, for a vendor that does not send it, with a `stop` finish. A vendor differs only in what
// the options below name.
export type ChatCompletionsOptions = {
  // OpenAI's own name for the limit is max_completion_tokens; the compatible routes take max_tokens.
  maxTokensField: 'max_completion_tokens' | 'max_tokens';
  // response_format json_object, only where the vendor honours it; elsewhere the system prompt's JSON_ONLY carries it.
  jsonMode: boolean;
  // stream_options.include_usage, only where the vendor accepts it (an unknown option can be refused outright).
  includeUsage: boolean;
  // The sampling temperature, only where the vendor's own default suits our structured answers badly (C316).
  temperature?: number;
};

export async function streamChatCompletions(url: string, token: string, request: AdapterRequest, onDelta: (text: string) => void, opts: ChatCompletionsOptions): Promise<AdapterResult> {
  const json = request.responseFormat === 'json';
  const body = {
    model: request.model,
    stream: true,
    ...(opts.includeUsage ? { stream_options: { include_usage: true } } : {}),
    [opts.maxTokensField]: request.maxTokens,
    ...(opts.temperature === undefined ? {} : { temperature: opts.temperature }),
    messages: [
      { role: 'system', content: json ? `${request.system}\n\n${JSON_ONLY}` : request.system },
      ...request.messages.map((m) =>
        m.images?.length
          ? { role: m.role, content: [{ type: 'text', text: m.content }, ...m.images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mediaType};base64,${i.base64}` } }))] }
          : { role: m.role, content: m.content }
      ),
    ],
    ...(json && opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
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
  let finish: string | undefined;
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
      if (choice?.finish_reason) finish = choice.finish_reason;
      if (choice?.finish_reason === 'content_filter') refused = true;
      if (chunk.usage) {
        tokensIn = chunk.usage.prompt_tokens ?? tokensIn;
        tokensOut = chunk.usage.completion_tokens ?? tokensOut;
      }
      if (choice?.finish_reason === 'stop') {
        finished = true;
        // With no usage chunk to wait for, the answer is complete here: a vendor that keeps the connection open after
        // its stop must not turn a finished answer into a timeout.
        if (!opts.includeUsage) break;
      }
    }
  } catch {
    // A connection lost after the stop loses nothing the child has not already seen.
    if (!finished) return { ok: false, failure: 'network' };
  }
  if (refused) return { ok: false, failure: 'refused' };
  if (!finished) return { ok: false, failure: 'cut_short' };
  if (!tokensIn && !tokensOut) {
    const sent = request.system.length + request.messages.reduce((n, m) => n + m.content.length, 0);
    return { ok: true, text, tokensIn: Math.ceil(sent / 4), tokensOut: Math.ceil(text.length / 4), ...(finish ? { finish } : {}) };
  }
  return { ok: true, text, tokensIn, tokensOut, ...(finish ? { finish } : {}) };
}
