import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NVIDIA_BASE_URL, nvidiaAdapter } from '@/lib/ai/adapters/nvidia';
import { adapterFor, textAdapters } from '@/lib/ai/adapters';
import { classifyFailure } from '@/lib/ai/gateway/taxonomy';
import type { AdapterRequest } from '@/lib/ai/adapters/types';
import { httpError, openaiOk } from './streams';

// W8-AI: NVIDIA NIM as its own provider, on the shared Chat Completions wire format at a fixed address. The vendor is
// replaced at fetch, so what the adapter sends is captured byte for byte. Made-up keys, models and text only.

const KEY = `nvapi-${'N'.repeat(40)}`;
type Call = { url: string; method: string; body: string; headers: Record<string, string> };
let calls: Call[] = [];
let reply: () => Response = () => openaiOk(['ok']);
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), method: String(init.method), body: String(init.body ?? ''), headers: init.headers as Record<string, string> });
      return reply();
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  reply = () => openaiOk(['ok']);
});

const request = (over: Partial<AdapterRequest> = {}): AdapterRequest => ({ apiKey: KEY, model: 'made-up-vendor/made-up-model-1.0', system: 'Explain for a Class 6 student.', messages: [{ role: 'user', content: 'Why do magnets attract iron?' }], maxTokens: 900, ...over });

describe('NVIDIA NIM: the provider', () => {
  it('is registered as "nvidia": text, photos and streaming, a key only (no address to save), no terms note', () => {
    expect(adapterFor('nvidia')).toBe(nvidiaAdapter);
    expect(textAdapters().map((a) => a.providerId)).toContain('nvidia');
    expect(nvidiaAdapter.needsKey).toBe(true);
    expect(nvidiaAdapter.needsBaseUrl).toBe(false);
    expect(nvidiaAdapter.termsNote).toBeNull();
    expect(nvidiaAdapter.capabilities).toMatchObject({ text: true, vision: true, stream: true, json: false });
  });

  it('takes only an "nvapi-" key of 20 to 200 key characters', () => {
    expect(nvidiaAdapter.keyLooksRight(KEY)).toBe(true);
    expect(nvidiaAdapter.keyLooksRight(`nvapi-${'a_b-C'.repeat(4)}`)).toBe(true);
    for (const bad of ['', 'nvapi-', `nvapi-${'x'.repeat(19)}`, `nvapi-${'x'.repeat(201)}`, `sk-${'x'.repeat(40)}`, `NVAPI-${'x'.repeat(40)}`, `nvapi-${'x'.repeat(30)} `, `nvapi-${'x'.repeat(30)}/x`]) {
      expect(nvidiaAdapter.keyLooksRight(bad), bad).toBe(false);
    }
  });
});

describe('NVIDIA NIM: a call', () => {
  it('goes to the fixed address with the key as a Bearer token, streamed, the model as Control chose it', async () => {
    reply = () => openaiOk(['Mag', 'nets'], 21, 4);
    const pieces: string[] = [];
    const r = await nvidiaAdapter.streamText(request(), (p) => pieces.push(p));
    expect(r).toEqual({ ok: true, text: 'Magnets', tokensIn: 21, tokensOut: 4, finish: 'stop' });
    expect(pieces.join('')).toBe('Magnets');
    expect(NVIDIA_BASE_URL).toBe('https://integrate.api.nvidia.com/v1');
    expect(calls[0].url).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    expect(calls[0].headers.authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(calls[0].body);
    expect(body).toMatchObject({ model: 'made-up-vendor/made-up-model-1.0', stream: true, max_tokens: 900, stream_options: { include_usage: true } });
    expect(body.response_format).toBeUndefined();
  });

  it('sends a photo as an OpenAI image_url content part', async () => {
    await nvidiaAdapter.streamText(request({ messages: [{ role: 'user', content: 'What is in the picture?', images: [{ mediaType: 'image/jpeg', base64: 'AAAA' }] }] }), () => {});
    const user = JSON.parse(calls[0].body).messages.find((m: { role: string }) => m.role === 'user');
    expect(user.content).toEqual([
      { type: 'text', text: 'What is in the picture?' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
    ]);
  });

  it('a wrong key (401) is classed auth_failed: not retried on a backup, the circuit left as it was', async () => {
    reply = () => httpError(401);
    const r = await nvidiaAdapter.streamText(request(), () => {});
    expect(r).toEqual({ ok: false, failure: 'http', status: 401 });
    if (r.ok) throw new Error('unreachable');
    expect(classifyFailure(r, { streamed: false, timedOut: false })).toEqual({ outcome: 'auth_failed', retryable: false, circuit: 'neutral' });
  });
});

describe('NVIDIA NIM: the key test', () => {
  it('is a GET to /models with the key, and its ids fill the model picker (cleaned, sorted, once each)', async () => {
    reply = () => new Response(JSON.stringify({ object: 'list', data: [{ id: 'vendor-b/model-two' }, { id: 'vendor-a/model-1.5-instruct' }, { id: 'vendor-a/model-1.5-instruct' }, { id: 'bad id with spaces' }, { id: 7 }] }), { status: 200 });
    const r = await nvidiaAdapter.testConnection!(KEY);
    expect(calls[0]).toMatchObject({ url: 'https://integrate.api.nvidia.com/v1/models', method: 'GET' });
    expect(calls[0].headers.authorization).toBe(`Bearer ${KEY}`);
    expect(r).toEqual({ ok: true, models: ['vendor-a/model-1.5-instruct', 'vendor-b/model-two'] });
  });

  it('a refused key reports its status and no models', async () => {
    reply = () => httpError(401);
    expect(await nvidiaAdapter.testConnection!(KEY)).toEqual({ ok: false, failure: 'http', status: 401 });
  });
});
