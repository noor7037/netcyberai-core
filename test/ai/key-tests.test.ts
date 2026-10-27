import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anthropicAdapter } from '@/lib/ai/adapters/anthropic';
import { geminiAdapter } from '@/lib/ai/adapters/gemini';
import { openaiAdapter } from '@/lib/ai/adapters/openai';

// Control's "Test the key" for Gemini, OpenAI and Anthropic (after C369 gave it to Vertex and the compatible adapter):
// one free call each, the key only in a header, and an outcome that never carries the key.
type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let reply: () => Response | Promise<Response> = () => new Response('{}', { status: 200 });
beforeEach(() => {
  calls = [];
  reply = () => new Response('{}', { status: 200 });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return reply(); }));
});
afterEach(() => vi.unstubAllGlobals());

const KEY = 'AIza' + 'k'.repeat(35);
const cases = [
  { name: 'Gemini', adapter: geminiAdapter, key: KEY, url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:countTokens', header: ['x-goog-api-key', KEY], method: 'POST' },
  { name: 'OpenAI', adapter: openaiAdapter, key: 'sk-' + 'o'.repeat(40), url: 'https://api.openai.com/v1/models', header: ['authorization', 'Bearer sk-' + 'o'.repeat(40)], method: undefined },
  { name: 'Anthropic', adapter: anthropicAdapter, key: 'sk-ant-' + 'a'.repeat(40), url: 'https://api.anthropic.com/v1/models', header: ['x-api-key', 'sk-ant-' + 'a'.repeat(40)], method: undefined },
] as const;

describe.each(cases)('$name: the key test', ({ adapter, key, url, header, method }) => {
  it('calls the free endpoint with the key in a header, never in the URL, and reports only whether it worked', async () => {
    expect(await adapter.testConnection!(key)).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(url);
    expect(calls[0].url).not.toContain(key);
    expect((calls[0].init.headers as Record<string, string>)[header[0]]).toBe(header[1]);
    expect(calls[0].init.method).toBe(method);
    expect(calls[0].init.redirect).toBe('error');
  });
  it('a refused key and a dead line are said as such, with the key in neither', async () => {
    reply = () => new Response(JSON.stringify({ error: { message: `invalid key ${key}` } }), { status: 401 });
    const wrong = await adapter.testConnection!(key);
    expect(wrong).toEqual({ ok: false, failure: 'http', status: 401 });
    reply = () => { throw new Error(`connect failed ${key}`); };
    const down = await adapter.testConnection!(key);
    expect(down).toEqual({ ok: false, failure: 'network' });
    expect(JSON.stringify([wrong, down])).not.toContain(key);
  });
});
