import { sseData } from './sse';
import { CALL_TIMEOUT_MS, JSON_ONLY, callTimeoutMs, type AdapterResult, type TextAdapter } from './types';

// Anthropic's Messages API, streamed over fetch (no SDK): POST /v1/messages with stream: true. Text arrives as
// content_block_delta events (text_delta); the input token count comes with message_start, the output count with
// message_delta. A stop_reason of "refusal" is a decline: the platform tries the next provider in the chain.
const URL = 'https://api.anthropic.com/v1/messages';

export const anthropicAdapter: TextAdapter = {
  providerId: 'anthropic',
  capability: 'text',
  termsNote: 'minors_with_safeguards',
  needsKey: true,
  vision: true,
  keyLooksRight: (key) => /^sk-ant-[\x21-\x7e]{20,300}$/.test(key),
  async streamText(request, onDelta): Promise<AdapterResult> {
    const body = {
      model: request.model,
      max_tokens: request.maxTokens,
      stream: true,
      system: request.responseFormat === 'json' ? `${request.system}\n\n${JSON_ONLY}` : request.system,
      messages: request.messages.map((m) =>
        m.images?.length
          ? { role: m.role, content: [...m.images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.base64 } })), { type: 'text', text: m.content }] }
          : { role: m.role, content: m.content }
      ),
    };
    let res: Response;
    try {
      res = await fetch(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': request.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(callTimeoutMs(request, CALL_TIMEOUT_MS)),
      });
    } catch {
      return { ok: false, failure: 'network' };
    }
    if (!res.ok || !res.body) return { ok: false, failure: 'http', status: res.status };
    let text = '';
    let tokensIn = 0;
    let tokensOut = 0;
    let stop: string | null = null;
    let finished = false;
    try {
      for await (const data of sseData(res.body)) {
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(data);
        } catch {
          return { ok: false, failure: 'bad_stream' };
        }
        const type = event.type;
        if (type === 'error') return { ok: false, failure: 'http', status: 529 };
        if (type === 'message_start') {
          const usage = (event.message as { usage?: Record<string, number> } | undefined)?.usage ?? {};
          tokensIn = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
          tokensOut = usage.output_tokens ?? 0;
        } else if (type === 'content_block_delta') {
          const delta = event.delta as { type?: string; text?: string } | undefined;
          if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
            text += delta.text;
            onDelta(delta.text);
          }
        } else if (type === 'message_delta') {
          const delta = event.delta as { stop_reason?: string } | undefined;
          if (delta?.stop_reason) stop = delta.stop_reason;
          const usage = event.usage as { output_tokens?: number } | undefined;
          if (typeof usage?.output_tokens === 'number') tokensOut = usage.output_tokens;
        } else if (type === 'message_stop') {
          finished = true;
        }
      }
    } catch {
      return { ok: false, failure: 'network' };
    }
    if (stop === 'refusal') return { ok: false, failure: 'refused' };
    if (!finished) return { ok: false, failure: 'cut_short' };
    return { ok: true, text, tokensIn, tokensOut };
  },
};
