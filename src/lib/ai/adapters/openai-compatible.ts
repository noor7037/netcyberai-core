import { streamChatCompletions } from './chat-completions';
import { dataIds, modelIds } from './connection';
import { guardedFetch } from './endpoint-guard';
import { CALL_TIMEOUT_MS, capabilities, type AdapterResult, type ConnectionTest, type TextAdapter } from './types';

// Any service that speaks OpenAI's Chat Completions (G1, C369), at the base URL the founder sets in Control → AI (for
// example "https://api.<vendor>/v1"): the request goes to <base>/chat/completions with the key as a Bearer token. The
// address is checked by the server when it is saved and again at every call (./endpoint-guard.ts: https only, public
// addresses only, no redirect), and the connection goes to exactly the address checked.
//
// What the service behind it can do is not known to the code, so this adapter declares only what every such service
// does: text, streamed. Photos and the vendor's JSON mode are not declared (a feature that needs them cannot be put on
// it); JSON is asked for in the instructions. Nothing is known of its terms either, so no note: the founder reads them
// before clearing it for children's words, as for every provider.
export const OPENAI_COMPATIBLE = 'openai_compatible';

export const openaiCompatibleAdapter: TextAdapter = {
  providerId: OPENAI_COMPATIBLE,
  capability: 'text',
  termsNote: null,
  needsKey: true,
  needsBaseUrl: true,
  capabilities: capabilities(['text', 'stream']),
  // A Bearer token of printable characters; services shape their keys differently, so only the length is held to.
  keyLooksRight: (key) => /^[\x21-\x7e]{8,400}$/.test(key),
  async streamText(request, onDelta): Promise<AdapterResult> {
    const base = request.baseUrl;
    if (!base) return { ok: false, failure: 'endpoint' };
    return streamChatCompletions(`${base}/chat/completions`, request.apiKey, request, onDelta, {
      maxTokensField: 'max_tokens',
      jsonMode: false,
      includeUsage: false,
      send: async (init) => {
        const got = await guardedFetch(base, '/chat/completions', { method: 'POST', ...init });
        return got.ok ? got.res : null;
      },
    });
  },
  // GET <base>/models: lists the service's models when the key is right, and costs nothing.
  async testConnection(apiKey, baseUrl): Promise<ConnectionTest> {
    if (!baseUrl) return { ok: false, failure: 'endpoint' };
    let got: Awaited<ReturnType<typeof guardedFetch>>;
    try {
      got = await guardedFetch(baseUrl, '/models', { method: 'GET', headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
    } catch {
      return { ok: false, failure: 'network' };
    }
    if (!got.ok) return { ok: false, failure: 'endpoint' };
    if (!got.res.ok) {
      await got.res.body?.cancel().catch(() => {});
      return { ok: false, failure: 'http', status: got.res.status };
    }
    // Its ids fill Control's model picker (G6, C379); an answer that cannot be read still means the key works.
    const body = await got.res.json().catch(() => null);
    return body ? { ok: true, models: modelIds(dataIds(body)) } : { ok: true };
  },
};
