import { randomBytes, randomUUID } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// M1-3 (C249): Control → AI's route on the real migrations (PGlite). Only the connection is replaced: the route's own
// platform helper runs on the test database as nca_super, as in production. Who is let in (the founder with the
// authenticator only), that a key is written but never read back, that each change is audited without the key and
// can be undone in one step, and that the minors check holds when choosing a provider. Made-up people only.

const h = vi.hoisted(() => ({ db: null as unknown as { pg: { transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>; query: (sql: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }; stop: () => Promise<void> } }));

vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  const run = (fn: (db: unknown) => Promise<unknown>) =>
    h.db.pg.transaction(async (tx) => {
      await (tx as { query: (s: string) => Promise<unknown> }).query('set local role nca_super');
      return fn(tx);
    });
  return { ...real, withPlatformService: run, withTenantContext: (_c: unknown, fn: (db: unknown) => Promise<unknown>) => run(fn) };
});

// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { STEP_UP_COOKIE, STEP_UP_TTL_SECONDS } from '@/lib/auth/step-up';
import { signStepUpToken } from '@/lib/auth/jwt';
import { GET, POST } from '@/app/api/control/ai/route';

const FOUNDER = randomUUID();
const PRINCIPAL = randomUUID();
const SCHOOL = randomUUID();
const KEY = `sk-ant-${'k'.repeat(36)}LAST`;
const q = async (sql: string, params: unknown[] = []) => (await h.db.pg.query(sql, params)).rows;

function req(body?: unknown, cookie?: string): NextRequest {
  return new NextRequest('https://www.netcyberai.test/api/control/ai', {
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
}
async function cookieFor(sub: string, role: string, schoolId: string | null, aal: 'aal1' | 'aal2') {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal, sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
let founder = '';
let founderNoStepUp: string;
let founderAal1 = '';
let principal = '';
const post = async (body: unknown, cookie = founder) => {
  const res = await POST(req(body, cookie));
  return { status: res.status, body: await res.json() };
};

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-ai-control-route-tests-0123456789';
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  h.db = await startHarnessDb({ port: 0 });
  await q(`insert into schools (school_id, name, jurisdiction) values ($1, 'Made-up School', 'IN-HR')`, [SCHOOL]);
  await q(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder'), ($2, $3, 'principal', 'Priya Principal')`, [FOUNDER, PRINCIPAL, SCHOOL]);
  founderNoStepUp = await cookieFor(FOUNDER, 'super_admin', null, 'aal2');
  // The founder stepped up in the last 15 minutes (F1-1b): saving a key needs it.
  founder = `${founderNoStepUp}; ${STEP_UP_COOKIE}=${await signStepUpToken(FOUNDER, 0, STEP_UP_TTL_SECONDS)}`;
  founderAal1 = await cookieFor(FOUNDER, 'super_admin', null, 'aal1');
  principal = await cookieFor(PRINCIPAL, 'principal', SCHOOL, 'aal1');
}, 90_000);
afterAll(async () => {
  await h.db?.stop();
});
beforeEach(() => {
  process.env.AI_CREDENTIALS_KEY ??= randomBytes(32).toString('base64');
});

describe('who is let in', () => {
  it('no session, a school session, and the founder without the authenticator are refused', async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req(undefined, principal))).status).toBe(403);
    expect((await post({ action: 'cap', value: 5 }, principal)).status).toBe(403);
    const weak = await post({ action: 'cap', value: 5 }, founderAal1);
    expect(weak).toEqual({ status: 403, body: expect.objectContaining({ code: 'aal2' }) });
    expect((await GET(req(undefined, founderAal1))).status).toBe(403);
    expect(await q(`select value from control.settings where key = 'family.ai.daily_requests'`)).toEqual([{ value: 20 }]);
  });

  it('the founder with the authenticator reads the page’s data', async () => {
    const res = await GET(req(undefined, founder));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keyReady).toBe(true);
    expect(body.providers.map((p: { providerId: string }) => p.providerId)).toEqual(['anthropic', 'openai', 'youtube']);
    expect(body.profiles).toEqual([
      expect.objectContaining({ profileId: 'copilot.draft', carriesChildWords: false, providerId: null, enabled: true }),
      expect.objectContaining({ profileId: 'family.homework', carriesChildWords: true, providerId: null, enabled: true }),
      expect.objectContaining({ profileId: 'family.resolver', carriesChildWords: true, providerId: null, enabled: true }),
      expect.objectContaining({ profileId: 'family.voice_input', carriesChildWords: true, providerId: null, enabled: true }),
      expect.objectContaining({ profileId: 'parent_ai.home_help', carriesChildWords: false, providerId: null, enabled: true }),
    ]);
    expect(body.cap).toBe(20);
  });
});

describe('a key: write-only', () => {
  it('saving or replacing a key asks for the authenticator again first (F1-1b); other changes do not', async () => {
    const r = await post({ action: 'credential', providerId: 'anthropic', apiKey: 'sk-ant-test-only-0123456789abcdef' }, founderNoStepUp);
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'step_up_required', method: 'authenticator' });
    expect((await post({ action: 'cap', value: 2000 }, founderNoStepUp)).body.error).not.toBe('step_up_required');
  });

  it('is sealed, shown only by its last four characters, audited without it, and never sent back', async () => {
    expect(await post({ action: 'credential', providerId: 'anthropic', apiKey: KEY })).toEqual({ status: 200, body: { ok: true } });
    const stored = await q(`select ciphertext, key_last4, set_by from control.ai_credentials where provider_id = 'anthropic'`);
    expect(stored).toEqual([{ ciphertext: expect.any(String), key_last4: 'LAST', set_by: FOUNDER }]);
    expect(String(stored[0].ciphertext)).not.toContain('sk-ant');
    const res = await GET(req(undefined, founder));
    const text = await res.text();
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(String(stored[0].ciphertext));
    expect(JSON.parse(text).providers[0].credential).toEqual({ keyLast4: 'LAST', setAt: expect.any(String), setByName: 'Farid Founder', testedAt: null, testOk: null });
    const audit = await q(`select school_id, actor_role, before_state, after_state from audit_log where event_action = 'ai.credential_set'`);
    expect(audit).toEqual([{ school_id: null, actor_role: 'super_admin', before_state: { providerId: 'anthropic', had: false }, after_state: { providerId: 'anthropic', had: true, keyLast4: 'LAST' } }]);
    expect(JSON.stringify(audit)).not.toContain(KEY);
  });

  it('a key of the wrong shape is refused', async () => {
    expect(await post({ action: 'credential', providerId: 'anthropic', apiKey: 'hello' })).toEqual({ status: 400, body: expect.objectContaining({ code: 'key_format' }) });
  });

  it('with no server key, saving is refused plainly and the page says so', async () => {
    const saved = process.env.AI_CREDENTIALS_KEY;
    delete process.env.AI_CREDENTIALS_KEY;
    try {
      expect(await post({ action: 'credential', providerId: 'openai', apiKey: `sk-${'o'.repeat(30)}` })).toEqual({ status: 409, body: expect.objectContaining({ code: 'no_encryption_key' }) });
      expect((await (await GET(req(undefined, founder))).json()).keyReady).toBe(false);
    } finally {
      process.env.AI_CREDENTIALS_KEY = saved;
    }
  });

  it('adding a key where there was none can be undone (the key is removed)', async () => {
    const [row] = await q(`select audit_id from audit_log where event_action = 'ai.credential_set' order by audit_id desc limit 1`);
    expect(await post({ action: 'undo', auditId: String(row.audit_id) })).toEqual({ status: 200, body: { ok: true } });
    expect(await q(`select * from control.ai_credentials`)).toHaveLength(0);
    // Put it back for what follows; replacing a key cannot be undone (the earlier one was never kept).
    await post({ action: 'credential', providerId: 'anthropic', apiKey: KEY });
    await post({ action: 'credential', providerId: 'anthropic', apiKey: KEY.replace('LAST', 'NEW2') });
    const [replaced] = await q(`select audit_id from audit_log where event_action = 'ai.credential_set' order by audit_id desc limit 1`);
    expect(await post({ action: 'undo', auditId: String(replaced.audit_id) })).toEqual({ status: 400, body: expect.objectContaining({ code: 'cannot_restore_key' }) });
  });
});

describe('the minors check when choosing a provider', () => {
  it('a child-words profile cannot be moved to a provider not cleared for minors', async () => {
    const res = await post({ action: 'profile', profileId: 'family.resolver', providerId: 'openai', model: 'test-model-b', promptVersion: 'v1', enabled: true });
    expect(res).toEqual({ status: 400, body: expect.objectContaining({ code: 'not_cleared_for_minors' }) });
    expect(await q(`select provider_id from control.ai_profiles where profile_id = 'family.resolver'`)).toEqual([{ provider_id: null }]);
  });

  it('clearing needs the terms page; then the profile can use it; withdrawing is refused while it is used', async () => {
    expect(await post({ action: 'clearance', providerId: 'anthropic', cleared: true, termsUrl: 'not a page' })).toEqual({ status: 400, body: expect.objectContaining({ code: 'terms_url' }) });
    expect(await post({ action: 'clearance', providerId: 'anthropic', cleared: true, termsUrl: 'https://example.org/terms-read' })).toEqual({ status: 200, body: { ok: true } });
    expect(await post({ action: 'profile', profileId: 'family.resolver', providerId: 'anthropic', model: 'test-model-a', promptVersion: 'v1', enabled: true })).toEqual({ status: 200, body: { ok: true } });
    expect(await post({ action: 'clearance', providerId: 'anthropic', cleared: false })).toEqual({ status: 400, body: expect.objectContaining({ code: 'in_use' }) });
    const fallback = await post({ action: 'profile', profileId: 'family.resolver', providerId: 'anthropic', model: 'test-model-a', promptVersion: 'v1', enabled: true, fallback: [{ provider: 'openai', model: 'test-model-b' }] });
    expect(fallback).toEqual({ status: 400, body: expect.objectContaining({ code: 'not_cleared_for_minors' }) });
  });
});

describe('every change is audited and undone in one step', () => {
  it('a profile change: before and after with ids only, and undo restores it', async () => {
    expect(await post({ action: 'profile', profileId: 'family.resolver', providerId: 'anthropic', model: 'test-model-c', promptVersion: 'v2', enabled: false })).toEqual({ status: 200, body: { ok: true } });
    const [row] = await q(`select audit_id, before_state, after_state from audit_log where event_action = 'ai.profile_changed' order by audit_id desc limit 1`);
    expect(row.before_state).toEqual({ providerId: 'anthropic', model: 'test-model-a', promptVersion: 'v1', enabled: true, fallback: [] });
    expect(row.after_state).toEqual({ providerId: 'anthropic', model: 'test-model-c', promptVersion: 'v2', enabled: false, fallback: [] });
    expect(await post({ action: 'undo', auditId: String(row.audit_id) })).toEqual({ status: 200, body: { ok: true } });
    expect(await q(`select provider_id, model, prompt_version, enabled from control.ai_profiles where profile_id = 'family.resolver'`)).toEqual([{ provider_id: 'anthropic', model: 'test-model-a', prompt_version: 'v1', enabled: true }]);
  });

  it('the daily cap, and its undo', async () => {
    expect(await post({ action: 'cap', value: 5 })).toEqual({ status: 200, body: { ok: true } });
    expect(await post({ action: 'cap', value: -1 })).toEqual({ status: 400, body: expect.objectContaining({ code: 'cap' }) });
    expect(await q(`select value from control.settings where key = 'family.ai.daily_requests'`)).toEqual([{ value: 5 }]);
    const [row] = await q(`select audit_id from audit_log where event_action = 'ai.cap_changed' order by audit_id desc limit 1`);
    await post({ action: 'undo', auditId: String(row.audit_id) });
    expect(await q(`select value from control.settings where key = 'family.ai.daily_requests'`)).toEqual([{ value: 20 }]);
  });

  it('a clearance, and its undo; the page lists the changes; no row anywhere carries the key', async () => {
    await post({ action: 'profile', profileId: 'family.resolver', providerId: null, model: null, promptVersion: 'v1', enabled: false });
    expect(await post({ action: 'clearance', providerId: 'anthropic', cleared: false })).toEqual({ status: 200, body: { ok: true } });
    const [row] = await q(`select audit_id from audit_log where event_action = 'ai.provider_clearance' order by audit_id desc limit 1`);
    await post({ action: 'undo', auditId: String(row.audit_id) });
    expect(await q(`select cleared_for_minors, cleared_terms_url from control.ai_providers where provider_id = 'anthropic'`)).toEqual([{ cleared_for_minors: true, cleared_terms_url: 'https://example.org/terms-read' }]);
    const page = await (await GET(req(undefined, founder))).json();
    expect(page.changes.length).toBeGreaterThan(5);
    expect(JSON.stringify(await q(`select before_state, after_state from audit_log where event_action like 'ai.%'`))).not.toMatch(/sk-ant/);
    expect(await post({ action: 'undo', auditId: '999999' })).toEqual({ status: 400, body: expect.objectContaining({ code: 'not_found' }) });
  });
});
