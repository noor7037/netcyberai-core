import { randomBytes } from 'crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { adapterFor, providerCapabilities, speechAdapterFor, textAdapters } from '@/lib/ai/adapters';
import { endpointNet, type Resolved } from '@/lib/ai/adapters/endpoint-guard';
import { openaiCompatibleAdapter } from '@/lib/ai/adapters/openai-compatible';
import { vertexAiAdapter, vertexModelLooksRight } from '@/lib/ai/adapters/vertex-ai';
import { CAPABILITIES, type AdapterRequest } from '@/lib/ai/adapters/types';
import { missingCapabilities, prepareText, PROFILES, REFUSAL_MESSAGE, type AiContext } from '@/lib/ai/platform';
import { aiEncryptionKey, sealAiKey } from '@/lib/ai/credentials';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';
import { openaiOk } from './streams';

// G1 (C369): Vertex AI (express mode) and the OpenAI-compatible adapter at the founder's address; each adapter's
// declared capabilities, and the refusal of a profile that needs what its adapter does not declare. Vendors are
// replaced at fetch (Vertex) and at the guard's network (the founder's address), so nothing leaves the test. Made-up
// keys, names and text only.

const VERTEX_KEY = `AQ.${'V'.repeat(40)}KEYV`;
const COMPAT_KEY = `ck-${'C'.repeat(30)}KEYC`;
const BASE = 'https://llm.example.com/v1';

const request = (over: Partial<AdapterRequest> = {}): AdapterRequest => ({ apiKey: VERTEX_KEY, model: 'gemini-2.5-flash', system: 'Explain for a Class 6 student.', messages: [{ role: 'user', content: 'Why do magnets attract iron?' }], maxTokens: 900, ...over });
const sse = (lines: unknown[]) => new Response(lines.map((d) => `data: ${JSON.stringify(d)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
const resolvesTo = (...addresses: string[]) => vi.spyOn(endpointNet, 'lookup').mockImplementation(async () => addresses.map((a): Resolved => ({ address: a, family: a.includes(':') ? 6 : 4 })));

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let reply: () => Response = () => new Response('{}', { status: 200 });
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return reply();
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  reply = () => new Response('{}', { status: 200 });
});

// Everything a test can see of a call's outcome, for "no key anywhere" checks.
const seen = (...v: unknown[]) => JSON.stringify(v);

describe('capabilities: declared by each adapter', () => {
  it('every adapter carries a typed record of all six, and nothing declares speech out (tts) yet', () => {
    for (const a of textAdapters()) {
      expect(Object.keys(a.capabilities).sort(), a.providerId).toEqual([...CAPABILITIES].sort());
      expect(a.capabilities.text, a.providerId).toBe(true);
      expect(a.capabilities.tts, a.providerId).toBe(false);
      expect(Object.isFrozen(a.capabilities)).toBe(true);
    }
    expect(vertexAiAdapter.capabilities).toEqual({ text: true, vision: true, stream: true, json: true, stt: false, tts: false });
    expect(openaiCompatibleAdapter.capabilities).toEqual({ text: true, vision: false, stream: true, json: false, stt: false, tts: false });
  });

  it('a provider shows what its adapters declare between them', () => {
    expect(providerCapabilities('workers-ai')).toEqual({ text: true, vision: true, stream: false, json: false, stt: true, tts: false });
    expect(providerCapabilities('anthropic')).toMatchObject({ vision: true, json: false, stt: false });
    expect(providerCapabilities('youtube')).toBeNull();
  });

  it('a profile that reads photos needs vision; voice input needs speech to text', () => {
    expect(missingCapabilities('exams.read_pages', 'openai_compatible')).toEqual(['vision']);
    expect(missingCapabilities('family.homework', 'openai_compatible')).toEqual(['vision']);
    expect(missingCapabilities('copilot.draft', 'openai_compatible')).toEqual([]);
    expect(missingCapabilities('exams.read_pages', 'vertex_ai')).toEqual([]);
    // No speech adapter at all is a different refusal (the provider is not a choice), so nothing is "missing" here.
    expect(speechAdapterFor('vertex_ai')).toBeNull();
    expect(missingCapabilities('family.voice_input', 'vertex_ai')).toEqual([]);
    expect(PROFILES.filter((p) => p.needs?.includes('vision')).map((p) => p.id).sort()).toEqual(['exams.mark', 'exams.read_pages', 'family.homework', 'family.syllabus_extract']);
  });
});

describe('Vertex AI, express mode', () => {
  it('is registered with its terms note and key shapes', () => {
    expect(adapterFor('vertex_ai')).toBe(vertexAiAdapter);
    expect(vertexAiAdapter.termsNote).toBe('adults_only');
    expect(vertexAiAdapter.keyLooksRight(VERTEX_KEY)).toBe(true);
    expect(vertexAiAdapter.keyLooksRight(`AIza${'G'.repeat(35)}`)).toBe(true);
    expect(vertexAiAdapter.keyLooksRight('ya29.access-token')).toBe(false);
    expect(['gemini-2.5-flash', 'gemini-2.0-flash-001'].every(vertexModelLooksRight)).toBe(true);
    expect(['../x', 'gemini/../../x', 'Gemini Pro', 'a', 'x:y'].some(vertexModelLooksRight)).toBe(false);
  });

  it('streams Gemini’s parts; the key goes in a header, never in the address; photos go inline', async () => {
    reply = () =>
      sse([
        { candidates: [{ content: { role: 'model', parts: [{ text: 'Magnets ' }] } }] },
        { candidates: [{ content: { role: 'model', parts: [{ text: 'pull iron.' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 17, candidatesTokenCount: 4 } },
      ]);
    const pieces: string[] = [];
    const got = await vertexAiAdapter.streamText(request({ responseFormat: 'json', messages: [{ role: 'user', content: 'What is this?', images: [{ mediaType: 'image/png', base64: 'iVBORw0KGgo=' }] }] }), (p) => pieces.push(p));
    expect(got).toEqual({ ok: true, text: 'Magnets pull iron.', tokensIn: 17, tokensOut: 4, finish: 'stop' });
    expect(pieces).toEqual(['Magnets ', 'pull iron.']);
    expect(calls[0].url).toBe('https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=sse');
    expect(calls[0].url).not.toContain(VERTEX_KEY);
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe(VERTEX_KEY);
    expect(calls[0].init.redirect).toBe('error');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.generationConfig).toEqual({ maxOutputTokens: 900, responseMimeType: 'application/json' });
    expect(body.contents[0].parts).toEqual([{ inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } }, { text: 'What is this?' }]);
  });

  it('a safety stop or a blocked prompt is a refusal; a token limit says "length"; a bad model id is never sent', async () => {
    reply = () => sse([{ candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }] }]);
    expect(await vertexAiAdapter.streamText(request(), () => {})).toEqual({ ok: false, failure: 'refused' });
    reply = () => sse([{ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } }]);
    expect(await vertexAiAdapter.streamText(request(), () => {})).toEqual({ ok: false, failure: 'refused' });
    reply = () => sse([{ candidates: [{ content: { parts: [{ text: 'Half' }] }, finishReason: 'MAX_TOKENS' }] }]);
    expect(await vertexAiAdapter.streamText(request(), () => {})).toMatchObject({ ok: true, finish: 'length' });
    reply = () => sse([{ candidates: [{ content: { parts: [{ text: 'Half' }] } }] }]);
    expect(await vertexAiAdapter.streamText(request(), () => {})).toEqual({ ok: false, failure: 'cut_short' });
    calls = [];
    expect(await vertexAiAdapter.streamText(request({ model: '../../projects/x' }), () => {})).toEqual({ ok: false, failure: 'http', status: 400 });
    expect(calls).toHaveLength(0);
  });

  it('the key test counts tokens (free) and says only whether it worked; the key is in no outcome', async () => {
    reply = () => new Response('{"totalTokens":1}', { status: 200 });
    expect(await vertexAiAdapter.testConnection!(VERTEX_KEY)).toEqual({ ok: true });
    expect(calls[0].url).toBe('https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:countTokens');
    reply = () => new Response(JSON.stringify({ error: { message: `API key not valid: ${VERTEX_KEY}` } }), { status: 400 });
    const failed = await vertexAiAdapter.testConnection!(VERTEX_KEY);
    expect(failed).toEqual({ ok: false, failure: 'http', status: 400 });
    expect(seen(failed)).not.toContain(VERTEX_KEY);
  });
});

describe('the OpenAI-compatible adapter, at the founder’s address', () => {
  it('sends Chat Completions to <base>/chat/completions at the checked address, the key as a Bearer token', async () => {
    resolvesTo('8.8.4.4');
    const send = vi.spyOn(endpointNet, 'send').mockResolvedValue(openaiOk(['Iron ', 'is magnetic.'], 12, 5));
    const got = await openaiCompatibleAdapter.streamText(request({ apiKey: COMPAT_KEY, model: 'open-model-1', baseUrl: BASE, responseFormat: 'json' }), () => {});
    expect(got).toMatchObject({ ok: true, text: 'Iron is magnetic.' });
    const [url, to, init] = send.mock.calls[0];
    expect(url.href).toBe(`${BASE}/chat/completions`);
    expect(to).toEqual({ address: '8.8.4.4', family: 4 });
    expect(init.headers.authorization).toBe(`Bearer ${COMPAT_KEY}`);
    const body = JSON.parse(init.body!);
    // No JSON mode is declared, so none is sent: the instructions ask for it.
    expect(body.response_format).toBeUndefined();
    expect(body.messages[0].content).toContain('one JSON object');
    // Nothing went to the platform's own fetch.
    expect(calls).toHaveLength(0);
  });

  it('refused at call time: no address, http, a private answer (rebinding), a redirect; the key in no outcome', async () => {
    const send = vi.spyOn(endpointNet, 'send');
    const outcomes = [];
    outcomes.push(await openaiCompatibleAdapter.streamText(request({ apiKey: COMPAT_KEY, model: 'm' }), () => {}));
    outcomes.push(await openaiCompatibleAdapter.streamText(request({ apiKey: COMPAT_KEY, model: 'm', baseUrl: 'http://llm.example.com/v1' }), () => {}));
    resolvesTo('192.168.1.20');
    outcomes.push(await openaiCompatibleAdapter.streamText(request({ apiKey: COMPAT_KEY, model: 'm', baseUrl: BASE }), () => {}));
    expect(send).not.toHaveBeenCalled();
    resolvesTo('8.8.4.4');
    send.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }));
    outcomes.push(await openaiCompatibleAdapter.streamText(request({ apiKey: COMPAT_KEY, model: 'm', baseUrl: BASE }), () => {}));
    expect(outcomes).toEqual(Array(4).fill({ ok: false, failure: 'endpoint' }));
    expect(seen(outcomes)).not.toContain(COMPAT_KEY);
  });

  it('the key test lists the models (GET <base>/models); a refusal or a wrong key says only its kind', async () => {
    resolvesTo('8.8.4.4');
    const send = vi.spyOn(endpointNet, 'send').mockResolvedValue(new Response('{"data":[]}', { status: 200 }));
    expect(await openaiCompatibleAdapter.testConnection!(COMPAT_KEY, BASE)).toEqual({ ok: true });
    expect(send.mock.calls[0][0].href).toBe(`${BASE}/models`);
    expect(send.mock.calls[0][2]).toMatchObject({ method: 'GET', headers: { authorization: `Bearer ${COMPAT_KEY}` } });
    send.mockResolvedValue(new Response(JSON.stringify({ error: `bad key ${COMPAT_KEY}` }), { status: 401 }));
    const wrong = await openaiCompatibleAdapter.testConnection!(COMPAT_KEY, BASE);
    expect(wrong).toEqual({ ok: false, failure: 'http', status: 401 });
    send.mockRejectedValue(new Error(`connect failed for ${COMPAT_KEY}`));
    const down = await openaiCompatibleAdapter.testConnection!(COMPAT_KEY, BASE);
    expect(down).toEqual({ ok: false, failure: 'network' });
    expect(await openaiCompatibleAdapter.testConnection!(COMPAT_KEY)).toEqual({ ok: false, failure: 'endpoint' });
    expect(seen(wrong, down)).not.toContain(COMPAT_KEY);
  });
});

// ---- on the real migrations: the address from Control reaches the call; the capability refusal at run time ----------

const FOUNDER = 'f3000000-0000-4000-8000-0000000000f1';
const ACCOUNT = 'f3000000-0000-4000-8000-0000000000a1';
const ctx: AiContext = { accountId: ACCOUNT, childFirstNames: ['Meera'], day: '2026-10-27' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
// Control's staff tools run on the platform role, as the content pipeline does.
const asPlatform = <T>(fn: (tx: never) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: { query: (s: string) => Promise<unknown> }) => {
    await tx.query('set local role nca_super');
    return fn(tx as never);
  });

describe('the platform, on the real migrations', () => {
  beforeAll(async () => {
    process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
    process.env.AI_CREDENTIALS_KEY_VERSION = '1';
    db = await startHarnessDb({ port: 0 });
    const s = sealAiKey(aiEncryptionKey()!, 'openai_compatible', COMPAT_KEY);
    await q(`insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ('openai_compatible', $1, $2, $3, $4, 'KEYC', $5)`, [s.ciphertext, s.iv, s.tag, s.keyVersion, FOUNDER]);
  }, 90_000);
  afterAll(async () => {
    await db?.stop();
  });

  it('the migration adds both providers, and the database refuses an address that is not https or carries a name', async () => {
    expect(await q(`select provider_id, base_url, cleared_for_minors from control.ai_providers where provider_id in ('vertex_ai', 'openai_compatible') order by 1`)).toEqual([
      { provider_id: 'openai_compatible', base_url: null, cleared_for_minors: false },
      { provider_id: 'vertex_ai', base_url: null, cleared_for_minors: false },
    ]);
    for (const bad of ['http://llm.example.com/v1', 'https://user:pw@llm.example.com', 'https://llm.example.com/v1?key=1', `https://llm.example.com/${'a'.repeat(500)}`]) {
      await expect(q(`update control.ai_providers set base_url = $1 where provider_id = 'openai_compatible'`, [bad]), bad).rejects.toThrow();
    }
  });

  it('the founder’s address reaches the adapter, and is checked again at the call (rebinding refused)', async () => {
    await q(`update control.ai_providers set base_url = $1 where provider_id = 'openai_compatible'`, [BASE]);
    await q(`update control.ai_profiles set provider_id = 'openai_compatible', model = 'open-model-1', fallback = '[]', enabled = true where profile_id = 'content.prepare'`);
    resolvesTo('8.8.4.4');
    const send = vi.spyOn(endpointNet, 'send').mockResolvedValue(openaiOk(['A line.'], 3, 2));
    const prepared = await asPlatform((tx) => prepareText(tx, ctx, 'content.prepare', { system: 'Write one line.', messages: [{ role: 'user', content: 'Magnets' }] }));
    expect(prepared.ok).toBe(true);
    const sent = await (prepared as Extract<typeof prepared, { ok: true }>).text.send();
    expect(sent.result).toMatchObject({ ok: true, text: 'A line.', provider: 'openai_compatible' });
    expect(send.mock.calls[0][0].href).toBe(`${BASE}/chat/completions`);
    // Between the save and this call the name changed its answer to a private address: refused, nothing sent.
    send.mockClear();
    resolvesTo('10.0.0.9');
    const again = await asPlatform((tx) => prepareText(tx, ctx, 'content.prepare', { system: 'Write one line.', messages: [{ role: 'user', content: 'Magnets' }] }));
    const result = (await (again as Extract<typeof again, { ok: true }>).text.send()).result;
    expect(result).toEqual({ ok: false, reason: 'failed' });
    expect(send).not.toHaveBeenCalled();
  });

  it('a profile on a provider lacking what it needs is refused at run time, with its own reason, and nothing is sent', async () => {
    // As if saved before the declaration changed: Control itself refuses this (control-routes.test.ts).
    await q(`update control.ai_profiles set provider_id = 'openai_compatible', model = 'open-model-1', fallback = '[]', enabled = true where profile_id = 'family.syllabus_extract'`);
    const send = vi.spyOn(endpointNet, 'send');
    const got = await asPlatform((tx) => prepareText(tx, ctx, 'family.syllabus_extract', { system: 'Read the contents page.', messages: [{ role: 'user', content: 'Page' }] }));
    expect(got).toEqual({ ok: false, reason: 'not_capable' });
    expect(send).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
    expect(en[REFUSAL_MESSAGE.not_capable]).toBeTruthy();
    expect(hi[REFUSAL_MESSAGE.not_capable]).toBeTruthy();
  });
});
