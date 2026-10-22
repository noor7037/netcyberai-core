import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anthropicAdapter } from '@/lib/ai/adapters/anthropic';
import { geminiAdapter } from '@/lib/ai/adapters/gemini';
import { openaiAdapter, openaiSpeechAdapter } from '@/lib/ai/adapters/openai';
import { splitWorkersKey, workersAiAdapter, workersAiSpeechAdapter, workersModelLooksRight } from '@/lib/ai/adapters/workers-ai';
import { adapterFor, speechAdapterFor } from '@/lib/ai/adapters';
import { JSON_ONLY, type AdapterRequest } from '@/lib/ai/adapters/types';
import { capableAdapter } from '@/lib/ai/platform';
import { httpError, openaiOk } from './streams';

// C230-U: the providers added after reading each vendor's terms for a product used by children. Workers AI (open-weight
// models, Cloudflare) may carry a child's words; Gemini (18+ only) and OpenAI (no one under 13) may not. Vendors are
// replaced at fetch, so what each adapter sends is captured byte for byte. Made-up keys and text only.

const ACCOUNT = 'a'.repeat(32);
const TOKEN = `cfat_${'T'.repeat(36)}`;
const WORKERS_KEY = `${ACCOUNT}:${TOKEN}`;
const GEMINI_KEY = `AIza${'G'.repeat(35)}`;

type Call = { url: string; body: string; headers: Record<string, string> };
let calls: Call[] = [];
let reply: () => Response = () => openaiOk(['ok']);
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: String(init.body), headers: init.headers as Record<string, string> });
      return reply();
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  reply = () => openaiOk(['ok']);
});

const request = (over: Partial<AdapterRequest> = {}): AdapterRequest => ({ apiKey: WORKERS_KEY, model: '@cf/meta/llama-4-scout-17b-16e-instruct', system: 'Explain for a Class 6 student.', messages: [{ role: 'user', content: 'Why do magnets attract iron?' }], maxTokens: 900, ...over });
const sse = (lines: unknown[]) => new Response(lines.map((d) => `data: ${typeof d === 'string' ? d : JSON.stringify(d)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });

describe('who may carry a child’s words (the code’s half of the minors check)', () => {
  it('Workers AI and Anthropic may; OpenAI (under 13 forbidden) and Gemini (18+ only) may not', () => {
    expect([workersAiAdapter, workersAiSpeechAdapter, anthropicAdapter].map((a) => a.minorsEligible)).toEqual([true, true, true]);
    expect([openaiAdapter, openaiSpeechAdapter, geminiAdapter].map((a) => a.minorsEligible)).toEqual([false, false, false]);
  });

  it('the platform finds Workers AI by id, with the right capability per profile; Gemini is not registered yet', () => {
    expect(adapterFor('workers-ai')).toBe(workersAiAdapter);
    expect(speechAdapterFor('workers-ai')).toBe(workersAiSpeechAdapter);
    expect(capableAdapter('family.voice_input', 'workers-ai')?.capability).toBe('speech_to_text');
    expect(capableAdapter('family.resolver', 'workers-ai')?.capability).toBe('text');
    expect(capableAdapter('copilot.draft', 'workers-ai')?.capability).toBe('text');
    // Parked until Google answers (AI_PROVIDERS.md): no profile can choose it, adult or child.
    expect([adapterFor('gemini'), speechAdapterFor('gemini'), capableAdapter('copilot.draft', 'gemini')]).toEqual([null, null, null]);
  });
});

describe('Workers AI model ids', () => {
  it('are "@cf/<vendor>/<model>" or "@hf/...", never a "." or ".." segment that would move the URL', () => {
    for (const ok of ['@cf/openai/whisper-large-v3-turbo', '@cf/meta/llama-4-scout-17b-16e-instruct', '@hf/thebloke/model_v1.5']) expect(workersModelLooksRight(ok), ok).toBe(true);
    for (const bad of ['@cf/openai/..', '@cf/../x', '@cf/./x', '@cf/openai/.', 'whisper-1', 'cf/openai/whisper', '@cf/openai/whisper?x=1', '@cf/a/b/c', '@xx/a/b']) expect(workersModelLooksRight(bad), bad).toBe(false);
  });
});

describe('Workers AI keys', () => {
  it('are "<32-hex account id>:<API token>", and nothing else', () => {
    expect(splitWorkersKey(WORKERS_KEY)).toEqual({ account: ACCOUNT, token: TOKEN });
    expect(workersAiAdapter.keyLooksRight(WORKERS_KEY)).toBe(true);
    for (const bad of [TOKEN, `${ACCOUNT}:`, `${'A'.repeat(32)}:${TOKEN}`, `${ACCOUNT}:short`, `${ACCOUNT}/x:${TOKEN}`, `${ACCOUNT}:${TOKEN} `]) expect(workersAiAdapter.keyLooksRight(bad), bad).toBe(false);
  });

  it('a key that does not split is refused before any call', async () => {
    expect(await workersAiAdapter.streamText(request({ apiKey: 'not-a-key' }), () => undefined)).toEqual({ ok: false, failure: 'http', status: 401 });
    expect(calls).toHaveLength(0);
  });
});

describe('Workers AI text, through Cloudflare’s OpenAI-compatible route', () => {
  it('posts to the account’s chat route with the token alone, max_tokens and no options Cloudflare may refuse', async () => {
    reply = () => openaiOk(['Magnets ', 'pull iron.'], 21, 5);
    const pieces: string[] = [];
    // The answer ends at the stop (no usage chunk is asked for), so the counts are estimated: 58 characters sent, 18 back.
    expect(await workersAiAdapter.streamText(request(), (p) => pieces.push(p))).toEqual({ ok: true, text: 'Magnets pull iron.', tokensIn: 15, tokensOut: 5 });
    expect(pieces).toEqual(['Magnets ', 'pull iron.']);
    expect(calls[0].url).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/v1/chat/completions`);
    expect(calls[0].headers.authorization).toBe(`Bearer ${TOKEN}`);
    const body = JSON.parse(calls[0].body);
    expect(body).toEqual({
      model: '@cf/meta/llama-4-scout-17b-16e-instruct',
      stream: true,
      max_tokens: 900,
      messages: [
        { role: 'system', content: 'Explain for a Class 6 student.' },
        { role: 'user', content: 'Why do magnets attract iron?' },
      ],
    });
    expect(calls[0].body).not.toContain(TOKEN);
  });

  it('asks for JSON in the system prompt, not with response_format', async () => {
    await workersAiAdapter.streamText(request({ responseFormat: 'json' }), () => undefined);
    const body = JSON.parse(calls[0].body);
    expect(body.messages[0].content).toBe(`Explain for a Class 6 student.\n\n${JSON_ONLY}`);
    expect(body.response_format).toBeUndefined();
  });

  it('sends a photo as an image_url data URL, read inside the call', async () => {
    await workersAiAdapter.streamText(request({ messages: [{ role: 'user', content: 'Explain this page.', images: [{ mediaType: 'image/jpeg', base64: 'QUJD' }] }] }), () => undefined);
    expect(JSON.parse(calls[0].body).messages[1]).toEqual({ role: 'user', content: [{ type: 'text', text: 'Explain this page.' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } }] });
  });

  it('a stream that ends with a stop but no [DONE] is complete; one that just stops is cut short', async () => {
    reply = () => sse([{ choices: [{ delta: { content: 'Iron.' }, finish_reason: null }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }]);
    expect(await workersAiAdapter.streamText(request(), () => undefined)).toEqual({ ok: true, text: 'Iron.', tokensIn: 15, tokensOut: 2 });
    reply = () => sse([{ choices: [{ delta: { content: 'Iro' }, finish_reason: null }] }]);
    expect(await workersAiAdapter.streamText(request(), () => undefined)).toEqual({ ok: false, failure: 'cut_short' });
  });

  it('after its stop, a connection held open or dropped does not turn the answer into a failure', async () => {
    const enc = new TextEncoder();
    reply = () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Done.' }, finish_reason: 'stop' }] })}\n\n`));
            // Never closed: the vendor keeps the connection open.
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      );
    expect(await workersAiAdapter.streamText(request(), () => undefined)).toMatchObject({ ok: true, text: 'Done.' });
    reply = () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Done.' }, finish_reason: 'stop' }] })}\n\n`));
            // Reset a moment later (an immediate error would discard the queued chunk before it is read).
            setTimeout(() => c.error(new Error('reset')), 20);
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      );
    expect(await openaiAdapter.streamText(request({ apiKey: `sk-${'b'.repeat(30)}QRST` }), () => undefined)).toMatchObject({ ok: true, text: 'Done.' });
  });

  it('the day’s free allowance spent (429) is a plain failure, so the platform tries the next provider', async () => {
    reply = () => httpError(429);
    expect(await workersAiAdapter.streamText(request(), () => undefined)).toEqual({ ok: false, failure: 'http', status: 429 });
  });
});

describe('Workers AI speech to text (Whisper)', () => {
  const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
  const hear = (over: Partial<{ apiKey: string; model: string }> = {}) => workersAiSpeechAdapter.transcribe({ apiKey: WORKERS_KEY, model: '@cf/openai/whisper-large-v3-turbo', audio, mediaType: 'audio/webm', language: 'hi', ...over });

  it('posts the recording as base64 with the task and language, to the model’s run route', async () => {
    reply = () => Response.json({ success: true, result: { text: ' What is a magnet? ', word_count: 4 } });
    expect(await hear()).toEqual({ ok: true, text: 'What is a magnet?', tokensIn: 0, tokensOut: 0 });
    expect(calls[0].url).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/@cf/openai/whisper-large-v3-turbo`);
    expect(calls[0].headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(calls[0].body)).toEqual({ audio: Buffer.from(audio).toString('base64'), task: 'transcribe', language: 'hi' });
  });

  it('a model id that is not a Workers AI id never reaches the URL', async () => {
    for (const model of ['../../accounts', '@cf/openai/whisper?x=1', 'whisper-1', '@cf/a/b/c']) expect(await hear({ model }), model).toEqual({ ok: false, failure: 'http', status: 400 });
    expect(calls).toHaveLength(0);
  });

  it('an error answer is a failure, never words', async () => {
    reply = () => Response.json({ success: false, errors: [{ message: 'x' }] });
    expect(await hear()).toEqual({ ok: false, failure: 'bad_stream' });
    reply = () => httpError(429);
    expect(await hear()).toEqual({ ok: false, failure: 'http', status: 429 });
  });
});

describe('Gemini (adult tools only, parked)', () => {
  it('posts to Google’s OpenAI-compatible route with the API key, JSON mode and usage', async () => {
    reply = () => openaiOk(['A lesson plan.'], 30, 4);
    expect(await geminiAdapter.streamText(request({ apiKey: GEMINI_KEY, model: 'gemini-flash-latest', responseFormat: 'json' }), () => undefined)).toEqual({ ok: true, text: 'A lesson plan.', tokensIn: 30, tokensOut: 4 });
    expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(calls[0].headers.authorization).toBe(`Bearer ${GEMINI_KEY}`);
    const body = JSON.parse(calls[0].body);
    expect([body.max_tokens, body.response_format, body.stream_options]).toEqual([900, { type: 'json_object' }, { include_usage: true }]);
    expect(geminiAdapter.keyLooksRight(GEMINI_KEY)).toBe(true);
    expect(geminiAdapter.keyLooksRight('sk-not-google')).toBe(false);
  });
});

describe('OpenAI keeps its own wire format on the shared core', () => {
  it('max_completion_tokens, usage and response_format for JSON', async () => {
    await openaiAdapter.streamText(request({ apiKey: `sk-${'b'.repeat(30)}QRST`, model: 'test-model-b', responseFormat: 'json' }), () => undefined);
    const body = JSON.parse(calls[0].body);
    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect([body.max_completion_tokens, body.stream_options, body.response_format]).toEqual([900, { include_usage: true }, { type: 'json_object' }]);
  });
});
