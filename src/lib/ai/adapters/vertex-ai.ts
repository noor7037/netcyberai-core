import { googleKeyLooksRight } from './gemini';
import { sseData } from './sse';
import { CALL_TIMEOUT_MS, JSON_ONLY, callTimeoutMs, capabilities, type AdapterResult, type ConnectionTest, type TextAdapter } from './types';

// Google Vertex AI (G1, C369), in express mode: an API key alone, on Google's global endpoint, with no project or
// region in the address. Vertex's OpenAI-compatible route (…/projects/<p>/locations/<r>/endpoints/openapi) takes only
// an OAuth access token, which lasts an hour and is made by signing a service account's JWT; a key that stops working
// every hour cannot be kept in Control, so this adapter uses express mode's own wire format instead
// (publishers/google/models/<model>:streamGenerateContent, read 2026-10-27 in Google's express mode reference). The key
// goes in the x-goog-api-key header, never in the address. Gemini models only: other publishers' models on Vertex need
// a service account.
//
// Its terms note is Gemini's (adults_only): docs/family-app/AI_PROVIDERS.md expects the same clause in Google Cloud's
// generative AI terms; not verified. The founder decides in Control, as for every provider.
const HOST = 'https://aiplatform.googleapis.com/v1/publishers/google/models';

// A Gemini model id as Vertex names it ("gemini-2.5-flash"): it becomes part of the address, so nothing else is let in.
// Control refuses any other id for this provider when a profile is saved.
const MODEL = /^[a-z0-9][a-z0-9.-]{1,79}$/;
export const vertexModelLooksRight = (model: string) => MODEL.test(model) && !model.includes('..');
// The model the key test counts a word with (countTokens: free, and proves the key).
const TEST_MODEL = 'gemini-2.5-flash';

// Express mode keys: a Google API key ("AIza…") or the newer bound key ("AQ.…").
const KEY = { test: googleKeyLooksRight };

type Part = { text?: string; inlineData?: { mimeType: string; data: string } };
type Chunk = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: unknown;
};
// Google's reasons for stopping that mean a decline, not an answer.
const REFUSALS = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY']);

export const vertexAiAdapter: TextAdapter = {
  providerId: 'vertex_ai',
  capability: 'text',
  termsNote: 'adults_only',
  needsKey: true,
  capabilities: capabilities(['text', 'vision', 'stream', 'json']),
  keyLooksRight: (key) => KEY.test(key),
  async streamText(request, onDelta): Promise<AdapterResult> {
    if (!vertexModelLooksRight(request.model)) return { ok: false, failure: 'http', status: 400 };
    const json = request.responseFormat === 'json';
    const contents = request.messages.map((m) => {
      const parts: Part[] = [...(m.images ?? []).map((i) => ({ inlineData: { mimeType: i.mediaType, data: i.base64 } })), { text: m.content }];
      return { role: m.role === 'assistant' ? 'model' : 'user', parts };
    });
    const body = {
      systemInstruction: { parts: [{ text: json ? `${request.system}\n\n${JSON_ONLY}` : request.system }] },
      contents,
      generationConfig: { maxOutputTokens: request.maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
    };
    let res: Response;
    try {
      res = await fetch(`${HOST}/${request.model}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': request.apiKey },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(callTimeoutMs(request, CALL_TIMEOUT_MS)),
      });
    } catch {
      return { ok: false, failure: 'network' };
    }
    if (!res.ok || !res.body) return { ok: false, failure: 'http', status: res.status };
    let text = '';
    let tokensIn = 0;
    let tokensOut = 0;
    let finish: string | undefined;
    try {
      for await (const data of sseData(res.body)) {
        let chunk: Chunk;
        try {
          chunk = JSON.parse(data);
        } catch {
          return { ok: false, failure: 'bad_stream' };
        }
        if (chunk.error) return { ok: false, failure: 'http', status: 500 };
        if (chunk.promptFeedback?.blockReason) return { ok: false, failure: 'refused' };
        const candidate = chunk.candidates?.[0];
        for (const part of candidate?.content?.parts ?? []) {
          if (part.thought || typeof part.text !== 'string' || !part.text) continue;
          text += part.text;
          onDelta(part.text);
        }
        if (chunk.usageMetadata) {
          tokensIn = chunk.usageMetadata.promptTokenCount ?? tokensIn;
          tokensOut = chunk.usageMetadata.candidatesTokenCount ?? tokensOut;
        }
        if (candidate?.finishReason) finish = candidate.finishReason;
      }
    } catch {
      if (!finish) return { ok: false, failure: 'network' };
    }
    if (finish && REFUSALS.has(finish)) return { ok: false, failure: 'refused' };
    if (!finish) return { ok: false, failure: 'cut_short' };
    // The platform's words for why it stopped, as the Chat Completions adapters give them (C318).
    const why = finish === 'STOP' ? 'stop' : finish === 'MAX_TOKENS' ? 'length' : finish.toLowerCase();
    if (!tokensIn && !tokensOut) {
      const sent = request.system.length + request.messages.reduce((n, m) => n + m.content.length, 0);
      return { ok: true, text, tokensIn: Math.ceil(sent / 4), tokensOut: Math.ceil(text.length / 4), finish: why };
    }
    return { ok: true, text, tokensIn, tokensOut, finish: why };
  },
  async testConnection(apiKey): Promise<ConnectionTest> {
    let res: Response;
    try {
      res = await fetch(`${HOST}/${TEST_MODEL}:countTokens`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Hello' }] }] }),
        redirect: 'error',
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, failure: 'network' };
    }
    await res.body?.cancel().catch(() => {});
    return res.ok ? { ok: true } : { ok: false, failure: 'http', status: res.status };
  },
};
