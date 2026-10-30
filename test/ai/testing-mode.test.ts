import { randomBytes } from 'crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { dailyRequestsLeft, prepareModeration, streamText, type AiContext, type AiRequest } from '@/lib/ai/platform';
import { sealAiKey, aiEncryptionKey } from '@/lib/ai/credentials';
import { voiceCharsLeft } from '@/lib/ai/daily-cap';
import { anthropicOk } from './streams';

// W8-AI: testing mode (control.settings 'ai.testing_mode') on the real migrations (PGlite), run as the family session
// runs it. On: no daily cap (still counted), every provider read as cleared for children's words, the safety pre-check
// skipped, the profile's answer limit used as saved. Off: each of those refuses exactly as before. Made-up people only.

const A = 'f8000000-0000-4000-8000-0000000000a1';
const FOUNDER = 'f8000000-0000-4000-8000-0000000000f1';
const ANTHROPIC_KEY = `sk-ant-${'a'.repeat(30)}WXYZ`;
const WORKERS_KEY = `${'c'.repeat(32)}:cfat_${'W'.repeat(36)}`;
const DAY = '2026-10-30';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const asFamily = <T>(account: string, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [account]);
    return fn(tx);
  });
const q = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;

const ctx: AiContext = { accountId: A, childFirstNames: ['Asha'], parentEmail: 'parent.a@example.org', day: DAY };
const ask = (over: Partial<AiRequest> = {}): AiRequest => ({ system: 'Explain for a Class 7 student.', messages: [{ role: 'user', content: 'What is photosynthesis?' }], ...over });
const run = (request: AiRequest = ask()) => asFamily(A, (tx) => streamText(tx as never, ctx, 'family.resolver', request));
const moderation = () => asFamily(A, (tx) => prepareModeration(tx as never, ctx, 'family.resolver'));

const testing = (on: boolean) => q(`update control.settings set value = $1::jsonb where key = 'ai.testing_mode'`, [JSON.stringify(on ? 'on' : 'off')]);
async function sealInto(provider: string, key: string) {
  const k = aiEncryptionKey();
  if (!k) throw new Error('test key missing');
  const s = sealAiKey(k, provider, key);
  await q(
    `insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (provider_id) do update set ciphertext = excluded.ciphertext, iv = excluded.iv, tag = excluded.tag, key_version = excluded.key_version, key_last4 = excluded.key_last4`,
    [provider, s.ciphertext, s.iv, s.tag, s.keyVersion, key.slice(-4), FOUNDER]
  );
}
const clear = (provider: string) => q(`update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/terms', cleared_at = now(), cleared_by = $2 where provider_id = $1`, [provider, FOUNDER]);
const useProfile = (profile: string, provider: string, model: string) => q(`update control.ai_profiles set provider_id = $2, model = $3, fallback = '[]'::jsonb, enabled = true where profile_id = $1`, [profile, provider, model]);

type Call = { url: string; body: string };
let calls: Call[] = [];

beforeAll(async () => {
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_CREDENTIALS_KEY_VERSION = '1';
  db = await startHarnessDb({ port: 0 });
  await q(`insert into family.accounts (account_id, email) values ($1, 'parent.a@example.org')`, [A]);
}, 90_000);
afterAll(async () => {
  await db?.stop();
});

beforeEach(async () => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: String(init.body) });
      return anthropicOk(['Plants make food.']);
    })
  );
  await testing(false);
  await q(`update control.ai_profiles set provider_id = null, model = null, fallback = '[]', enabled = true`);
  await q(`delete from control.ai_credentials`);
  await q(`update control.ai_providers set cleared_for_minors = false, cleared_terms_url = null, cleared_at = null, cleared_by = null`);
  await q(`delete from control.ai_usage`);
  await q(`delete from family.ai_daily`);
  await q(`update control.settings set value = '1'::jsonb where key = 'family.ai.daily_requests'`);
  await sealInto('anthropic', ANTHROPIC_KEY);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the migration', () => {
  it('seeds testing mode on (the harness switches it off for tests), the nvidia provider switched on, and v7 with 8000 tokens', async () => {
    const fresh = await startHarnessDb({ port: 0, testingMode: 'on' });
    try {
      const rows = async (sql: string) => (await fresh.pg.query(sql)).rows;
      expect(await rows(`select value from control.settings where key = 'ai.testing_mode'`)).toEqual([{ value: 'on' }]);
      expect(await rows(`select enabled, cleared_for_minors from control.ai_providers where provider_id = 'nvidia'`)).toEqual([{ enabled: true, cleared_for_minors: false }]);
      expect(await rows(`select max_output_tokens from control.ai_profiles where profile_id = 'family.resolver'`)).toEqual([{ max_output_tokens: 8000 }]);
    } finally {
      await fresh.stop();
    }
  });
});

describe('testing mode on', () => {
  beforeEach(() => testing(true));

  it('a request over the daily cap is answered, and still counted', async () => {
    await clear('anthropic');
    await useProfile('family.resolver', 'anthropic', 'test-model-a');
    expect(await run()).toMatchObject({ ok: true });
    expect(await run()).toMatchObject({ ok: true });
    expect(await q(`select requests from family.ai_daily where account_id = $1`, [A])).toEqual([{ requests: 2 }]);
    expect(await asFamily(A, (tx) => dailyRequestsLeft(tx as never, A, DAY))).toBeGreaterThan(1000);
    expect(await asFamily(A, (tx) => voiceCharsLeft(tx as never, A, DAY))).toBeGreaterThan(1000);
  });

  it('a provider not cleared for children is used; its clearance in Control is left as it was', async () => {
    await useProfile('family.resolver', 'anthropic', 'test-model-a');
    expect(await run()).toMatchObject({ ok: true, provider: 'anthropic' });
    expect(calls).toHaveLength(1);
    expect(await q(`select cleared_for_minors from control.ai_providers where provider_id = 'anthropic'`)).toEqual([{ cleared_for_minors: false }]);
  });

  it('the safety pre-check is skipped: nothing is sent, every check reads as safe', async () => {
    await useProfile('family.moderation', 'workers-ai', '@cf/meta/llama-guard-3-8b');
    await sealInto('workers-ai', WORKERS_KEY);
    const ready = await moderation();
    if (!ready.ok) throw new Error('expected the check to be ready');
    expect(await ready.moderation.check({ user: 'What is photosynthesis?' })).toEqual({ safe: true, categories: [] });
    expect(calls).toHaveLength(0);
  });

  it('the profile’s answer limit is used as saved, whatever smaller limit the caller asked for', async () => {
    await useProfile('family.resolver', 'anthropic', 'test-model-a');
    await run(ask({ maxTokens: 300 }));
    expect(JSON.parse(calls[0].body).max_tokens).toBe(8000);
  });
});

describe('testing mode off: each refuses as before', () => {
  it('a request over the daily cap is refused', async () => {
    await clear('anthropic');
    await useProfile('family.resolver', 'anthropic', 'test-model-a');
    expect(await run()).toMatchObject({ ok: true });
    expect(await run()).toEqual({ ok: false, reason: 'cap_reached' });
    expect(calls).toHaveLength(1);
  });

  it('a provider not cleared for children is refused, at the save and at the call', async () => {
    // At the save: the database's minors check.
    await expect(useProfile('family.resolver', 'anthropic', 'test-model-a')).rejects.toThrow(/not cleared for minors/);
    // A route saved during testing on an uncleared provider is refused once testing mode is off.
    await testing(true);
    await useProfile('family.resolver', 'anthropic', 'test-model-a');
    await testing(false);
    expect(await run()).toEqual({ ok: false, reason: 'not_cleared_for_minors' });
    expect(calls).toHaveLength(0);
  });

  it('the safety pre-check runs: not set up, or on an uncleared provider, it refuses', async () => {
    expect(await moderation()).toEqual({ ok: false, reason: 'not_switched_on' });
    await testing(true);
    await useProfile('family.moderation', 'workers-ai', '@cf/meta/llama-guard-3-8b');
    await testing(false);
    expect(await moderation()).toEqual({ ok: false, reason: 'not_cleared_for_minors' });
    expect(calls).toHaveLength(0);
  });

  it('the caller’s smaller answer limit is kept', async () => {
    await clear('anthropic');
    await useProfile('family.resolver', 'anthropic', 'test-model-a');
    await run(ask({ maxTokens: 300 }));
    expect(JSON.parse(calls[0].body).max_tokens).toBe(300);
  });
});
