import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anthropicAdapter } from '@/lib/ai/adapters/anthropic';
import { geminiAdapter } from '@/lib/ai/adapters/gemini';
import { openaiAdapter, openaiSpeechAdapter } from '@/lib/ai/adapters/openai';
import { splitWorkersKey, workersAiAdapter, workersAiSpeechAdapter, workersModelLooksRight } from '@/lib/ai/adapters/workers-ai';
import { adapterFor, speechAdapterFor } from '@/lib/ai/adapters';
import { JSON_ONLY, type AdapterRequest } from '@/lib/ai/adapters/types';
import { capableAdapter } from '@/lib/ai/platform';
import { streamChatCompletions } from '@/lib/ai/adapters/chat-completions';
import { httpError, openaiOk } from './streams';

// C230-U: the providers added after reading each vendor's terms for a product used by children; since C368 what those
// terms say is a note beside Control's switch, and the founder's clearance there is the one gate. Vendors are replaced
// at fetch, so what each adapter sends is captured byte for byte. Made-up keys and text only.

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
// A whole answer, as a route that does not stream sends it (C322).
const whole = (content: string, tokensIn = 13, tokensOut = 9, finish = 'stop') =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }], usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut } }), { status: 200 });
const sse = (lines: unknown[]) => new Response(lines.map((d) => `data: ${typeof d === 'string' ? d : JSON.stringify(d)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });

describe('what each vendor’s terms say (C368: a note beside Control’s switch, never a block in code)', () => {
  it('each adapter carries the note read from its vendor’s terms', () => {
    expect([workersAiAdapter, workersAiSpeechAdapter, anthropicAdapter].map((a) => a.termsNote)).toEqual(['no_bar_found', 'no_bar_found', 'minors_with_safeguards']);
    expect([openaiAdapter, openaiSpeechAdapter, geminiAdapter].map((a) => a.termsNote)).toEqual(['no_under_13', 'no_under_13', 'adults_only']);
  });

  it('the platform finds each adapter by id, with the right capability per profile; Gemini is registered (C230-AO)', () => {
    expect(adapterFor('workers-ai')).toBe(workersAiAdapter);
    expect(speechAdapterFor('workers-ai')).toBe(workersAiSpeechAdapter);
    expect(capableAdapter('family.voice_input', 'workers-ai')?.capability).toBe('speech_to_text');
    expect(capableAdapter('family.resolver', 'workers-ai')?.capability).toBe('text');
    expect(capableAdapter('copilot.draft', 'workers-ai')?.capability).toBe('text');
    expect(adapterFor('gemini')).toBe(geminiAdapter);
    expect(capableAdapter('exams.read_pages', 'gemini')).toBe(geminiAdapter);
    // Gemini has no speech to text here: it cannot be chosen for voice input.
    expect([speechAdapterFor('gemini'), capableAdapter('family.voice_input', 'gemini')]).toEqual([null, null]);
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
  it('posts to the account’s chat route with the token alone and max_tokens, and asks for the answer in one piece (C322)', async () => {
    reply = () => whole('Magnets pull iron.', 21, 5);
    const pieces: string[] = [];
    expect(await workersAiAdapter.streamText(request(), (p) => pieces.push(p))).toEqual({ ok: true, text: 'Magnets pull iron.', tokensIn: 21, tokensOut: 5, finish: 'stop' });
    // Handed on in one piece.
    expect(pieces).toEqual(['Magnets pull iron.']);
    expect(calls[0].url).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/v1/chat/completions`);
    expect(calls[0].headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(calls[0].body)).toEqual({
      model: '@cf/meta/llama-4-scout-17b-16e-instruct',
      // Streamed, Llama's JSON lost its inner quotation marks; in one piece it comes whole (C322).
      stream: false,
      max_tokens: 900,
      // A steadier structured answer from open models (C316).
      temperature: 0.3,
      // The instructions open the first user message (C320).
      messages: [{ role: 'user', content: 'Explain for a Class 6 student.\n\nWhy do magnets attract iron?' }],
    });
    expect(calls[0].body).not.toContain(TOKEN);
  });

  it('a whole answer keeps its JSON, says why it ended, and is counted when no usage comes', async () => {
    reply = () => whole('{"type":"answer","word":"metal"}');
    expect(await workersAiAdapter.streamText(request(), () => undefined)).toMatchObject({ ok: true, text: '{"type":"answer","word":"metal"}' });
    reply = () => whole('Half', 1, 1, 'length');
    expect(await workersAiAdapter.streamText(request(), () => undefined)).toMatchObject({ ok: true, text: 'Half', finish: 'length' });
    reply = () => new Response(JSON.stringify({ choices: [{ message: { content: 'Iron.' }, finish_reason: 'stop' }] }), { status: 200 });
    // 58 characters sent, 5 back: four characters a token.
    expect(await workersAiAdapter.streamText(request(), () => undefined)).toEqual({ ok: true, text: 'Iron.', tokensIn: 15, tokensOut: 2, finish: 'stop' });
    reply = () => new Response(JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'content_filter' }] }), { status: 200 });
    expect(await workersAiAdapter.streamText(request(), () => undefined)).toEqual({ ok: false, failure: 'refused' });
    reply = () => new Response('not json', { status: 200 });
    expect(await workersAiAdapter.streamText(request(), () => undefined)).toEqual({ ok: false, failure: 'bad_stream' });
  });

  it('a request may still ask for a system message (the smoke test compares the two)', async () => {
    await workersAiAdapter.streamText(request({ instructionsAs: 'system' }), () => undefined);
    expect(JSON.parse(calls[0].body).messages).toEqual([
      { role: 'system', content: 'Explain for a Class 6 student.' },
      { role: 'user', content: 'Why do magnets attract iron?' },
    ]);
  });

  it('asks for JSON in the instructions, not with response_format', async () => {
    await workersAiAdapter.streamText(request({ responseFormat: 'json' }), () => undefined);
    const body = JSON.parse(calls[0].body);
    expect(body.messages[0].content).toBe(`Explain for a Class 6 student.\n\n${JSON_ONLY}\n\nWhy do magnets attract iron?`);
    expect(body.response_format).toBeUndefined();
  });

  it('sends a photo as an image_url data URL, read inside the call, after the instructions', async () => {
    await workersAiAdapter.streamText(request({ messages: [{ role: 'user', content: 'Explain this page.', images: [{ mediaType: 'image/jpeg', base64: 'QUJD' }] }] }), () => undefined);
    expect(JSON.parse(calls[0].body).messages[0]).toEqual({ role: 'user', content: [{ type: 'text', text: 'Explain for a Class 6 student.\n\nExplain this page.' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } }] });
  });

  // The streamed path stays in the shared core for the vendors that stream (OpenAI, Gemini).
  const streamed = (onDelta: (t: string) => void = () => undefined) => streamChatCompletions('https://example.invalid/v1/chat/completions', 'tok', request(), onDelta, { maxTokensField: 'max_tokens', jsonMode: false, includeUsage: false });
  it('streamed (the core): a stream that ends with a stop but no [DONE] is complete; one that just stops is cut short', async () => {
    reply = () => sse([{ choices: [{ delta: { content: 'Iron.' }, finish_reason: null }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }]);
    expect(await streamed()).toEqual({ ok: true, text: 'Iron.', tokensIn: 15, tokensOut: 2, finish: 'stop' });
    reply = () => sse([{ choices: [{ delta: { content: 'Iro' }, finish_reason: null }] }]);
    expect(await streamed()).toEqual({ ok: false, failure: 'cut_short' });
    // Why the stream ended is passed on (C318).
    reply = () => sse([{ choices: [{ delta: { content: 'Half' } }] }, { choices: [{ delta: {}, finish_reason: 'length' }] }, '[DONE]']);
    expect(await streamed()).toMatchObject({ ok: true, text: 'Half', finish: 'length' });
  });

  it('streamed (the core): after its stop, a connection held open or dropped does not turn the answer into a failure', async () => {
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
    expect(await streamed()).toMatchObject({ ok: true, text: 'Done.' });
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
    expect(await geminiAdapter.streamText(request({ apiKey: GEMINI_KEY, model: 'gemini-flash-latest', responseFormat: 'json' }), () => undefined)).toEqual({ ok: true, text: 'A lesson plan.', tokensIn: 30, tokensOut: 4, finish: 'stop' });
    expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(calls[0].headers.authorization).toBe(`Bearer ${GEMINI_KEY}`);
    const body = JSON.parse(calls[0].body);
    expect([body.max_tokens, body.response_format, body.stream_options]).toEqual([900, { type: 'json_object' }, { include_usage: true }]);
    expect(geminiAdapter.keyLooksRight(GEMINI_KEY)).toBe(true);
    expect(geminiAdapter.keyLooksRight('sk-not-google')).toBe(false);
    // Google has issued longer "AIza" keys and "AQ." bound keys; a paste slip is still refused.
    expect(geminiAdapter.keyLooksRight(`AIza${'G'.repeat(50)}`)).toBe(true);
    expect(geminiAdapter.keyLooksRight(`AQ.${'k'.repeat(40)}`)).toBe(true);
    for (const bad of ['AIzaTOOSHORT', `AIza${'G'.repeat(35)} extra`, 'ya29.access-token', '']) expect(geminiAdapter.keyLooksRight(bad)).toBe(false);
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
