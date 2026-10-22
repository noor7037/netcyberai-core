import { randomBytes } from 'crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { guardVerdict, workersAiModerationAdapter } from '@/lib/ai/adapters/workers-ai';
import { moderationAdapterFor } from '@/lib/ai/adapters';
import { aiEncryptionKey, sealAiKey } from '@/lib/ai/credentials';
import { capableAdapter, prepareModeration, type AiContext } from '@/lib/ai/platform';

// W2 (C314): the safety check, Llama Guard on Workers AI, on the real migrations (PGlite). Cloudflare is replaced at
// fetch, so what is sent is captured byte for byte. Made-up people and words only.

const A = 'f3100000-0000-4000-8000-0000000000a1';
const FOUNDER = 'f3100000-0000-4000-8000-0000000000f1';
const WORKERS_KEY = `${'c'.repeat(32)}:cfat_${'W'.repeat(36)}`;
const GUARD = '@cf/meta/llama-guard-3-8b';
const DAY = '2026-10-22';
const ctx: AiContext = { accountId: A, childFirstNames: ['Asha'], parentEmail: 'parent.a@example.org', day: DAY };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const asFamily = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [A]);
    return fn(tx);
  });
const q = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;

type Call = { url: string; body: string };
let calls: Call[] = [];
let replies: (() => Response)[] = [];
const guard = (response: unknown, ok = true) => () => new Response(JSON.stringify({ success: ok, result: { response, usage: { prompt_tokens: 40, completion_tokens: 2 } } }), { status: 200 });

beforeAll(async () => {
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_CREDENTIALS_KEY_VERSION = '1';
  db = await startHarnessDb({ port: 0 });
  await q(`insert into family.accounts (account_id, email) values ($1, 'parent.a@example.org')`, [A]);
}, 90_000);
afterAll(async () => {
  await db?.stop();
});
beforeEach(() => {
  calls = [];
  replies = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: String(init.body) });
      const next = replies.shift();
      if (!next) throw new Error('no reply prepared');
      return next();
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Llama Guard's answer, in either form", () => {
  it('reads the text form and the object form; anything else is unreadable', () => {
    expect(guardVerdict('safe')).toEqual({ safe: true, categories: [] });
    expect(guardVerdict('\n\nunsafe\nS1,S10')).toEqual({ safe: false, categories: ['S1', 'S10'] });
    expect(guardVerdict({ safe: false, categories: ['S11'] })).toEqual({ safe: false, categories: ['S11'] });
    expect(guardVerdict({ safe: true })).toEqual({ safe: true, categories: [] });
    expect([guardVerdict('I think it is fine'), guardVerdict(null), guardVerdict({ verdict: 'safe' })]).toEqual([null, null, null]);
  });

  it('sends the exchange to its own run route, at temperature 0, and nothing else', async () => {
    replies.push(guard('unsafe\nS1'));
    const r = await workersAiModerationAdapter.moderate({ apiKey: WORKERS_KEY, model: GUARD, user: 'What do magnets attract?', assistant: 'Iron and nickel.' });
    expect(r).toEqual({ ok: true, safe: false, categories: ['S1'], tokensIn: 40, tokensOut: 2, form: 'text' });
    expect(calls[0].url).toBe(`https://api.cloudflare.com/client/v4/accounts/${'c'.repeat(32)}/ai/run/${GUARD}`);
    expect(JSON.parse(calls[0].body)).toEqual({ messages: [{ role: 'user', content: 'What do magnets attract?' }, { role: 'assistant', content: 'Iron and nickel.' }], max_tokens: 32, temperature: 0 });
  });

  it('a refused call, an unreadable answer or a bad model id is a failure, never "safe"', async () => {
    replies.push(() => new Response('{}', { status: 429 }), guard('maybe'), guard('safe', false));
    expect(await workersAiModerationAdapter.moderate({ apiKey: WORKERS_KEY, model: GUARD, user: 'x' })).toEqual({ ok: false, failure: 'http', status: 429 });
    expect(await workersAiModerationAdapter.moderate({ apiKey: WORKERS_KEY, model: GUARD, user: 'x' })).toEqual({ ok: false, failure: 'bad_stream' });
    expect(await workersAiModerationAdapter.moderate({ apiKey: WORKERS_KEY, model: GUARD, user: 'x' })).toEqual({ ok: false, failure: 'bad_stream' });
    expect(await workersAiModerationAdapter.moderate({ apiKey: WORKERS_KEY, model: '@cf/../x', user: 'x' })).toEqual({ ok: false, failure: 'http', status: 400 });
    expect(calls).toHaveLength(3);
  });

  it('the platform finds it by capability; only Workers AI has one', () => {
    expect(capableAdapter('family.moderation', 'workers-ai')).toBe(workersAiModerationAdapter);
    expect([moderationAdapterFor('openai'), moderationAdapterFor('anthropic'), moderationAdapterFor('gemini')]).toEqual([null, null, null]);
  });
});

describe('the family.moderation profile', () => {
  it('is off until the founder clears Workers AI and chooses it: the database refuses a provider before that', async () => {
    expect(await asFamily((tx) => prepareModeration(tx as never, ctx))).toEqual({ ok: false, reason: 'not_switched_on' });
    await expect(q(`update control.ai_profiles set provider_id = 'workers-ai', model = $1 where profile_id = 'family.moderation'`, [GUARD])).rejects.toThrow(/not cleared for minors/);
  });

  it('cleared and keyed: checks, removes the child’s name first, and meters every check after', async () => {
    await q(`update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/terms', cleared_at = now(), cleared_by = $1 where provider_id = 'workers-ai'`, [FOUNDER]);
    await q(`update control.ai_profiles set provider_id = 'workers-ai', model = $1 where profile_id = 'family.moderation'`, [GUARD]);
    const k = aiEncryptionKey()!;
    const s = sealAiKey(k, 'workers-ai', WORKERS_KEY);
    await q(`insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ('workers-ai', $1, $2, $3, $4, $5, $6)`, [s.ciphertext, s.iv, s.tag, s.keyVersion, WORKERS_KEY.slice(-4), FOUNDER]);

    const ready = await asFamily((tx) => prepareModeration(tx as never, ctx));
    if (!ready.ok) throw new Error('not ready');
    // No database is used while checking (F1-3): the checks run outside any transaction.
    replies.push(guard('safe'), guard('unsafe\nS11'), () => new Response('{}', { status: 500 }));
    expect(await ready.moderation.check({ user: 'Asha asks: why does ice float?' })).toEqual({ safe: true, categories: [] });
    expect(await ready.moderation.check({ user: 'q', assistant: 'a' })).toEqual({ safe: false, categories: ['S11'] });
    expect(await ready.moderation.check({ user: 'q' })).toBeNull();
    expect(calls[0].body).not.toContain('Asha');
    // Nothing taken from the family's daily cap.
    expect(await q(`select * from family.ai_daily`)).toEqual([]);
    await asFamily((tx) => ready.moderation.record(tx as never));
    expect(await q(`select profile_id, requests, failures from control.ai_usage`)).toEqual([{ profile_id: 'family.moderation', requests: 3, failures: 1 }]);
  });
});
