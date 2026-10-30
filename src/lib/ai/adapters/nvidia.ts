import { streamChatCompletions } from './chat-completions';
import { dataIds, freeCheck } from './connection';
import { capabilities, type AdapterResult, type ConnectionTest, type TextAdapter } from './types';

// NVIDIA NIM (W8-AI): NVIDIA's hosted models behind one OpenAI Chat Completions address, so the request goes out on the
// shared wire format (./chat-completions.ts) with the key as a Bearer token. The address is fixed here and the founder
// saves only the key. NIM's vision models take OpenAI `image_url` content parts, which the shared helper already sends
// for a request's photos. Which models the account can use is read live from GET /models (Control's picker, G6): no
// model name is written in code. Nothing is known of NVIDIA's terms for children, so no note: the founder reads them
// before clearing it for children's words, as for every provider.
export const NVIDIA = 'nvidia';
export const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

export const nvidiaAdapter: TextAdapter = {
  providerId: NVIDIA,
  capability: 'text',
  termsNote: null,
  needsKey: true,
  needsBaseUrl: false,
  capabilities: capabilities(['text', 'vision', 'stream']),
  // NVIDIA's API keys start "nvapi-".
  keyLooksRight: (key) => /^nvapi-[A-Za-z0-9_-]{20,200}$/.test(key),
  streamText(request, onDelta): Promise<AdapterResult> {
    // JSON mode is not declared (not every NIM model honours response_format); JSON is asked for in the instructions.
    return streamChatCompletions(`${NVIDIA_BASE_URL}/chat/completions`, request.apiKey, request, onDelta, { maxTokensField: 'max_tokens', jsonMode: false, includeUsage: true });
  },
  // GET /v1/models: answers only for a working key and costs nothing; its ids fill Control's model picker.
  testConnection(apiKey): Promise<ConnectionTest> {
    return freeCheck(`${NVIDIA_BASE_URL}/models`, { authorization: `Bearer ${apiKey}` }, dataIds);
  },
};
