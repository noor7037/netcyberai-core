import { randomBytes, randomUUID } from 'crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { aiEncryptionKey, unsealAiKey } from '@/lib/ai/credentials';
import { endpointNet, type Resolved } from '@/lib/ai/adapters/endpoint-guard';

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
    expect(body.providers.map((p: { providerId: string }) => p.providerId)).toEqual(['anthropic', 'gemini', 'openai', 'openai_compatible', 'vertex_ai', 'workers-ai', 'youtube']);
    expect(body.profiles).toEqual([
      // Control's two staff tools start on Workers AI (C313); nothing runs until its key is entered.
      expect.objectContaining({ profileId: 'content.prepare', carriesChildWords: false, providerId: 'workers-ai', model: '@cf/meta/llama-4-scout-17b-16e-instruct', enabled: true }),
      expect.objectContaining({ profileId: 'content.syllabus_extract', carriesChildWords: false, providerId: 'workers-ai', enabled: true }),
      expect.objectContaining({ profileId: 'copilot.draft', carriesChildWords: false, providerId: null, enabled: true }),
      // AI answer-sheet marking (C349): both read children's answer sheets; off, with no provider, until the founder chooses.
      expect.objectContaining({ profileId: 'exams.mark', carriesChildWords: true, providerId: null, enabled: false, usesPrompt: true }),
      expect.objectContaining({ profileId: 'exams.read_pages', carriesChildWords: true, providerId: null, enabled: false, usesPrompt: true }),
      // Writing a paper's questions (C363): no child's words; starts on Workers AI, as the marking tasks do on the test site.
      expect.objectContaining({ profileId: 'exams.write_questions', carriesChildWords: false, providerId: 'workers-ai', model: '@cf/meta/llama-4-scout-17b-16e-instruct', enabled: true, usesPrompt: true }),
      // The live English tutor's replies (E1, C382): a child's words; no provider until the founder chooses one.
      expect.objectContaining({ profileId: 'family.english_conversation', carriesChildWords: true, providerId: null, enabled: true, usesPrompt: true }),
      expect.objectContaining({ profileId: 'family.homework', carriesChildWords: true, providerId: null, enabled: true }),
      // The safety check (C314): chosen by the founder after clearing Workers AI.
      expect.objectContaining({ profileId: 'family.moderation', carriesChildWords: true, providerId: null, enabled: true }),
      expect.objectContaining({ profileId: 'family.resolver', carriesChildWords: true, providerId: null, enabled: true }),
      // C230-AB: a parent's photos of a book's contents pages (titles, never a child's words) start on Workers AI.
      expect.objectContaining({ profileId: 'family.syllabus_extract', carriesChildWords: false, providerId: 'workers-ai', model: '@cf/meta/llama-4-scout-17b-16e-instruct', enabled: true }),
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

  it("Cloudflare's key in two boxes (C317): each part checked with its own message, kept as one key", async () => {
    const ACCOUNT = '0123456789abcdef0123456789abcdef';
    const TOKEN = `cfut_${'T'.repeat(40)}`;
    const save = (accountId: string, token: string) => post({ action: 'credential', providerId: 'workers-ai', accountId, token });
    expect(await save('my-account', TOKEN)).toEqual({ status: 400, body: expect.objectContaining({ code: 'account_id_format' }) });
    expect(await save(ACCOUNT, 'short')).toEqual({ status: 400, body: expect.objectContaining({ code: 'token_format' }) });
    // What copying brings along is cleaned: capitals in the id, quotes, and the "Bearer " of Cloudflare's test command.
    expect(await save(` ${ACCOUNT.toUpperCase()} `, `"Bearer ${TOKEN}"`)).toEqual({ status: 200, body: { ok: true } });
    const [row] = await q(`select ciphertext, iv, tag, key_version, key_last4 from control.ai_credentials where provider_id = 'workers-ai'`);
    expect(unsealAiKey(aiEncryptionKey()!, 'workers-ai', row as never)).toBe(`${ACCOUNT}:${TOKEN}`);
    expect(row.key_last4).toBe('TTTT');
    // Leave the later tests the state they expect.
    await q(`delete from control.ai_credentials where provider_id = 'workers-ai'`);
    await q(`delete from audit_log where event_action = 'ai.credential_set' and target_id = 'workers-ai'`);
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

describe('Control’s switch is the one gate for children’s words (C368)', () => {
  it('Gemini: refused until cleared; once the founder clears it, AI marking’s reading accepts it; the audit row names him', async () => {
    const readPages = { action: 'profile', profileId: 'exams.read_pages', providerId: 'gemini', model: 'gemini-2.5-flash', promptVersion: 'v2', enabled: false };
    expect(await post(readPages)).toEqual({ status: 400, body: expect.objectContaining({ code: 'not_cleared_for_minors' }) });
    const page = await (await GET(req(undefined, founder))).json();
    expect(page.providers.find((p: { providerId: string }) => p.providerId === 'gemini')).toMatchObject({ hasAdapter: true, termsNote: 'adults_only', clearedForMinors: false });
    expect(await post({ action: 'clearance', providerId: 'gemini', cleared: true, termsUrl: 'https://ai.google.dev/gemini-api/terms' })).toEqual({ status: 200, body: { ok: true } });
    const [audit] = await q(`select actor_user_id, after_state from audit_log where event_action = 'ai.provider_clearance' and target_id = 'gemini' order by audit_id desc limit 1`);
    expect(audit.actor_user_id).toBe(FOUNDER);
    expect(audit.after_state).toMatchObject({ providerId: 'gemini', cleared: true, clearedBy: FOUNDER, termsUrl: 'https://ai.google.dev/gemini-api/terms' });
    expect(await post(readPages)).toEqual({ status: 200, body: { ok: true } });
    expect(await q(`select provider_id, model from control.ai_profiles where profile_id = 'exams.read_pages'`)).toEqual([{ provider_id: 'gemini', model: 'gemini-2.5-flash' }]);
    const after = await (await GET(req(undefined, founder))).json();
    expect(after.providers.find((p: { providerId: string }) => p.providerId === 'gemini')).toMatchObject({ clearedForMinors: true, clearedByName: 'Farid Founder' });
    // An uncleared provider is still refused for a child-words profile (OpenAI is not cleared here).
    expect(await post({ ...readPages, providerId: 'openai', model: 'test-model-b' })).toEqual({ status: 400, body: expect.objectContaining({ code: 'not_cleared_for_minors' }) });
    // Put back as the other tests expect it.
    await post({ ...readPages, providerId: null, model: null });
    expect(await post({ action: 'clearance', providerId: 'gemini', cleared: false })).toEqual({ status: 200, body: { ok: true } });
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

  it('G2 (C370): every save and undo is a route revision; rollback activates the previous one again, as a new revision, audited; the page reads them', async () => {
    const revisions = async () => q(`select revision_id, model, activation, rollback_of, activated_by from control.ai_route_revisions where profile_id = 'family.resolver' order by revision_id desc limit 3`);
    expect(await post({ action: 'profile', profileId: 'family.resolver', providerId: 'anthropic', model: 'test-model-d', promptVersion: 'v1', enabled: true })).toEqual({ status: 200, body: { ok: true } });
    const [saved, before] = await revisions();
    expect(saved).toMatchObject({ model: 'test-model-d', activation: 'set', rollback_of: null, activated_by: FOUNDER });
    expect(await post({ action: 'rollback', profileId: 'family.resolver' })).toEqual({ status: 200, body: { ok: true } });
    const [rolled] = await revisions();
    expect(rolled).toMatchObject({ model: before.model, activation: 'rollback', rollback_of: before.revision_id, activated_by: FOUNDER });
    expect(await q(`select model, revision_id from control.ai_profiles where profile_id = 'family.resolver'`)).toEqual([{ model: before.model, revision_id: rolled.revision_id }]);
    const [audit] = await q(`select after_state from audit_log where event_action = 'ai.profile_changed' order by audit_id desc limit 1`);
    expect(audit.after_state).toMatchObject({ model: before.model, rollbackOf: String(before.revision_id) });
    expect(await post({ action: 'rollback', profileId: 'family.resolver', revisionId: '999999' })).toEqual({ status: 400, body: expect.objectContaining({ code: 'no_revision' }) });
    expect(await post({ action: 'rollback', profileId: 'no.such_profile' })).toEqual({ status: 400, body: expect.objectContaining({ code: 'profile' }) });
    const page = await (await GET(req(undefined, founder))).json();
    expect(page.routing.revisions[0]).toMatchObject({ profileId: 'family.resolver', activation: 'rollback', active: true, activatedByName: 'Farid Founder' });
    expect(Array.isArray(page.routing.health) && Array.isArray(page.routing.ledger)).toBe(true);
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

// ---- G1 (C369): the OpenAI-compatible adapter's address, capabilities, and the new adapters' key tests -------------

describe('the founder’s address for the OpenAI-compatible adapter (G1)', () => {
  const COMPAT_KEY = `ck-${'C'.repeat(30)}KEYC`;
  const resolvesTo = (...addresses: string[]) => vi.spyOn(endpointNet, 'lookup').mockImplementation(async () => addresses.map((a): Resolved => ({ address: a, family: a.includes(':') ? 6 : 4 })));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('asks for the authenticator again, like a key', async () => {
    resolvesTo('8.8.4.4');
    const r = await post({ action: 'endpoint', providerId: 'openai_compatible', baseUrl: 'https://llm.example.com/v1' }, founderNoStepUp);
    expect(r).toEqual({ status: 403, body: { error: 'step_up_required', method: 'authenticator' } });
  });

  it('refuses http, a name or password, a private or metadata address, and a name that resolves inside; nothing is saved', async () => {
    const save = (baseUrl: string) => post({ action: 'endpoint', providerId: 'openai_compatible', baseUrl });
    expect(await save('http://llm.example.com/v1')).toEqual({ status: 400, body: expect.objectContaining({ code: 'base_url' }) });
    expect(await save('https://u:p@llm.example.com/v1')).toEqual({ status: 400, body: expect.objectContaining({ code: 'base_url' }) });
    expect(await save('https://metadata.google.internal/computeMetadata/v1')).toEqual({ status: 400, body: expect.objectContaining({ code: 'base_url' }) });
    expect(await save('https://169.254.169.254/latest')).toEqual({ status: 400, body: expect.objectContaining({ code: 'base_url_private' }) });
    expect(await save('https://[::ffff:10.0.0.1]/v1')).toEqual({ status: 400, body: expect.objectContaining({ code: 'base_url_private' }) });
    resolvesTo('fd12::7');
    expect(await save('https://llm.example.com/v1')).toEqual({ status: 400, body: expect.objectContaining({ code: 'base_url_private' }) });
    vi.spyOn(endpointNet, 'lookup').mockRejectedValue(new Error('ENOTFOUND'));
    expect(await save('https://nowhere.example.com/v1')).toEqual({ status: 400, body: expect.objectContaining({ code: 'base_url_dns' }) });
    // Only the adapter whose address is the founder's takes one.
    resolvesTo('8.8.4.4');
    expect(await post({ action: 'endpoint', providerId: 'openai', baseUrl: 'https://llm.example.com/v1' })).toEqual({ status: 400, body: expect.objectContaining({ code: 'provider' }) });
    expect(await q(`select base_url from control.ai_providers where base_url is not null`)).toEqual([]);
  });

  it('saves a public address, shown on the page with what the adapter can do; audited before and after; undone in one step', async () => {
    resolvesTo('8.8.4.4', '2606:4700:4700::1111');
    expect(await post({ action: 'endpoint', providerId: 'openai_compatible', baseUrl: ' https://LLM.example.com/v1/ ' })).toEqual({ status: 200, body: { ok: true } });
    const page = await (await GET(req(undefined, founder))).json();
    const compat = page.providers.find((p: { providerId: string }) => p.providerId === 'openai_compatible');
    expect(compat).toMatchObject({ hasAdapter: true, needsBaseUrl: true, baseUrl: 'https://llm.example.com/v1', testable: true, termsNote: null, capabilities: { text: true, vision: false, stream: true, json: false, stt: false, tts: false } });
    expect(page.providers.find((p: { providerId: string }) => p.providerId === 'vertex_ai')).toMatchObject({ needsBaseUrl: false, baseUrl: null, testable: true, termsNote: 'adults_only', capabilities: { vision: true, json: true } });
    expect(page.profiles.find((p: { profileId: string }) => p.profileId === 'exams.mark').needs).toEqual(['text', 'vision']);
    const [row] = await q(`select audit_id, before_state, after_state from audit_log where event_action = 'ai.endpoint_changed' order by audit_id desc limit 1`);
    expect(row.before_state).toEqual({ providerId: 'openai_compatible', baseUrl: null });
    expect(row.after_state).toEqual({ providerId: 'openai_compatible', baseUrl: 'https://llm.example.com/v1' });
    expect(page.changes[0]).toMatchObject({ action: 'ai.endpoint_changed', target: 'openai_compatible', canUndo: true });
    expect(await post({ action: 'undo', auditId: String(row.audit_id) })).toEqual({ status: 200, body: { ok: true } });
    expect(await q(`select base_url from control.ai_providers where provider_id = 'openai_compatible'`)).toEqual([{ base_url: null }]);
  });

  it('a key goes only to the host it was saved for: moving the address to another host removes it', async () => {
    resolvesTo('8.8.4.4');
    await post({ action: 'endpoint', providerId: 'openai_compatible', baseUrl: 'https://llm.example.com/v1' });
    expect(await post({ action: 'credential', providerId: 'openai_compatible', apiKey: COMPAT_KEY })).toEqual({ status: 200, body: { ok: true } });
    // The same host, another path: the key stays.
    expect(await post({ action: 'endpoint', providerId: 'openai_compatible', baseUrl: 'https://llm.example.com/v2' })).toEqual({ status: 200, body: { ok: true } });
    expect(await q(`select key_last4 from control.ai_credentials where provider_id = 'openai_compatible'`)).toEqual([{ key_last4: 'KEYC' }]);
    expect(await post({ action: 'endpoint', providerId: 'openai_compatible', baseUrl: 'https://other.example.net/v1' })).toEqual({ status: 200, body: { ok: true } });
    expect(await q(`select key_last4 from control.ai_credentials where provider_id = 'openai_compatible'`)).toEqual([]);
    const [row] = await q(`select after_state from audit_log where event_action = 'ai.endpoint_changed' order by audit_id desc limit 1`);
    expect(row.after_state).toEqual({ providerId: 'openai_compatible', baseUrl: 'https://other.example.net/v1', keyRemoved: true });
  });

  it('a clearance for children’s words does not move to another host: refused while a child-words profile uses it, else withdrawn with the change', async () => {
    resolvesTo('8.8.4.4');
    await post({ action: 'endpoint', providerId: 'openai_compatible', baseUrl: 'https://llm.example.com/v1' });
    expect(await post({ action: 'clearance', providerId: 'openai_compatible', cleared: true, termsUrl: 'https://llm.example.com/terms' })).toEqual({ status: 200, body: { ok: true } });
    expect(await post({ action: 'profile', profileId: 'family.resolver', providerId: 'openai_compatible', model: 'open-model-1', promptVersion: 'v1', enabled: false })).toEqual({ status: 200, body: { ok: true } });
    // The same host keeps the clearance; another host is refused while a child-words profile uses the provider.
    expect(await post({ action: 'endpoint', providerId: 'openai_compatible', baseUrl: 'https://llm.example.com/v2' })).toEqual({ status: 200, body: { ok: true } });
    expect(await post({ action: 'endpoint', providerId: 'openai_compatible', baseUrl: 'https://other.example.net/v1' })).toEqual({ status: 400, body: expect.objectContaining({ code: 'in_use' }) });
    expect(await q(`select base_url, cleared_for_minors from control.ai_providers where provider_id = 'openai_compatible'`)).toEqual([{ base_url: 'https://llm.example.com/v2', cleared_for_minors: true }]);
    // With the profile moved off, the change goes through and takes the clearance with it.
    await post({ action: 'profile', profileId: 'family.resolver', providerId: null, model: null, promptVersion: 'v1', enabled: false });
    expect(await post({ action: 'endpoint', providerId: 'openai_compatible', baseUrl: 'https://other.example.net/v1' })).toEqual({ status: 200, body: { ok: true } });
    expect(await q(`select base_url, cleared_for_minors, cleared_terms_url, cleared_by from control.ai_providers where provider_id = 'openai_compatible'`)).toEqual([{ base_url: 'https://other.example.net/v1', cleared_for_minors: false, cleared_terms_url: null, cleared_by: null }]);
    const [row] = await q(`select after_state from audit_log where event_action = 'ai.endpoint_changed' order by audit_id desc limit 1`);
    expect(row.after_state).toMatchObject({ baseUrl: 'https://other.example.net/v1', clearanceWithdrawn: true });
    await post({ action: 'endpoint', providerId: 'openai_compatible', baseUrl: null });
  });

  it('a feature that needs photos cannot be put on an adapter that does not declare them (code "capability")', async () => {
    const r = await post({ action: 'profile', profileId: 'family.syllabus_extract', providerId: 'openai_compatible', model: 'open-model-1', promptVersion: 'v1', enabled: true });
    expect(r).toEqual({ status: 400, body: expect.objectContaining({ code: 'capability' }) });
    // As a backup too.
    const fallback = await post({ action: 'profile', profileId: 'family.syllabus_extract', providerId: 'workers-ai', model: '@cf/meta/llama-4-scout-17b-16e-instruct', promptVersion: 'v1', enabled: true, fallback: [{ provider: 'openai_compatible', model: 'open-model-1' }] });
    expect(fallback).toEqual({ status: 400, body: expect.objectContaining({ code: 'capability' }) });
    // A text-only feature takes it.
    expect(await post({ action: 'profile', profileId: 'copilot.draft', providerId: 'openai_compatible', model: 'open-model-1', promptVersion: 'v1', enabled: false })).toEqual({ status: 200, body: { ok: true } });
    // A Vertex model id that could leave its path is refused where the founder sees it.
    expect(await post({ action: 'profile', profileId: 'copilot.draft', providerId: 'vertex_ai', model: '../x', promptVersion: 'v1', enabled: false })).toEqual({ status: 400, body: expect.objectContaining({ code: 'model' }) });
    await post({ action: 'profile', profileId: 'copilot.draft', providerId: null, model: null, promptVersion: 'v1', enabled: true });
  });

  it('“Test the key” for both new adapters: no key in a response, an audit row, the stored outcome or the log', async () => {
    const logged: string[] = [];
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, level).mockImplementation((...a: unknown[]) => void logged.push(a.map(String).join(' ')));
    resolvesTo('8.8.4.4');
    await post({ action: 'endpoint', providerId: 'openai_compatible', baseUrl: 'https://llm.example.com/v1' });
    await post({ action: 'credential', providerId: 'openai_compatible', apiKey: COMPAT_KEY });
    const send = vi.spyOn(endpointNet, 'send').mockResolvedValue(new Response(JSON.stringify({ error: `wrong key ${COMPAT_KEY}` }), { status: 401 }));
    const compat = await post({ action: 'test', providerId: 'openai_compatible' });
    expect(compat).toEqual({ status: 200, body: { ok: true, works: false, code: 'http_401' } });
    expect(send.mock.calls[0][0].href).toBe('https://llm.example.com/v1/models');
    send.mockResolvedValue(new Response('{"data":[]}', { status: 200 }));
    expect(await post({ action: 'test', providerId: 'openai_compatible' })).toEqual({ status: 200, body: { ok: true, works: true, code: 'ok' } });

    const VERTEX_KEY = `AQ.${'V'.repeat(40)}KEYV`;
    await post({ action: 'credential', providerId: 'vertex_ai', apiKey: VERTEX_KEY });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: `API key not valid ${VERTEX_KEY}` } }), { status: 400 })));
    const vertex = await post({ action: 'test', providerId: 'vertex_ai' });
    expect(vertex).toEqual({ status: 200, body: { ok: true, works: false, code: 'http_400' } });
    // G5 (C373): every text adapter now has a free check; with no key saved it says so plainly.
    expect(await post({ action: 'test', providerId: 'openai' })).toEqual({ status: 400, body: expect.objectContaining({ code: 'no_key' }) });

    const page = await (await GET(req(undefined, founder))).text();
    const stored = JSON.stringify(await q(`select provider_id, key_last4, test_ok, test_message from control.ai_credentials`));
    const audits = JSON.stringify(await q(`select before_state, after_state from audit_log where event_action like 'ai.%'`));
    for (const text of [JSON.stringify([compat, vertex]), page, stored, audits, logged.join(' ')]) {
      expect(text).not.toContain(COMPAT_KEY);
      expect(text).not.toContain(VERTEX_KEY);
    }
    expect(JSON.parse(page).providers.find((p: { providerId: string }) => p.providerId === 'vertex_ai').credential).toMatchObject({ keyLast4: 'KEYV', testOk: false });
  });

  it('with no address set, the test says so', async () => {
    await post({ action: 'endpoint', providerId: 'openai_compatible', baseUrl: null });
    expect(await post({ action: 'test', providerId: 'openai_compatible' })).toEqual({ status: 400, body: expect.objectContaining({ code: 'no_base_url' }) });
  });
});
