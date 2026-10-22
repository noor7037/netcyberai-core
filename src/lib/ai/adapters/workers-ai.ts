import { streamChatCompletions } from './chat-completions';
import { workersAccountLooksRight, workersTokenLooksRight } from './workers-key';
import { CALL_TIMEOUT_MS, MODERATION_TIMEOUT_MS, SPEECH_TIMEOUT_MS, type AdapterResult, type ModerationAdapter, type ModerationResult, type SpeechAdapter, type SpeechResult, type TextAdapter } from './types';

// Cloudflare Workers AI (C230-U): open-weight models (Llama, Gemma, Mistral, Whisper) run by Cloudflare, chosen for the
// children's paths because nothing in Cloudflare's terms or the models' licences bars a product used by children,
// Cloudflare does not use what is sent to train models or improve services (its Workers AI data-usage page), and the
// free plan has a daily allowance that ends in an error, never a bill. Control's clearance is needed as well.
//
// The key Control keeps is "<account id>:<API token>": the 32-hex account id names the account in the URL, and the
// token (Workers AI permission only) is the secret. Both are opened by the platform inside the call and kept nowhere.
export { cleanWorkersAccount, cleanWorkersToken, workersAccountLooksRight, workersTokenLooksRight } from './workers-key';

export function splitWorkersKey(key: string): { account: string; token: string } | null {
  const i = key.indexOf(':');
  if (i < 0) return null;
  const account = key.slice(0, i);
  const token = key.slice(i + 1);
  return workersAccountLooksRight(account) && workersTokenLooksRight(token) ? { account, token } : null;
}

const base = (account: string) => `https://api.cloudflare.com/client/v4/accounts/${account}/ai`;

// Text and photos through Cloudflare's OpenAI-compatible route (/ai/v1/chat/completions), each answer in one piece, not
// streamed: the live probe (C321, C322) found Llama 4 Scout's streamed JSON losing its inner quotation marks on both
// streamed routes, and the same answer whole when sent in one piece. A child therefore sees an explanation all at once,
// a few seconds after asking, instead of word by word. It takes max_tokens; JSON is asked for in the instructions
// (JSON_ONLY) rather than with response_format, and usage is read when sent.
// Photos go as image_url data URLs to a model Control chose for vision (for example Llama 4 Scout); a model that cannot
// take them answers with an error, and the platform hands the call to the next provider in the chain.
// Open models keep to a structured answer better when they choose their words less freely; 0.3 still lets an
// explanation read naturally (C316). Cloudflare's default is higher.
const WORKERS_TEMPERATURE = 0.3;
export const workersAiAdapter: TextAdapter = {
  providerId: 'workers-ai',
  capability: 'text',
  minorsEligible: true,
  needsKey: true,
  vision: true,
  keyLooksRight: (key) => splitWorkersKey(key) !== null,
  async streamText(request, onDelta): Promise<AdapterResult> {
    const k = splitWorkersKey(request.apiKey);
    if (!k) return { ok: false, failure: 'http', status: 401 };
    return streamChatCompletions(`${base(k.account)}/v1/chat/completions`, k.token, request, onDelta, { maxTokensField: 'max_tokens', jsonMode: false, includeUsage: false, temperature: WORKERS_TEMPERATURE, instructions: 'first_user', stream: false });
  },
};

// A Workers AI model id, for example @cf/openai/whisper-large-v3-turbo or @hf/...: two path segments of letters, digits,
// dots, dashes and underscores, never a "." or ".." segment. The speech model becomes part of the URL, and Control
// refuses any other id for this provider when a profile is saved (control.ts), so a typo shows there, not as an outage.
const MODEL = /^@(cf|hf)\/(?!\.{1,2}\/)[A-Za-z0-9._-]{1,40}\/(?!\.{1,2}$)[A-Za-z0-9._-]{1,80}$/;
export const workersModelLooksRight = (model: string) => MODEL.test(model);

// Speech to text (voice input, M2-7) with Whisper on Workers AI: one JSON request with the recording as base64, the
// task and the language; the answer is { success, result: { text } }. Nothing names the family or the child.
export const workersAiSpeechAdapter: SpeechAdapter = {
  providerId: 'workers-ai',
  capability: 'speech_to_text',
  minorsEligible: true,
  needsKey: true,
  async transcribe(request): Promise<SpeechResult> {
    const k = splitWorkersKey(request.apiKey);
    if (!k || !workersModelLooksRight(request.model)) return { ok: false, failure: 'http', status: 400 };
    let res: Response;
    try {
      res = await fetch(`${base(k.account)}/run/${request.model}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${k.token}` },
        body: JSON.stringify({ audio: Buffer.from(request.audio).toString('base64'), task: 'transcribe', language: request.language }),
        signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, failure: 'network' };
    }
    if (!res.ok) return { ok: false, failure: 'http', status: res.status };
    let body: { success?: unknown; result?: { text?: unknown } | null };
    try {
      body = await res.json();
    } catch {
      return { ok: false, failure: 'bad_stream' };
    }
    if (body?.success === false || typeof body?.result?.text !== 'string') return { ok: false, failure: 'bad_stream' };
    return { ok: true, text: body.result.text.trim(), tokensIn: 0, tokensOut: 0 };
  },
};

// Moderation (W2, C314) with Llama Guard on Workers AI (for example @cf/meta/llama-guard-3-8b): the exchange goes as
// `messages` (the child's words as the user's turn, an answer as the assistant's), and the model says whether the last
// turn is safe and, if not, which of its categories it breaks. Cloudflare's page does not publish the answer's shape,
// so both forms are read: the model's own text ("safe", or "unsafe" then the codes, for example "S1,S10"), and an
// object { safe, categories }. Anything else is an unreadable answer, a failure: the caller then shows nothing.
const GUARD_MAX_CHARS = 6000;
export function guardVerdict(response: unknown): { safe: boolean; categories: string[] } | null {
  if (response && typeof response === 'object' && typeof (response as { safe?: unknown }).safe === 'boolean') {
    const cats = (response as { categories?: unknown }).categories;
    return { safe: (response as { safe: boolean }).safe, categories: Array.isArray(cats) ? cats.filter((c): c is string => typeof c === 'string') : [] };
  }
  if (typeof response !== 'string') return null;
  const text = response.trim();
  if (/^safe\b/i.test(text)) return { safe: true, categories: [] };
  if (/^unsafe\b/i.test(text)) return { safe: false, categories: text.match(/S\d{1,2}/g) ?? [] };
  return null;
}

export const workersAiModerationAdapter: ModerationAdapter = {
  providerId: 'workers-ai',
  capability: 'moderation',
  minorsEligible: true,
  needsKey: true,
  async moderate(request): Promise<ModerationResult> {
    const k = splitWorkersKey(request.apiKey);
    if (!k || !workersModelLooksRight(request.model)) return { ok: false, failure: 'http', status: 400 };
    const messages = [{ role: 'user', content: request.user.slice(0, GUARD_MAX_CHARS) }, ...(request.assistant === undefined ? [] : [{ role: 'assistant', content: request.assistant.slice(0, GUARD_MAX_CHARS) }])];
    let res: Response;
    try {
      res = await fetch(`${base(k.account)}/run/${request.model}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${k.token}` },
        body: JSON.stringify({ messages, max_tokens: 32, temperature: 0 }),
        signal: AbortSignal.timeout(MODERATION_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, failure: 'network' };
    }
    if (!res.ok) return { ok: false, failure: 'http', status: res.status };
    let body: { success?: unknown; result?: { response?: unknown; usage?: { prompt_tokens?: number; completion_tokens?: number } } | null };
    try {
      body = await res.json();
    } catch {
      return { ok: false, failure: 'bad_stream' };
    }
    const verdict = body?.success === false ? null : guardVerdict(body?.result?.response);
    if (!verdict) return { ok: false, failure: 'bad_stream' };
    const sent = messages.reduce((n, m) => n + m.content.length, 0);
    const form = typeof body.result?.response === 'string' ? 'text' : 'object';
    return { ok: true, ...verdict, tokensIn: body.result?.usage?.prompt_tokens ?? Math.ceil(sent / 4), tokensOut: body.result?.usage?.completion_tokens ?? 2, form };
  },
};

// ---- the transport probe (C321), for the smoke test only ---------------------------------------------------------------

// The live smoke test found Llama 4 Scout's JSON arriving without its inner quotation marks on the streamed
// OpenAI-compatible route ({"type:answer,word:metal"} for {"type":"answer","word":"metal"}), whichever way the
// instructions were placed. The probe asks the same made-up question four ways and returns the start of each answer,
// with the first raw bytes of the streamed one, so the transport the quotes survive on can be chosen on evidence.
export type WorkersTransport = 'compat_stream' | 'compat_once' | 'native_once' | 'native_stream';
export type WorkersProbe = { transport: WorkersTransport; ok: boolean; status?: number; start?: string; raw?: string };

const PROBE_CHARS = 200;
const squash = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, PROBE_CHARS);

export async function probeWorkersTransports(apiKey: string, model: string, instructions: string, question: string): Promise<WorkersProbe[]> {
  const k = splitWorkersKey(apiKey);
  if (!k || !workersModelLooksRight(model)) return [];
  const messages = [{ role: 'user', content: `${instructions}\n\n${question}` }];
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${k.token}` };
  const call = async (url: string, body: Record<string, unknown>) => {
    try {
      return await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
    } catch {
      return null;
    }
  };
  const compat = `${base(k.account)}/v1/chat/completions`;
  const native = `${base(k.account)}/run/${model}`;
  const common = { max_tokens: 120, temperature: 0.3 };
  const out: WorkersProbe[] = [];

  // 1. Streamed, OpenAI-compatible (today's route): the content pieces joined, and the raw stream's first bytes.
  {
    const res = await call(compat, { model, stream: true, messages, ...common });
    if (!res?.ok || !res.body) out.push({ transport: 'compat_stream', ok: false, status: res?.status });
    else {
      const raw = await res.text();
      let text = '';
      for (const block of raw.split(/\r?\n\r?\n/)) {
        const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
        if (!data || data === '[DONE]') continue;
        try {
          text += (JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content ?? '';
        } catch {
          // a line that is not JSON: left out of the text, kept in the raw bytes
        }
      }
      out.push({ transport: 'compat_stream', ok: true, start: squash(text), raw: raw.slice(0, 400) });
    }
  }
  // 2. In one piece, OpenAI-compatible.
  {
    const res = await call(compat, { model, stream: false, messages, ...common });
    const body = res?.ok ? ((await res.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null) : null;
    const text = body?.choices?.[0]?.message?.content;
    out.push(typeof text === 'string' ? { transport: 'compat_once', ok: true, start: squash(text) } : { transport: 'compat_once', ok: false, status: res?.status });
  }
  // 3. In one piece, Workers AI's own route.
  {
    const res = await call(native, { messages, ...common });
    const body = res?.ok ? ((await res.json().catch(() => null)) as { result?: { response?: unknown } } | null) : null;
    const r = body?.result?.response;
    const text = typeof r === 'string' ? r : r && typeof r === 'object' ? JSON.stringify(r) : null;
    out.push(text !== null ? { transport: 'native_once', ok: true, start: squash(text) } : { transport: 'native_once', ok: false, status: res?.status });
  }
  // 4. Streamed, Workers AI's own route: events carry { response: "<piece>" }.
  {
    const res = await call(native, { messages, stream: true, ...common });
    if (!res?.ok || !res.body) out.push({ transport: 'native_stream', ok: false, status: res?.status });
    else {
      const raw = await res.text();
      let text = '';
      for (const block of raw.split(/\r?\n\r?\n/)) {
        const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
        if (!data || data === '[DONE]') continue;
        try {
          const piece = (JSON.parse(data) as { response?: unknown }).response;
          if (typeof piece === 'string') text += piece;
        } catch {
          // as above
        }
      }
      out.push({ transport: 'native_stream', ok: true, start: squash(text), raw: raw.slice(0, 400) });
    }
  }
  return out;
}
