import { sseData } from './sse';
import { CALL_TIMEOUT_MS, JSON_ONLY, WHOLE_ANSWER_TIMEOUT_MS, type AdapterRequest, type AdapterResult } from './types';

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
  // Where our instructions go (C320): a system message, or the start of the first user message. A request may ask for
  // one placement itself (the smoke test compares the two).
  instructions?: 'system' | 'first_user';
  // false: ask for the whole answer in one piece and hand it on at once (C322). Workers AI's live probe found Llama 4
  // Scout's streamed answer losing the quotation marks at each '":"' and '","' join, on both of its streamed routes,
  // while the same answer in one piece came whole. Streamed by default.
  stream?: boolean;
};

export async function streamChatCompletions(url: string, token: string, request: AdapterRequest, onDelta: (text: string) => void, opts: ChatCompletionsOptions): Promise<AdapterResult> {
  const json = request.responseFormat === 'json';
  const system = json ? `${request.system}\n\n${JSON_ONLY}` : request.system;
  const inUser = (request.instructionsAs ?? (opts.instructions === 'first_user' ? 'user' : 'system')) === 'user';
  const firstUser = request.messages.findIndex((m) => m.role === 'user');
  const messages = request.messages.map((m, i) => {
    const content = inUser && i === firstUser ? `${system}\n\n${m.content}` : m.content;
    return m.images?.length
      ? { role: m.role, content: [{ type: 'text', text: content }, ...m.images.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.base64}` } }))] }
      : { role: m.role, content };
  });
  const stream = opts.stream !== false;
  const body = {
    model: request.model,
    stream,
    ...(stream && opts.includeUsage ? { stream_options: { include_usage: true } } : {}),
    [opts.maxTokensField]: request.maxTokens,
    ...(opts.temperature === undefined ? {} : { temperature: opts.temperature }),
    messages: inUser && firstUser >= 0 ? messages : [{ role: 'system', content: system }, ...messages],
    ...(json && opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(stream ? CALL_TIMEOUT_MS : WHOLE_ANSWER_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, failure: 'network' };
  }
  if (!res.ok || !res.body) return { ok: false, failure: 'http', status: res.status };
  if (!stream) return wholeAnswer(res, request, onDelta);
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

// The answer in one piece (C322): { choices: [{ message: { content, refusal }, finish_reason }], usage }. Handed on to
// the caller in one delta, so a caller written for a stream reads it the same way.
async function wholeAnswer(res: Response, request: AdapterRequest, onDelta: (text: string) => void): Promise<AdapterResult> {
  let body: { choices?: { message?: { content?: unknown; refusal?: unknown }; finish_reason?: string | null }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } | null; error?: unknown };
  try {
    body = await res.json();
  } catch {
    return { ok: false, failure: 'bad_stream' };
  }
  if (body?.error) return { ok: false, failure: 'http', status: 500 };
  const choice = body?.choices?.[0];
  if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') return { ok: false, failure: 'refused' };
  const text = choice?.message?.content;
  if (typeof text !== 'string') return { ok: false, failure: 'bad_stream' };
  if (text) onDelta(text);
  const finish = choice?.finish_reason ?? undefined;
  const sent = request.system.length + request.messages.reduce((n, m) => n + m.content.length, 0);
  const tokensIn = body.usage?.prompt_tokens ?? Math.ceil(sent / 4);
  const tokensOut = body.usage?.completion_tokens ?? Math.ceil(text.length / 4);
  return { ok: true, text, tokensIn, tokensOut, ...(finish ? { finish } : {}) };
}
