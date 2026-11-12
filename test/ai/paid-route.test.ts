import { randomBytes } from 'crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { PROFILES, paidWindowMs, prepareText, streamText, type AiContext, type AiRequest, type ProfileId } from '@/lib/ai/platform';
import { sealAiKey, aiEncryptionKey } from '@/lib/ai/credentials';
import { setPaidCustomer, setPaidLimit, setPaidRoute, undoChange } from '@/lib/ai/control';
import { anthropicOk, httpError } from './streams';

// C504: the paid route on the real migrations (PGlite). A paying customer's call runs on the profile's paid chain only
// while the caller is paying, the route is on, every link is priced and the month's paid spend (with live holds) stays
// within the limit; otherwise the normal chain answers. Vendors are replaced at fetch. Made-up people only.

const PAYING = 'f5040000-0000-4000-8000-0000000000a1';
const LINKED = 'f5040000-0000-4000-8000-0000000000a2';
const OTHER = 'f5040000-0000-4000-8000-0000000000a3';
const SCHOOL = 'f5040000-0000-4000-8000-0000000000c1';
const FOUNDER = 'f5040000-0000-4000-8000-0000000000f1';
const PARENT = 'f5040000-0000-4000-8000-0000000000d1';
const DAY = '2026-11-12';
const by = { userId: FOUNDER };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const asRole = <T>(role: string, fn: (tx: Tx) => Promise<T>, settings: [string, string][] = []): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query(`set local role ${role}`);
    for (const [k, v] of settings) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const asFamily = <T>(account: string, fn: (tx: Tx) => Promise<T>) => asRole('family_app', fn, [['app.current_account_id', account]]);
const asFounder = <T>(fn: (tx: Tx) => Promise<T>) => asRole('nca_super', fn);
const q = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const refused = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return 'allowed';
  } catch (e) {
    return String((e as Error).message);
  }
};

const ctxOf = (accountId: string): AiContext => ({ accountId, childFirstNames: ['Asha'], parentEmail: 'parent.c504@example.org', day: DAY });
const ask: AiRequest = { system: 'Explain for a Class 7 student.', messages: [{ role: 'user', content: 'Why is the sky blue?' }] };
const run = (account: string, profile: ProfileId = 'family.resolver') => asFamily(account, (tx) => streamText(tx as never, ctxOf(account), profile, ask));

let hosts: string[] = [];
const workersOk = () => new Response(JSON.stringify({ choices: [{ message: { content: 'From the free model.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 13, completion_tokens: 4 } }), { status: 200 });

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
const price = (provider: string, model: string, inUsd = 3, outUsd = 15) =>
  q(`insert into control.ai_model_prices (provider_id, model, usd_per_mtok_in, usd_per_mtok_out, set_by) values ($1, $2, $3, $4, $5) on conflict (provider_id, model) do update set usd_per_mtok_in = excluded.usd_per_mtok_in, usd_per_mtok_out = excluded.usd_per_mtok_out`, [provider, model, inUsd, outUsd, FOUNDER]);
const ledger = () => q(`select profile_id, provider_id, model, paid, cost_usd from control.ai_usage_ledger order by attempt_id`);
const holds = async () => Number((await q(`select count(*)::int as n from control.ai_paid_holds`))[0].n);

beforeAll(async () => {
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_CREDENTIALS_KEY_VERSION = '1';
  db = await startHarnessDb({ port: 0 });
  for (const [id, email] of [[PAYING, 'paying.c504@example.org'], [LINKED, 'linked.c504@example.org'], [OTHER, 'other.c504@example.org']])
    await q(`insert into family.accounts (account_id, email) values ($1, $2)`, [id, email]);
  await q(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder')`, [FOUNDER]);
  await q(`insert into schools (school_id, name, jurisdiction) values ($1, 'Test Pilot School', 'IN-HR')`, [SCHOOL]);
  await q(`insert into family.school_links (account_id, school_id, parent_id) values ($1, $2, $3)`, [LINKED, SCHOOL, PARENT]);
  await clear('anthropic');
  await clear('workers-ai');
  await sealInto('anthropic', `sk-ant-${'a'.repeat(30)}WXYZ`);
  await sealInto('workers-ai', `${'c'.repeat(32)}:cfat_${'W'.repeat(36)}`);
  // The normal route: a free model on Workers AI; the paid route: Anthropic.
  await q(`update control.ai_profiles set provider_id = 'workers-ai', model = 'test-free-model', fallback = '[]'::jsonb, enabled = true where profile_id = 'family.resolver'`);
  await q(`update control.ai_profiles set provider_id = null, model = null, fallback = '[]'::jsonb, enabled = true where profile_id = 'family.quiz'`);
  await price('anthropic', 'claude-paid-model');
}, 90_000);
afterAll(async () => {
  await db?.stop();
});

beforeEach(async () => {
  hosts = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const host = new URL(String(url)).hostname;
      hosts.push(host);
      return host.includes('anthropic') ? anthropicOk(['Paid answer.'], 1000, 500) : workersOk();
    })
  );
  await q(`delete from control.ai_usage_ledger`);
  await q(`delete from control.ai_paid_holds`);
  await q(`delete from control.ai_paid_customers`);
  await q(`delete from control.ai_paid_routes`);
  await q(`delete from family.ai_daily`);
  await q(`delete from control.settings where key in ('ai.paid_limit_usd_per_month', 'ai.testing_mode')`);
  // The founder's setup, through Control's audited path.
  await asFounder(async (tx) => {
    expect(await setPaidRoute(tx as never, by, 'family.resolver', { providerId: 'anthropic', model: 'claude-paid-model', fallback: [], enabled: true })).toEqual({ ok: true });
    expect(await setPaidLimit(tx as never, by, 100)).toEqual({ ok: true });
    expect(await setPaidCustomer(tx as never, by, { kind: 'family', email: 'Paying.C504@example.org' }, true)).toEqual({ ok: true });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the paid route (C504)', () => {
  it('a paying family, an enabled priced route, under the limit: the paid chain, ledger paid = true, the hold given back', async () => {
    const r = await run(PAYING);
    expect(r).toMatchObject({ ok: true, provider: 'anthropic', model: 'claude-paid-model' });
    expect(hosts.every((h) => h.includes('anthropic'))).toBe(true);
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider_id: 'anthropic', paid: true });
    // 1000 in at $3/M and 500 out at $15/M.
    expect(Number(rows[0].cost_usd)).toBeCloseTo(0.0105, 6);
    expect(await holds()).toBe(0);
    expect(Number((await q(`select control.ai_paid_spend_usd() as usd`))[0].usd)).toBeCloseTo(0.0105, 6);
  });

  it('not a customer: the normal chain, ledger paid = false', async () => {
    const r = await run(OTHER);
    expect(r).toMatchObject({ ok: true, provider: 'workers-ai' });
    expect((await ledger())[0]).toMatchObject({ provider_id: 'workers-ai', paid: false });
    expect(await holds()).toBe(0);
  });

  it('over the limit: the normal chain, silently', async () => {
    await asFounder((tx) => setPaidLimit(tx as never, by, 1));
    // This month's paid spend is already 0.99; the call's worst case does not fit in what is left.
    await q(`insert into control.ai_usage_ledger (day, profile_id, provider_id, model, route_position, outcome, paid, cost_usd) values ($1, 'family.resolver', 'anthropic', 'claude-paid-model', 0, 'ok', true, 0.99)`, [
      (await q(`select (now() at time zone 'Asia/Kolkata')::date::text as d`))[0].d,
    ]);
    expect(await run(PAYING)).toMatchObject({ ok: true, provider: 'workers-ai' });
    expect(await holds()).toBe(0);
  });

  it('no limit set: the paid route is off for everyone', async () => {
    await asFounder((tx) => setPaidLimit(tx as never, by, null));
    expect(await run(PAYING)).toMatchObject({ ok: true, provider: 'workers-ai' });
  });

  it('a live hold counts toward the limit: a second prepared call that would not fit takes the normal chain', async () => {
    // One worst-case hold: 32,000 in at $3/M plus the profile's own output limit at $15/M.
    const max = Number((await q(`select max_output_tokens from control.ai_profiles where profile_id = 'family.resolver'`))[0].max_output_tokens);
    const hold = Math.round((32_000 * 3 + max * 15) / 1e6 * 1e6) / 1e6;
    await asFounder((tx) => setPaidLimit(tx as never, by, Math.ceil(hold * 1.5 * 100) / 100));
    await asFamily(PAYING, (tx) => prepareText(tx as never, ctxOf(PAYING), 'family.resolver', ask));
    expect(await holds()).toBe(1);
    expect(await run(PAYING)).toMatchObject({ ok: true, provider: 'workers-ai' });
  });

  it('an unpriced paid model: the normal chain', async () => {
    await asFounder((tx) => setPaidRoute(tx as never, by, 'family.resolver', { providerId: 'anthropic', model: 'claude-paid-model', fallback: [{ provider: 'anthropic', model: 'claude-unpriced' }], enabled: true }));
    expect(await run(PAYING)).toMatchObject({ ok: true, provider: 'workers-ai' });
    expect(await holds()).toBe(0);
  });

  it('a route switched off: the normal chain', async () => {
    await asFounder((tx) => setPaidRoute(tx as never, by, 'family.resolver', { providerId: 'anthropic', model: 'claude-paid-model', fallback: [], enabled: false }));
    expect(await run(PAYING)).toMatchObject({ ok: true, provider: 'workers-ai' });
  });

  it('a family linked to a paying school is paying; after the link is revoked it is not', async () => {
    expect(await run(LINKED)).toMatchObject({ provider: 'workers-ai' });
    await asFounder((tx) => setPaidCustomer(tx as never, by, { kind: 'school', schoolId: SCHOOL }, true));
    expect(await run(LINKED)).toMatchObject({ provider: 'anthropic' });
    await q(`update family.school_links set revoked_at = now(), revoked_by = 'family' where account_id = $1`, [LINKED]);
    expect(await run(LINKED)).toMatchObject({ provider: 'workers-ai' });
  });

  it('a school session is paying only when its own school is listed', async () => {
    const take = () => asRole('app_user', (tx) => tx.query(`select hold_id from control.ai_paid_take('family.resolver', 100, 100)`), [['app.current_tenant_id', SCHOOL]]);
    expect((await take()).rows).toHaveLength(0);
    await asFounder((tx) => setPaidCustomer(tx as never, by, { kind: 'school', schoolId: SCHOOL }, true));
    expect((await take()).rows).toHaveLength(1);
    // A school session cannot pass for a family: the family's setting is not read for app_user.
    const asSchoolWithFamily = await asRole('app_user', (tx) => tx.query(`select hold_id from control.ai_paid_take('family.resolver', 100, 100)`), [['app.current_tenant_id', OTHER], ['app.current_account_id', PAYING]]);
    expect(asSchoolWithFamily.rows).toHaveLength(0);
  });

  it('a profile that follows another chain (chainFrom) follows its paid chain', async () => {
    expect(await run(PAYING, 'family.quiz')).toMatchObject({ ok: true, provider: 'anthropic' });
    expect((await ledger())[0]).toMatchObject({ profile_id: 'family.quiz', paid: true });
  });

  it('the minors gate refuses a paid chain with an uncleared provider: the normal chain answers', async () => {
    // Saved while testing mode was on (the save check is skipped then), then testing mode off.
    await q(`insert into control.settings (key, value) values ('ai.testing_mode', '"on"'::jsonb) on conflict (key) do update set value = excluded.value`);
    await q(`update control.ai_paid_routes set provider_id = 'openai', model = 'gpt-paid' where profile_id = 'family.resolver'`);
    await price('openai', 'gpt-paid');
    await q(`update control.settings set value = '"off"'::jsonb where key = 'ai.testing_mode'`);
    expect(await run(PAYING)).toMatchObject({ ok: true, provider: 'workers-ai' });
    expect(hosts.some((h) => h.includes('openai'))).toBe(false);
    expect(await holds()).toBe(0);
    // And the save itself is refused outside testing mode.
    expect(await asFounder((tx) => setPaidRoute(tx as never, by, 'family.resolver', { providerId: 'openai', model: 'gpt-paid', fallback: [], enabled: true }))).toMatchObject({ ok: false, code: 'not_cleared_for_minors' });
  });

  it('a clearance cannot be withdrawn while a child-words paid route uses the provider', async () => {
    expect(await refused(() => q(`update control.ai_providers set cleared_for_minors = false where provider_id = 'anthropic'`))).toMatch(/used by a profile/);
  });

  it('every change is audited and can be undone', async () => {
    const rows = await asFounder((tx) => tx.query(`select audit_id, event_action from audit_log where event_action like 'ai.paid_%' order by audit_id desc limit 1`));
    expect(rows.rows[0].event_action).toBe('ai.paid_customer_changed');
    expect(await asFounder((tx) => undoChange(tx as never, by, String(rows.rows[0].audit_id)))).toEqual({ ok: true });
    expect(await run(PAYING)).toMatchObject({ provider: 'workers-ai' });
    // An email with no account is refused, and no family's email is in the audit.
    expect(await asFounder((tx) => setPaidCustomer(tx as never, by, { kind: 'family', email: 'nobody@example.org' }, true))).toEqual({ ok: false, code: 'customer' });
    expect(JSON.stringify(await q(`select before_state, after_state from audit_log where event_action = 'ai.paid_customer_changed'`))).not.toContain('@');
  });

  it('only the platform role reads or writes the paid tables; a session cannot make itself paying', async () => {
    for (const role of ['family_app', 'app_user']) {
      const settings: [string, string][] = role === 'family_app' ? [['app.current_account_id', OTHER]] : [['app.current_tenant_id', SCHOOL]];
      for (const sql of [
        `select * from control.ai_paid_customers`,
        `select * from control.ai_paid_routes`,
        `select * from control.ai_paid_holds`,
        `insert into control.ai_paid_customers (kind, customer_id, set_by) values ('family', '${OTHER}', '${OTHER}')`,
        `update control.ai_paid_routes set enabled = true`,
        `delete from control.ai_paid_holds`,
        `select * from control.ai_paid_take_for('family', '${PAYING}', 'family.resolver', 1, 1)`,
        `select control.ai_paid_customer_is('family', '${PAYING}')`,
        `select control.ai_paid_spend_usd()`,
        `select control.ai_paid_family_id('paying.c504@example.org')`,
        `select * from control.ai_paid_customer_list()`,
        role === 'family_app' ? `select * from control.ai_paid_take_school('family.resolver', 1, 1)` : `select * from control.ai_paid_take_family('family.resolver', 1, 1)`,
      ])
        expect(await refused(() => asRole(role, (tx) => tx.query(sql), settings)), `${role}: ${sql}`).toMatch(/permission denied/);
    }
  });
});

// C507: a paid chain that shows no text hands the call to the normal chain in the same call; one that has shown text does
// not. The resolver's first-text time is shortened here so the test runs in a moment (the window's floor is 3 s).
describe('paid then normal (C507)', () => {
  const resolver = PROFILES.find((p) => p.id === 'family.resolver') as { firstTextMs?: number };
  const saved = resolver.firstTextMs;
  const rows = () => q(`select provider_id, outcome, paid from control.ai_usage_ledger order by attempt_id`);
  const sse = (events: unknown[], end: boolean, signal?: AbortSignal) =>
    new Response(
      new ReadableStream({
        start(c) {
          const enc = new TextEncoder();
          signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')));
          for (const e of events) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
          if (end) c.close();
        },
      }),
      { status: 200, headers: { 'content-type': 'text/event-stream' } }
    );
  const started = { type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 1 } } };
  const paidAs = (answer: (signal?: AbortSignal) => Response) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const host = new URL(String(url)).hostname;
        hosts.push(host);
        return host.includes('anthropic') ? answer(init?.signal ?? undefined) : workersOk();
      })
    );
  beforeEach(() => {
    resolver.firstTextMs = 300;
  });
  afterEach(() => {
    resolver.firstTextMs = saved;
  });

  it('the paid link says nothing in its first-text time: the normal chain answers; one failed paid row, one ok unpaid row, no hold', async () => {
    // A stream that starts and then never sends text (left open until the call is aborted).
    paidAs((signal) => sse([started], false, signal));
    const r = await run(PAYING);
    expect(r).toMatchObject({ ok: true, provider: 'workers-ai', text: 'From the free model.' });
    expect(await rows()).toEqual([
      { provider_id: 'anthropic', outcome: 'upstream_timeout', paid: true },
      { provider_id: 'workers-ai', outcome: 'ok', paid: false },
    ]);
    expect(await holds()).toBe(0);
    // The circuit counts the paid model's timeout as a failure.
    const h = await q(`select consecutive_failures from control.ai_provider_health where provider_id = 'anthropic' and model = 'claude-paid-model'`);
    expect(Number(h[0].consecutive_failures)).toBe(1);
    await q(`delete from control.ai_provider_health`);
  });

  it('the paid link errors: the normal chain answers, the same rows', async () => {
    paidAs(() => httpError(500));
    expect(await run(PAYING)).toMatchObject({ ok: true, provider: 'workers-ai' });
    expect(await rows()).toEqual([
      { provider_id: 'anthropic', outcome: 'upstream_unavailable', paid: true },
      { provider_id: 'workers-ai', outcome: 'ok', paid: false },
    ]);
    expect(await holds()).toBe(0);
    await q(`delete from control.ai_provider_health`);
  });

  it('the paid link shows some text then fails: no switch, the answer ends there', async () => {
    const shown: string[] = [];
    paidAs(() => sse([started, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'The sky ' } }], true));
    const r = await asFamily(PAYING, (tx) => streamText(tx as never, ctxOf(PAYING), 'family.resolver', ask, (t) => shown.push(t)));
    expect(r).toMatchObject({ ok: false, reason: 'failed' });
    expect(shown.join('')).toBe('The sky ');
    expect(hosts.every((h) => h.includes('anthropic'))).toBe(true);
    expect(await rows()).toEqual([{ provider_id: 'anthropic', outcome: 'cut_short', paid: true }]);
    expect(await holds()).toBe(0);
    await q(`delete from control.ai_provider_health`);
  });

  it('the paid link answers: the normal chain is never called', async () => {
    expect(await run(PAYING)).toMatchObject({ ok: true, provider: 'anthropic' });
    expect(hosts.every((h) => h.includes('anthropic'))).toBe(true);
    expect(await rows()).toEqual([{ provider_id: 'anthropic', outcome: 'ok', paid: true }]);
    expect(await holds()).toBe(0);
  });

  it('the paid window leaves the normal chain a real share of the deadline', () => {
    // The resolver and homework: one first-text wait (12 s), 28 s left for the normal chain.
    expect(paidWindowMs({ callMs: 40_000, firstTextMs: 12_000 })).toBe(12_000);
    // A short profile: the paid link is given less so the normal chain keeps 4 s.
    expect(paidWindowMs({ callMs: 10_000, firstTextMs: 6_000 })).toBe(6_000);
    expect(paidWindowMs({ callMs: 8_000, firstTextMs: 6_000 })).toBe(4_000);
    // Never zero: at least the 3 s floor, and never more than the deadline.
    expect(paidWindowMs({ callMs: 5_000, firstTextMs: 6_000 })).toBe(3_000);
    expect(paidWindowMs({ callMs: 2_000, firstTextMs: 6_000 })).toBe(2_000);
    // No first-text deadline: the deadline less one 15 s share, at least 15 s.
    expect(paidWindowMs({ callMs: 30_000, firstTextMs: null })).toBe(15_000);
    expect(paidWindowMs({ callMs: 20_000, firstTextMs: null })).toBe(15_000);
    expect(paidWindowMs({ callMs: 60_000, firstTextMs: null })).toBe(45_000);
  });
});
