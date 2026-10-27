import { randomBytes } from 'crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { anthropicAdapter } from '@/lib/ai/adapters/anthropic';
import { geminiAdapter } from '@/lib/ai/adapters/gemini';
import { openaiAdapter } from '@/lib/ai/adapters/openai';
import { workersAiAdapter } from '@/lib/ai/adapters/workers-ai';
import { aiEncryptionKey, sealAiKey } from '@/lib/ai/credentials';
import { loadAiOverview, prepareKeyTest, recordKeyTest, setPrice, undoChange } from '@/lib/ai/control';
import { loadLabSetup } from '@/lib/ai/lab/store';
import { aiHealthProbeHandler, probeTargets } from '@/lib/ai/gateway/probe';
import { loadLabRun } from '@/lib/ai/lab/store';
import { costOf, priceRows } from '@/lib/ai/prices';
import { columnSummaries, labTable } from '@/lib/ai/lab/table';
import type { ClaimedJob } from '@/lib/jobs/types';

// G5 (C373): Wave 1's follow-ups on the real migrations (PGlite): prices and the cost the ledger writes, the Lab's
// cost at today's price, and the 15-minute health probe (a free key check, never a paid answer, never a circuit move).
// Vendors are replaced at fetch. Made-up people only.

const FOUNDER = 'f5000000-0000-4000-8000-0000000000f1';
const ANTHROPIC_KEY = `sk-ant-${'a'.repeat(30)}PRB1`;
const WORKERS_KEY = `${'c'.repeat(32)}:cfat_${'W'.repeat(36)}`;
const DAY = '2026-10-28';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const asRole = <T>(role: string, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query(`set local role ${role}`);
    return fn(tx);
  });
const platform = <T>(fn: (tx: never) => Promise<T>) => asRole('nca_super', (tx) => fn(tx as never));
const q = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const refused = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return 'allowed';
  } catch (e) {
    return String((e as Error).message);
  }
};
const by = { userId: FOUNDER };
const attempt = (provider: string, model: string, tokensIn: number, tokensOut: number) =>
  asRole('family_app', (tx) => tx.query(`select control.record_ai_attempt($1::date, 'family.resolver', $2, $3, null, 0, 'ok', 10, $4, $5, false, 'success', 5)`, [DAY, provider, model, tokensIn, tokensOut]));

async function sealInto(provider: string, key: string) {
  const k = aiEncryptionKey();
  if (!k) throw new Error('test key missing');
  const s = sealAiKey(k, provider, key);
  await q(
    `insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (provider_id) do update set ciphertext = excluded.ciphertext, iv = excluded.iv, tag = excluded.tag`,
    [provider, s.ciphertext, s.iv, s.tag, s.keyVersion, key.slice(-4), FOUNDER]
  );
}

type Call = { url: string; method: string; headers: Record<string, string> };
let calls: Call[] = [];
let status: Record<string, number> = {};
// G6 (C379): a vendor's list answer, per host; '{}' (no list) when not set.
let bodies: Record<string, string> = {};

beforeAll(async () => {
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_CREDENTIALS_KEY_VERSION = '1';
  db = await startHarnessDb({ port: 0 });
  await q(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder')`, [FOUNDER]);
  await sealInto('anthropic', ANTHROPIC_KEY);
  await sealInto('workers-ai', WORKERS_KEY);
  for (const p of ['anthropic', 'workers-ai'])
    await q(`update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/terms', cleared_at = now(), cleared_by = $2 where provider_id = $1`, [p, FOUNDER]);
}, 90_000);
afterAll(async () => {
  await db?.stop();
});
beforeEach(async () => {
  calls = [];
  status = {};
  bodies = {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url: String(url), method: String(init.method ?? 'GET'), headers: (init.headers ?? {}) as Record<string, string> });
      const host = new URL(String(url)).hostname;
      return new Response(bodies[host] ?? '{}', { status: status[host] ?? 200 });
    })
  );
  await db.pg.exec(`delete from control.ai_usage_ledger; delete from control.ai_provider_health; delete from control.ai_model_prices;`);
});
afterEach(() => vi.unstubAllGlobals());

describe('prices and cost', () => {
  it('no price: the cost stays unknown; with a price each attempt is written at the price in force, and a later price rewrites nothing', async () => {
    await attempt('anthropic', 'model-a', 1000, 500);
    expect(await platform((tx) => setPrice(tx, by, 'anthropic', 'model-a', { inUsd: 3, outUsd: 15 }))).toEqual({ ok: true });
    await attempt('anthropic', 'model-a', 1000, 500);
    await platform((tx) => setPrice(tx, by, 'anthropic', 'model-a', { inUsd: 30, outUsd: 150 }));
    const rows = await q(`select cost_usd from control.ai_usage_ledger order by attempt_id`);
    expect(rows.map((r: { cost_usd: unknown }) => (r.cost_usd === null ? null : Number(r.cost_usd)))).toEqual([null, 0.0105]);
  });

  it('a price is 0 to 1000 US dollars per million tokens; a bad model or provider is refused; each change is audited and undone', async () => {
    expect(await platform((tx) => setPrice(tx, by, 'anthropic', 'model-a', { inUsd: -1, outUsd: 1 }))).toEqual({ ok: false, code: 'price' });
    expect(await platform((tx) => setPrice(tx, by, 'anthropic', 'model-a', { inUsd: 1, outUsd: 1001 }))).toEqual({ ok: false, code: 'price' });
    expect(await platform((tx) => setPrice(tx, by, 'anthropic', 'model-a', { inUsd: Number.NaN, outUsd: 1 }))).toEqual({ ok: false, code: 'price' });
    expect(await platform((tx) => setPrice(tx, by, 'anthropic', 'bad model', { inUsd: 1, outUsd: 1 }))).toEqual({ ok: false, code: 'model' });
    expect(await platform((tx) => setPrice(tx, by, 'nobody', 'model-a', { inUsd: 1, outUsd: 1 }))).toEqual({ ok: false, code: 'provider' });

    await platform((tx) => setPrice(tx, by, 'anthropic', 'model-a', { inUsd: 3, outUsd: 15 }));
    const overview = await platform((tx) => loadAiOverview(tx));
    expect(overview.prices).toEqual([expect.objectContaining({ providerId: 'anthropic', model: 'model-a', inUsd: 3, outUsd: 15, setByName: 'Farid Founder' })]);
    const change = overview.changes.find((c) => c.action === 'ai.price_set');
    expect(change).toMatchObject({ target: 'anthropic', canUndo: true });
    expect(await platform((tx) => undoChange(tx, by, change!.auditId))).toEqual({ ok: true });
    expect(await q(`select * from control.ai_model_prices`)).toEqual([]);
    // Removing it is a change too.
    await platform((tx) => setPrice(tx, by, 'anthropic', 'model-a', { inUsd: 3, outUsd: 15 }));
    await platform((tx) => setPrice(tx, by, 'anthropic', 'model-a', null));
    expect(await q(`select * from control.ai_model_prices`)).toEqual([]);
  });

  it('the Lab shows each answer’s cost at today’s price, and a column total only when every answer has one', async () => {
    const [{ run_id }] = await q(
      `insert into control.ai_eval_runs (dataset_version, case_ids, models, started_by) values ('aaaaaaaaaaaa', array['maths-one', 'maths-two'], '[{"provider":"anthropic","model":"model-a"},{"provider":"workers-ai","model":"@cf/x/y"}]', $1) returning run_id`,
      [FOUNDER]
    );
    for (const [c, p, m] of [['maths-one', 'anthropic', 'model-a'], ['maths-two', 'anthropic', 'model-a'], ['maths-one', 'workers-ai', '@cf/x/y']])
      await q(`insert into control.ai_eval_results (run_id, case_id, provider_id, model, latency_ms, tokens_in, tokens_out) values ($1, $2, $3, $4, 10, 2000, 1000)`, [run_id, c, p, m]);
    await platform((tx) => setPrice(tx, by, 'anthropic', 'model-a', { inUsd: 1, outUsd: 2 }));
    const run = await platform((tx) => loadLabRun(tx, run_id));
    expect(run!.results.filter((r) => r.provider === 'anthropic').map((r) => r.costUsd)).toEqual([0.004, 0.004]);
    expect(run!.results.find((r) => r.provider === 'workers-ai')!.costUsd).toBeNull();
    expect(columnSummaries(labTable(run!)).map((s) => s.costUsd)).toEqual([0.008, null]);
  });

  it('only the platform role reads or writes prices', async () => {
    for (const role of ['app_user', 'family_app']) expect(await refused(() => asRole(role, (tx) => tx.query(`select * from control.ai_model_prices`)))).toMatch(/permission denied/);
    expect(await refused(() => asRole('nca_super', (tx) => tx.query(`select * from control.ai_model_prices`)))).toBe('allowed');
  });

  it('the price list: every model in a route, the ledger or a price, once; cost is tokens times the price per million', () => {
    const rows = priceRows({
      profiles: [{ providerId: 'anthropic', model: 'model-a', fallback: [{ provider: 'workers-ai', model: '@cf/x/y' }] }] as never,
      prices: [{ providerId: 'gemini', model: 'g-1', inUsd: 1, outUsd: 1, setAt: '2026-10-28T00:00:00Z', setByName: null }],
      routing: { ledger: [{ providerId: 'anthropic', model: 'model-a' }] as never },
    });
    expect(rows.map((r) => `${r.providerId} ${r.model} ${r.price ? 'priced' : 'none'}`)).toEqual(['anthropic model-a none', 'gemini g-1 priced', 'workers-ai @cf/x/y none']);
    expect(costOf(1_000_000, 0, { inUsd: 3, outUsd: 15 })).toBe(3);
    expect(costOf(10, 10, null)).toBeNull();
  });
});

describe('the health probe', () => {
  it('asks each provider in an enabled route its free check, once, and writes every model of it; the circuit is not moved', async () => {
    await q(`update control.ai_profiles set enabled = false`);
    await q(`update control.ai_profiles set provider_id = 'anthropic', model = 'model-a', fallback = '[{"provider":"workers-ai","model":"@cf/x/y"}]'::jsonb, enabled = true where profile_id = 'family.resolver'`);
    await q(`update control.ai_profiles set provider_id = 'anthropic', model = 'model-b', fallback = '[]'::jsonb, enabled = true where profile_id = 'exams.read_pages'`);
    await q(`insert into control.ai_provider_health (provider_id, model, state, consecutive_failures, opened_at) values ('workers-ai', '@cf/x/y', 'open', 5, now())`);
    status['api.cloudflare.com'] = 503;

    await aiHealthProbeHandler({ platform })({} as ClaimedJob);

    expect(calls.map((c) => `${c.method} ${new URL(c.url).hostname}${new URL(c.url).pathname}`).sort()).toEqual([
      `GET api.anthropic.com/v1/models`,
      `GET api.cloudflare.com/client/v4/accounts/${'c'.repeat(32)}/ai/models/search`,
    ]);
    // The key goes in a header, never in the address.
    for (const c of calls) expect(c.url).not.toMatch(/sk-ant|cfat_/);
    const rows = await q(`select provider_id, model, state, consecutive_failures, last_probe_ok, last_probe_method from control.ai_provider_health order by provider_id, model`);
    expect(rows).toEqual([
      { provider_id: 'anthropic', model: 'model-a', state: 'closed', consecutive_failures: 0, last_probe_ok: true, last_probe_method: 'health_endpoint' },
      { provider_id: 'anthropic', model: 'model-b', state: 'closed', consecutive_failures: 0, last_probe_ok: true, last_probe_method: 'health_endpoint' },
      { provider_id: 'workers-ai', model: '@cf/x/y', state: 'open', consecutive_failures: 5, last_probe_ok: false, last_probe_method: 'health_endpoint' },
    ]);
    // Nothing in the ledger: a probe is not an attempt.
    expect(await q(`select * from control.ai_usage_ledger`)).toEqual([]);
  });

  it('a provider with no key is not asked; disabled routes are not probed', () => {
    expect(Array.from(probeTargets([
      { provider_id: 'anthropic', model: 'm', fallback: [{ provider: 'gemini', model: 'g' }], enabled: true },
      { provider_id: 'openai', model: 'o', fallback: [], enabled: false },
      { provider_id: 'anthropic', model: 'm', fallback: [], enabled: true },
    ]))).toEqual([['anthropic', ['m']], ['gemini', ['g']]]);
  });

  it('the probe writer: platform role only, known methods only; the enqueue waits for the runner to list the job', async () => {
    expect(await refused(() => asRole('family_app', (tx) => tx.query(`select control.record_ai_probe('anthropic', 'm', true, 'health_endpoint')`)))).toMatch(/permission denied/);
    expect(await refused(() => asRole('nca_super', (tx) => tx.query(`select control.record_ai_probe('anthropic', 'm', true, 'guess')`)))).toMatch(/unknown probe result/);
    const fns = await q(
      `select p.proname, r.rolname from pg_proc p cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) r
        where p.proname in ('record_ai_probe', 'ai_health_probe_enqueue', 'record_ai_attempt') and has_function_privilege(r.rolname, p.oid, 'EXECUTE')`
    );
    expect(fns).toEqual([]);
    await q(`delete from jobs where type = 'ai.health_probe'`);
    await q(`update platform_settings set value = '[]'::jsonb where key = 'jobs.handlers'`);
    await q(`select public.ai_health_probe_enqueue()`);
    expect(await q(`select 1 from jobs where type = 'ai.health_probe'`)).toEqual([]);
    await q(`update platform_settings set value = '["ai.health_probe"]'::jsonb where key = 'jobs.handlers'`);
    await q(`select public.ai_health_probe_enqueue()`);
    await q(`select public.ai_health_probe_enqueue()`);
    expect(await q(`select 1 from jobs where type = 'ai.health_probe'`)).toHaveLength(1);
  });
});

describe('the free key checks', () => {
  it('each text adapter checks a key with one GET, the key in a header', async () => {
    const cases = [
      [anthropicAdapter, ANTHROPIC_KEY, 'api.anthropic.com'],
      [openaiAdapter, `sk-${'o'.repeat(30)}`, 'api.openai.com'],
      [geminiAdapter, `AIza${'g'.repeat(35)}`, 'generativelanguage.googleapis.com'],
      [workersAiAdapter, WORKERS_KEY, 'api.cloudflare.com'],
    ] as const;
    for (const [adapter, key, host] of cases) {
      calls = [];
      expect(await adapter.testConnection!(key)).toEqual({ ok: true, models: [] });
      expect(calls).toHaveLength(1);
      expect(new URL(calls[0].url).hostname).toBe(host);
      expect(calls[0].method).toBe('GET');
      expect(calls[0].url).not.toContain(key.slice(-8));
    }
    status['api.openai.com'] = 401;
    expect(await openaiAdapter.testConnection!(`sk-${'o'.repeat(30)}`)).toEqual({ ok: false, failure: 'http', status: 401 });
  });
});

describe('the model pickers’ lists (G6, C379)', () => {
  it('each vendor’s list answer gives its model ids; display names and other junk are dropped', async () => {
    bodies['api.anthropic.com'] = JSON.stringify({ data: [{ id: 'claude-sonnet-4-5', display_name: 'Claude Sonnet 4.5' }, { id: 'claude-haiku-4-5' }, { id: 'Claude Sonnet 4.5' }] });
    bodies['api.openai.com'] = JSON.stringify({ data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o-mini' }, { id: 42 }] });
    bodies['generativelanguage.googleapis.com'] = JSON.stringify({
      models: [
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      ],
    });
    bodies['api.cloudflare.com'] = JSON.stringify({ result: [{ name: '@cf/meta/llama-4-scout-17b-16e-instruct' }, { name: '@cf/openai/whisper-large-v3-turbo' }] });
    expect(await anthropicAdapter.testConnection!(ANTHROPIC_KEY)).toEqual({ ok: true, models: ['claude-haiku-4-5', 'claude-sonnet-4-5'] });
    expect(await openaiAdapter.testConnection!(`sk-${'o'.repeat(30)}`)).toEqual({ ok: true, models: ['gpt-4o-mini'] });
    expect(await geminiAdapter.testConnection!(`AIza${'g'.repeat(35)}`)).toEqual({ ok: true, models: ['gemini-2.5-flash'] });
    expect(await workersAiAdapter.testConnection!(WORKERS_KEY)).toEqual({ ok: true, models: ['@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/openai/whisper-large-v3-turbo'] });
    // A list answer that cannot be read still means the key works; the list is then unavailable.
    bodies['api.openai.com'] = 'not json';
    expect(await openaiAdapter.testConnection!(`sk-${'o'.repeat(30)}`)).toEqual({ ok: true });
  });

  it('Workers AI: if the longer page is refused, one model still checks the key', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      n++;
      return new Response('{}', { status: String(url).includes('per_page=100') ? 400 : 200 });
    }));
    expect(await workersAiAdapter.testConnection!(WORKERS_KEY)).toEqual({ ok: true });
    expect(n).toBe(2);
  });

  it('a key test keeps the list for Control and the Lab; a failed one marks it unavailable; the probe refreshes it', async () => {
    await q(`delete from control.ai_model_lists`);
    bodies['api.anthropic.com'] = JSON.stringify({ data: [{ id: 'claude-sonnet-4-5' }] });
    const test = async () => {
      const prepared = await platform((tx) => prepareKeyTest(tx, 'anthropic'));
      if (!prepared.ok) throw new Error(prepared.code);
      const outcome = await prepared.run();
      await platform((tx) => recordKeyTest(tx, 'anthropic', outcome));
    };
    await test();
    let lists = (await platform((tx) => loadAiOverview(tx))).modelLists;
    expect(lists.anthropic).toMatchObject({ ok: true, models: ['claude-sonnet-4-5'] });
    expect((await platform((tx) => loadLabSetup(tx))).modelLists.anthropic).toMatchObject({ ok: true, models: ['claude-sonnet-4-5'] });
    status['api.anthropic.com'] = 500;
    await test();
    lists = (await platform((tx) => loadAiOverview(tx))).modelLists;
    expect(lists.anthropic).toMatchObject({ ok: false, models: [] });
    // The probe's answer refreshes it.
    status = {};
    bodies['api.anthropic.com'] = JSON.stringify({ data: [{ id: 'claude-opus-4-1' }] });
    await q(`update control.ai_profiles set enabled = false`);
    await q(`update control.ai_profiles set provider_id = 'anthropic', model = 'claude-opus-4-1', fallback = '[]'::jsonb, enabled = true where profile_id = 'family.resolver'`);
    await aiHealthProbeHandler({ platform })({} as ClaimedJob);
    expect((await platform((tx) => loadAiOverview(tx))).modelLists.anthropic).toMatchObject({ ok: true, models: ['claude-opus-4-1'] });
    // Only the platform role reads it.
    expect(await refused(() => asRole('family_app', (tx) => tx.query(`select * from control.ai_model_lists`)))).toMatch(/permission denied/);
  });
});
