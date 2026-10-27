import { randomBytes } from 'crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { prepareText, streamText, type AiContext, type AiRequest, type ProfileId } from '@/lib/ai/platform';
import { sealAiKey, aiEncryptionKey } from '@/lib/ai/credentials';
import { CIRCUIT_OPEN_AFTER } from '@/lib/ai/gateway/circuit';
import { classifyFailure } from '@/lib/ai/gateway/taxonomy';
import { rollbackRoute, setProfile } from '@/lib/ai/control';
import { anthropicOk, anthropicRefusal, httpError } from './streams';

// G2 (C370): routing reliability on the real migrations (PGlite). The failover taxonomy, the deadline, never stitching,
// the circuit breaker, the usage ledger and route revisions with rollback. Vendors are replaced at fetch. Each call
// runs as the role that runs it in production: family_app for a family's request, app_user for a school's job,
// nca_super for Control. Made-up people only.

const A = 'f3000000-0000-4000-8000-0000000000a1';
const SCHOOL_CTX = 'f3000000-0000-4000-8000-0000000000c1';
const FOUNDER = 'f3000000-0000-4000-8000-0000000000f1';
const ANTHROPIC_KEY = `sk-ant-${'a'.repeat(30)}WXYZ`;
const WORKERS_KEY = `${'c'.repeat(32)}:cfat_${'W'.repeat(36)}`;
const DAY = '2026-10-27';
const SECRET_QUESTION = 'Why is the sky blue, Asha?';

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
const asFamily = <T>(fn: (tx: Tx) => Promise<T>) => asRole('family_app', fn, [['app.current_account_id', A]]);
const q = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const refused = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return 'allowed';
  } catch (e) {
    return String((e as Error).message);
  }
};

const ctx: AiContext = { accountId: A, childFirstNames: ['Asha'], parentEmail: 'parent.g2@example.org', day: DAY };
const ask = (text = SECRET_QUESTION): AiRequest => ({ system: 'Explain for a Class 7 student.', messages: [{ role: 'user', content: text }] });
const run = (onDelta?: (t: string) => void) => asFamily((tx) => streamText(tx as never, ctx, 'family.resolver', ask(), onDelta));

type Call = { host: string; at: number };
let calls: Call[] = [];
let replies: (() => Response)[] = [];
const workersOk = (text = 'From the backup.') => new Response(JSON.stringify({ choices: [{ message: { content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 13, completion_tokens: 4 } }), { status: 200 });

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
const route = (profile: ProfileId, provider: string, model: string, fallback: unknown[] = []) =>
  q(`update control.ai_profiles set provider_id = $2, model = $3, fallback = $4::jsonb, enabled = true where profile_id = $1`, [profile, provider, model, JSON.stringify(fallback)]);
const ledger = () => q(`select profile_id, provider_id, model, route_position, outcome, streamed, tokens_in, tokens_out, latency_ms, revision_id, cost_usd from control.ai_usage_ledger order by attempt_id`);
const health = (provider: string, model: string) => q(`select state, consecutive_failures from control.ai_provider_health where provider_id = $1 and model = $2`, [provider, model]);

beforeAll(async () => {
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_CREDENTIALS_KEY_VERSION = '1';
  db = await startHarnessDb({ port: 0 });
  await q(`insert into family.accounts (account_id, email) values ($1, 'parent.g2@example.org')`, [A]);
  await q(`insert into family.children (account_id, first_name, class_level, board_id, language, style, state_code) values ($1, 'Asha', 7, 'CBSE', 'en', 'en', 'IN-UP')`, [A]);
  await q(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder')`, [FOUNDER]);
  await clear('anthropic');
  await clear('workers-ai');
  await sealInto('anthropic', ANTHROPIC_KEY);
  await sealInto('workers-ai', WORKERS_KEY);
}, 90_000);
afterAll(async () => {
  await db?.stop();
});

beforeEach(async () => {
  calls = [];
  replies = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push({ host: new URL(String(url)).hostname, at: Date.now() });
      const next = replies.shift();
      if (!next) throw new Error('no reply prepared');
      return next();
    })
  );
  await q(`delete from control.ai_usage_ledger`);
  await q(`delete from control.ai_provider_health`);
  await q(`delete from family.ai_daily`);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the taxonomy', () => {
  it('retryable: timeout, network, 429, quota, 404, 5xx, a broken stream before text; not: refusal, auth, bad request, anything after text', () => {
    const before = { streamed: false, timedOut: false };
    expect(classifyFailure({ failure: 'network' }, { streamed: false, timedOut: true })).toEqual({ outcome: 'upstream_timeout', retryable: true, circuit: 'failure' });
    expect(classifyFailure({ failure: 'network' }, before)).toMatchObject({ outcome: 'upstream_unavailable', retryable: true });
    for (const [status, outcome] of [[429, 'rate_limited'], [402, 'quota_exhausted'], [404, 'model_unavailable'], [500, 'upstream_unavailable'], [529, 'upstream_unavailable'], [504, 'upstream_timeout']] as const)
      expect(classifyFailure({ failure: 'http', status }, before)).toMatchObject({ outcome, retryable: true, circuit: 'failure' });
    expect(classifyFailure({ failure: 'bad_stream' }, before)).toMatchObject({ retryable: true });
    expect(classifyFailure({ failure: 'refused' }, before)).toEqual({ outcome: 'content_rejected', retryable: false, circuit: 'success' });
    expect(classifyFailure({ failure: 'http', status: 401 }, before)).toEqual({ outcome: 'auth_failed', retryable: false, circuit: 'neutral' });
    expect(classifyFailure({ failure: 'http', status: 400 }, before)).toEqual({ outcome: 'invalid_request', retryable: false, circuit: 'neutral' });
    expect(classifyFailure({ failure: 'bad_stream' }, { streamed: true, timedOut: false })).toMatchObject({ outcome: 'cut_short', retryable: false });
    expect(classifyFailure({ failure: 'network' }, { streamed: true, timedOut: true })).toMatchObject({ outcome: 'cut_short', retryable: false });
    expect(classifyFailure({ failure: 'something_new' }, before)).toMatchObject({ outcome: 'unknown_provider_error', retryable: false });
  });
});

describe('failover', () => {
  it('a Primary timeout: Backup 1 answers within the route’s deadline; two ledger rows, no text in them', async () => {
    // AI marking's page reading (callMs 90 s), as a school's marking job runs it (app_user).
    await route('exams.read_pages', 'anthropic', 'test-model-a', [{ provider: 'workers-ai', model: 'test-model-b' }]);
    const school = (fn: (tx: Tx) => Promise<unknown>) => asRole('app_user', fn, [['app.current_tenant_id', SCHOOL_CTX], ['app.current_role', 'system']]);
    const prepared = (await school((tx) => prepareText(tx as never, ctx, 'exams.read_pages', ask()))) as Awaited<ReturnType<typeof prepareText>>;
    if (!prepared.ok) throw new Error(prepared.reason);
    const T0 = Date.parse('2026-10-27T10:00:00Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    // The Primary runs out its whole time (the route's 90 s less 15 s kept for the backup), then is aborted.
    replies.push(
      () => {
        vi.setSystemTime(Date.now() + 75_000);
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      },
      () => workersOk()
    );
    const sent = await prepared.text.send();
    const ended = Date.now();
    vi.useRealTimers();
    await school((tx) => sent.record(tx as never));

    expect(sent.result).toMatchObject({ ok: true, text: 'From the backup.', provider: 'workers-ai', model: 'test-model-b' });
    expect(calls.map((c) => c.host)).toEqual(['api.anthropic.com', 'api.cloudflare.com']);
    expect(calls[1].at - T0).toBeLessThan(90_000);
    expect(ended - T0).toBeLessThan(90_000);
    const rows = await ledger();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ profile_id: 'exams.read_pages', provider_id: 'anthropic', route_position: 0, outcome: 'upstream_timeout', streamed: false, cost_usd: null });
    expect(rows[0].latency_ms).toBeGreaterThanOrEqual(75_000);
    expect(rows[1]).toMatchObject({ provider_id: 'workers-ai', route_position: 1, outcome: 'ok', tokens_out: 4, cost_usd: null });
    const [{ revision_id }] = await q(`select revision_id from control.ai_profiles where profile_id = 'exams.read_pages'`);
    expect(rows.every((r: { revision_id: unknown }) => String(r.revision_id) === String(revision_id))).toBe(true);
    // No prompt, answer, name or key anywhere in the ledger or the circuits.
    const everything = JSON.stringify([await q(`select * from control.ai_usage_ledger`), await q(`select * from control.ai_provider_health`)]);
    for (const secret of ['sky', 'Asha', 'From the backup', 'parent.g2', 'sk-ant', 'cfat_', 'Class 7']) expect(everything).not.toContain(secret);
    expect(await health('anthropic', 'test-model-a')).toEqual([{ state: 'closed', consecutive_failures: 1 }]);
  });

  it('a safety refusal from the Primary is returned: the backup is not called', async () => {
    await route('family.resolver', 'anthropic', 'test-model-a', [{ provider: 'workers-ai', model: 'test-model-b' }]);
    replies.push(() => anthropicRefusal(), () => workersOk('Should never be asked.'));
    expect(await run()).toEqual({ ok: false, reason: 'failed' });
    expect(calls.map((c) => c.host)).toEqual(['api.anthropic.com']);
    expect(await ledger()).toEqual([expect.objectContaining({ provider_id: 'anthropic', route_position: 0, outcome: 'content_rejected' })]);
    // A refusal is an answer: the provider is up.
    expect(await health('anthropic', 'test-model-a')).toEqual([{ state: 'closed', consecutive_failures: 0 }]);
  });

  it('a wrong key (401) is not passed on to the backup either', async () => {
    await route('family.resolver', 'anthropic', 'test-model-a', [{ provider: 'workers-ai', model: 'test-model-b' }]);
    replies.push(() => httpError(401), () => workersOk());
    expect(await run()).toEqual({ ok: false, reason: 'failed' });
    expect(calls).toHaveLength(1);
    expect((await ledger())[0]).toMatchObject({ outcome: 'auth_failed' });
  });

  it('once text has streamed, a failure does not switch models: nothing is stitched', async () => {
    await route('family.resolver', 'anthropic', 'test-model-a', [{ provider: 'workers-ai', model: 'test-model-b' }]);
    replies.push(
      () => new Response('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Half"}}\n\n', { status: 200 }),
      () => workersOk('Another model’s words.')
    );
    const pieces: string[] = [];
    expect(await run((p) => pieces.push(p))).toEqual({ ok: false, reason: 'failed' });
    expect(pieces).toEqual(['Half']);
    expect(calls).toHaveLength(1);
    expect(await ledger()).toEqual([expect.objectContaining({ provider_id: 'anthropic', outcome: 'cut_short', streamed: true })]);
  });
});

describe('the circuit breaker', () => {
  it(`opens after ${CIRCUIT_OPEN_AFTER} retryable failures in a row; the provider is skipped while open; one half-open trial after the cool-down`, async () => {
    await route('family.resolver', 'anthropic', 'test-model-a');
    for (let i = 0; i < CIRCUIT_OPEN_AFTER; i++) {
      replies.push(() => httpError(503));
      expect(await run()).toEqual({ ok: false, reason: 'failed' });
    }
    expect(await health('anthropic', 'test-model-a')).toEqual([{ state: 'open', consecutive_failures: CIRCUIT_OPEN_AFTER }]);

    // Open, with no backup: nothing is sent, no family cap place is taken, the skip is in the ledger.
    calls = [];
    const capBefore = await q(`select requests from family.ai_daily`);
    expect(await run()).toEqual({ ok: false, reason: 'failed' });
    expect(calls).toHaveLength(0);
    expect(await q(`select requests from family.ai_daily`)).toEqual(capBefore);
    expect((await ledger()).at(-1)).toMatchObject({ provider_id: 'anthropic', outcome: 'skipped_open_circuit', latency_ms: null });

    // Open, with a backup: straight to the backup.
    await route('family.resolver', 'anthropic', 'test-model-a', [{ provider: 'workers-ai', model: 'test-model-b' }]);
    replies.push(() => workersOk());
    expect(await run()).toMatchObject({ ok: true, provider: 'workers-ai' });
    expect(calls.map((c) => c.host)).toEqual(['api.cloudflare.com']);
    expect((await ledger()).slice(-2).map((r: { outcome: string }) => r.outcome)).toEqual(['skipped_open_circuit', 'ok']);

    // After the cool-down: one trial. A failure opens it again for another cool-down.
    await q(`update control.ai_provider_health set opened_at = now() - interval '2 minutes' where provider_id = 'anthropic'`);
    calls = [];
    replies.push(() => httpError(500), () => workersOk());
    expect(await run()).toMatchObject({ ok: true, provider: 'workers-ai' });
    expect(calls.map((c) => c.host)).toEqual(['api.anthropic.com', 'api.cloudflare.com']);
    expect((await q(`select state from control.ai_provider_health where provider_id = 'anthropic'`))[0].state).toBe('open');

    // Another cool-down, a trial that answers: closed again.
    await q(`update control.ai_provider_health set opened_at = now() - interval '2 minutes' where provider_id = 'anthropic'`);
    calls = [];
    replies.push(() => anthropicOk(['Back again.']));
    expect(await run()).toMatchObject({ ok: true, provider: 'anthropic', text: 'Back again.' });
    expect(await health('anthropic', 'test-model-a')).toEqual([{ state: 'closed', consecutive_failures: 0 }]);
  });

  it('a half-open trial is given to one request at a time', async () => {
    await q(`insert into control.ai_provider_health (provider_id, model, state, consecutive_failures, opened_at) values ('anthropic', 'test-model-a', 'open', 5, now() - interval '2 minutes')`);
    const gates = await asFamily(async (tx) => [
      (await tx.query(`select control.ai_circuit_admit('anthropic', 'test-model-a', 60) as g`)).rows[0].g,
      (await tx.query(`select control.ai_circuit_admit('anthropic', 'test-model-a', 60) as g`)).rows[0].g,
    ]);
    expect(gates).toEqual(['trial', 'open']);
  });
});

describe('route revisions and rollback', () => {
  const byFounder = { userId: FOUNDER };
  const asControl = <T>(fn: (tx: Tx) => Promise<T>) => asRole('nca_super', fn);

  it('each save is a revision; rollback restores the previous one as a new revision with its audit row', async () => {
    const settings = (model: string) => ({ providerId: 'anthropic', model, promptVersion: 'v1', enabled: true, fallback: [] });
    expect(await asControl((tx) => setProfile(tx as never, byFounder, 'content.prepare', settings('test-model-one')))).toEqual({ ok: true });
    expect(await asControl((tx) => setProfile(tx as never, byFounder, 'content.prepare', settings('test-model-two')))).toEqual({ ok: true });
    const [two, one] = await q(`select revision_id, model, activation from control.ai_route_revisions where profile_id = 'content.prepare' order by revision_id desc limit 2`);
    expect([two.model, one.model]).toEqual(['test-model-two', 'test-model-one']);

    expect(await asControl((tx) => rollbackRoute(tx as never, byFounder, 'content.prepare'))).toEqual({ ok: true });
    const [now] = await q(`select revision_id, model, activation, rollback_of, activated_by from control.ai_route_revisions where profile_id = 'content.prepare' order by revision_id desc limit 1`);
    expect(now).toMatchObject({ model: 'test-model-one', activation: 'rollback', rollback_of: one.revision_id, activated_by: FOUNDER });
    expect(await q(`select model, revision_id from control.ai_profiles where profile_id = 'content.prepare'`)).toEqual([{ model: 'test-model-one', revision_id: now.revision_id }]);
    const [audit] = await q(`select event_action, before_state, after_state from audit_log where event_action = 'ai.profile_changed' order by audit_id desc limit 1`);
    expect(audit).toMatchObject({ before_state: { model: 'test-model-two' }, after_state: { model: 'test-model-one', rollbackOf: String(one.revision_id) } });
  });

  it('a revision that is not this profile’s, or none before the first: nothing changes', async () => {
    const [other] = await q(`select revision_id from control.ai_route_revisions where profile_id = 'family.resolver' order by revision_id limit 1`);
    const before = await q(`select count(*)::int as n from control.ai_route_revisions`);
    expect(await asRole('nca_super', (tx) => rollbackRoute(tx as never, byFounder, 'content.prepare', String(other.revision_id)))).toEqual({ ok: false, code: 'no_revision' });
    expect(await q(`select count(*)::int as n from control.ai_route_revisions`)).toEqual(before);
  });
});

describe('rights', () => {
  it('revisions and the ledger cannot be changed or removed by any session role, the owner included for revisions', async () => {
    for (const role of ['nca_super', 'app_user', 'family_app']) {
      expect(await refused(() => asRole(role, (tx) => tx.query(`update control.ai_route_revisions set model = 'x'`)))).toMatch(/permission denied/);
      expect(await refused(() => asRole(role, (tx) => tx.query(`delete from control.ai_route_revisions`)))).toMatch(/permission denied/);
      expect(await refused(() => asRole(role, (tx) => tx.query(`update control.ai_usage_ledger set outcome = 'ok'`)))).toMatch(/permission denied/);
      expect(await refused(() => asRole(role, (tx) => tx.query(`delete from control.ai_usage_ledger`)))).toMatch(/permission denied/);
      expect(await refused(() => asRole(role, (tx) => tx.query(`insert into control.ai_route_revisions (profile_id, fallback, prompt_version, max_output_tokens, enabled, activation) values ('family.resolver', '[]', 'v1', 100, true, 'set')`)))).toMatch(/permission denied/);
      expect(await refused(() => asRole(role, (tx) => tx.query(`update control.ai_provider_health set state = 'closed'`)))).toMatch(/permission denied/);
    }
    expect(await refused(() => q(`delete from control.ai_route_revisions`))).toMatch(/never changed or removed/);
    expect(await refused(() => q(`update control.ai_route_revisions set model = 'x'`))).toMatch(/never changed or removed/);
  });

  it('families and schools read none of the three; Control reads them', async () => {
    for (const role of ['app_user', 'family_app']) {
      for (const t of ['ai_route_revisions', 'ai_provider_health', 'ai_usage_ledger']) expect(await refused(() => asRole(role, (tx) => tx.query(`select * from control.${t}`)))).toMatch(/permission denied/);
    }
    for (const t of ['ai_route_revisions', 'ai_provider_health', 'ai_usage_ledger']) expect(await refused(() => asRole('nca_super', (tx) => tx.query(`select * from control.${t} limit 1`)))).toBe('allowed');
  });

  it('the new functions: no right for anon, authenticated, service_role or PUBLIC; the row rules are callable by nobody', async () => {
    const fns = await q(
      `select p.proname, r.rolname from pg_proc p cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) r
        where p.pronamespace = 'control'::regnamespace and p.proname in ('ai_circuit_admit', 'record_ai_attempt', 'ai_profile_revision', 'ai_route_revisions_fixed') and has_function_privilege(r.rolname, p.oid, 'EXECUTE')`
    );
    expect(fns).toEqual([]);
    const toPublic = await q(
      `select p.proname from pg_proc p where p.pronamespace = 'control'::regnamespace and p.proname in ('ai_circuit_admit', 'record_ai_attempt', 'ai_profile_revision', 'ai_route_revisions_fixed') and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))`
    );
    expect(toPublic).toEqual([]);
    expect(await refused(() => asFamily((tx) => tx.query(`select control.ai_profile_revision()`)))).toMatch(/permission denied|trigger/);
  });

  it('the attempt writer takes only known outcomes and circuit effects', async () => {
    expect(await refused(() => asFamily((tx) => tx.query(`select control.record_ai_attempt('${DAY}', 'family.resolver', 'anthropic', 'm', null, 0, 'made_up', 1, 0, 0, false, 'none', 5)`)))).toMatch(/check constraint/);
    expect(await refused(() => asFamily((tx) => tx.query(`select control.record_ai_attempt('${DAY}', 'family.resolver', 'anthropic', 'm', null, 0, 'ok', 1, 0, 0, false, 'reset', 5)`)))).toMatch(/unknown circuit effect/);
  });
});
