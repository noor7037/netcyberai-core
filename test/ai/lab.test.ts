import { randomBytes, randomUUID } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { aiEncryptionKey, sealAiKey } from '@/lib/ai/credentials';
import { LAB_AREAS, labDataset, parseCaseFile } from '@/lib/ai/lab/cases';
import { checkPassedFor, errorClassOf, jsonValidFor } from '@/lib/ai/lab/runner';
import { columnSummaries, labTable } from '@/lib/ai/lab/table';
import type { LabRun } from '@/lib/ai/lab/store';
import { anthropicOk, httpError, openaiOk } from './streams';

// G4 (C372): the Quality Lab on the real migrations (PGlite), through its own route, as the founder with the
// authenticator. Only the connection is replaced (the route's platform helper runs on the test database as nca_super,
// every statement recorded) and the vendors are replaced at fetch. It proves: the cases are well formed and at least
// forty; who is let in; with no key the Lab says not configured; two configured providers give a comparable table that
// scores and exports; a timeout and a quota answer are named; and a run writes nothing outside control.ai_eval_*.

const h = vi.hoisted(() => ({
  db: null as unknown as { pg: { transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>; query: (sql: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }; stop: () => Promise<void> },
  statements: [] as string[],
}));

vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  const run = (fn: (db: unknown) => Promise<unknown>) =>
    h.db.pg.transaction(async (tx) => {
      const t = tx as { query: (s: string, p?: unknown[]) => Promise<unknown> };
      await t.query('set local role nca_super');
      return fn({ query: (s: string, p?: unknown[]) => (h.statements.push(s), t.query(s, p)) });
    });
  return { ...real, withPlatformService: run, withTenantContext: (_c: unknown, fn: (db: unknown) => Promise<unknown>) => run(fn) };
});

// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { GET, POST } from '@/app/api/control/ai/lab/route';

const FOUNDER = randomUUID();
const PRINCIPAL = randomUUID();
const SCHOOL = randomUUID();
const ANTHROPIC_KEY = `sk-ant-${'a'.repeat(30)}WXYZ`;
const OPENAI_KEY = `sk-${'b'.repeat(30)}QRST`;
const q = async (sql: string, params: unknown[] = []) => (await h.db.pg.query(sql, params)).rows;

let founder = '';
let founderAal1 = '';
let principal = '';
function req(body?: unknown, cookie = founder, search = ''): NextRequest {
  return new NextRequest(`https://www.netcyberai.test/api/control/ai/lab${search}`, {
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
}
async function cookieFor(sub: string, role: string, schoolId: string | null, aal: 'aal1' | 'aal2') {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal, sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
const post = async (body: unknown, cookie = founder) => {
  const res = await POST(req(body, cookie));
  return { status: res.status, body: await res.json() };
};
const get = async (search = '', cookie = founder) => {
  const res = await GET(req(undefined, cookie, search));
  return { status: res.status, res };
};

async function seal(provider: string, key: string) {
  const k = aiEncryptionKey();
  if (!k) throw new Error('test key missing');
  const s = sealAiKey(k, provider, key);
  await q(`insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ($1, $2, $3, $4, $5, $6, $7)`, [provider, s.ciphertext, s.iv, s.tag, s.keyVersion, key.slice(-4), FOUNDER]);
}

// Each vendor answers from what it was asked: Anthropic keeps the JSON format, OpenAI wraps it in words. A request that
// mentions the discount gets a worked answer; one that names the quota probe gets 429; the timeout probe never answers.
type Reply = (body: string, signal?: AbortSignal) => Promise<Response>;
const replies: Record<string, Reply> = {
  anthropic: async (body) => {
    if (body.includes('multiplication tables')) return httpError(429);
    if (body.includes('right_answer')) return anthropicOk(['{"correct": false, "right_answer": 108, ', '"hint": "Multiply the length by the width."}'], 40, 20);
    return anthropicOk(['15% of 800 is 120. ', '800 - 120 = 680.\nAnswer: 680 rupees'], 30, 18);
  },
  openai: async (body, signal) => {
    if (body.includes('digestive system')) {
      return new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new DOMException('The operation timed out.', 'TimeoutError'))));
    }
    if (body.includes('right_answer')) return openaiOk(['Here you go: {"correct": false, "right_answer": 108, "hint": "Area is length times width."}'], 35, 25);
    return openaiOk(['The discount is 120 rupees, so the price is 640 rupees.'], 25, 15);
  },
};

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-ai-lab-route-tests-0123456789abcdef';
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_CREDENTIALS_KEY_VERSION = '1';
  h.db = await startHarnessDb({ port: 0 });
  await q(`insert into schools (school_id, name, jurisdiction) values ($1, 'Made-up School', 'IN-HR')`, [SCHOOL]);
  await q(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder'), ($2, $3, 'principal', 'Priya Principal')`, [FOUNDER, PRINCIPAL, SCHOOL]);
  founder = await cookieFor(FOUNDER, 'super_admin', null, 'aal2');
  founderAal1 = await cookieFor(FOUNDER, 'super_admin', null, 'aal1');
  principal = await cookieFor(PRINCIPAL, 'principal', SCHOOL, 'aal1');
}, 90_000);
afterAll(async () => {
  await h.db?.stop();
});
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const provider = String(url).includes('anthropic.com') ? 'anthropic' : String(url).includes('openai.com') ? 'openai' : null;
      if (!provider) throw new Error(`no vendor at ${url}`);
      return replies[provider](String(init.body), init.signal ?? undefined);
    })
  );
});

describe('the cases', () => {
  it('are at least forty, well formed, unique, cover every area, and are versioned by their hash', () => {
    const { cases, version } = labDataset();
    expect(cases.length).toBeGreaterThanOrEqual(40);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const area of LAB_AREAS) expect(cases.some((c) => c.area === area), area).toBe(true);
    expect(cases.some((c) => c.language === 'hi')).toBe(true);
    expect(cases.some((c) => c.messages.length > 1)).toBe(true);
    expect(cases.some((c) => c.timeoutMs)).toBe(true);
    expect(cases.filter((c) => c.expect === 'json').length).toBeGreaterThanOrEqual(5);
    expect(version).toMatch(/^[a-f0-9]{12}$/);
  });

  it('a case without the right shape is refused', () => {
    const good = { id: 'abc-one', language: 'en', system: 's', messages: [{ role: 'user', content: 'q' }], expect: 'text', rubric: ['r'] };
    expect(parseCaseFile({ area: 'maths', cases: [good] })).toHaveLength(1);
    expect(() => parseCaseFile({ area: 'maths', cases: [{ ...good, expect: 'xml' }] })).toThrow();
    expect(() => parseCaseFile({ area: 'maths', cases: [{ ...good, messages: [{ role: 'assistant', content: 'a' }] }] })).toThrow();
    expect(() => parseCaseFile({ area: 'nope', cases: [good] })).toThrow();
  });

  it('measures strictly: one JSON object with its keys, every checked word, and each failure by its kind', () => {
    expect(jsonValidFor('{"a":1,"b":2}', ['a', 'b'])).toBe(true);
    expect(jsonValidFor('Here: {"a":1}', ['a'])).toBe(false);
    expect(jsonValidFor('{"a":1}', ['a', 'b'])).toBe(false);
    expect(jsonValidFor('[1]')).toBe(false);
    expect(checkPassedFor('Arjun 200, Kabir 250', ['200', '250'])).toBe(true);
    expect(checkPassedFor('Arjun 200', ['200', '250'])).toBe(false);
    expect(checkPassedFor('anything', undefined)).toBe(null);
    expect(errorClassOf({ ok: false, failure: 'http', status: 401 }, 10, 60_000)).toBe('auth_failed');
    expect(errorClassOf({ ok: false, failure: 'http', status: 429 }, 10, 60_000)).toBe('rate_limited');
    expect(errorClassOf({ ok: false, failure: 'http', status: 404 }, 10, 60_000)).toBe('model_unavailable');
    expect(errorClassOf({ ok: false, failure: 'http', status: 503 }, 10, 60_000)).toBe('upstream_unavailable');
    expect(errorClassOf({ ok: false, failure: 'network' }, 2_000, 2_000)).toBe('upstream_timeout');
    expect(errorClassOf({ ok: false, failure: 'network' }, 50, 2_000)).toBe('upstream_unavailable');
    expect(errorClassOf({ ok: false, failure: 'refused' }, 50, 2_000)).toBe('content_rejected');
  });
});

describe('who is let in', () => {
  it('no session, a school session, and the founder without the authenticator are refused', async () => {
    expect((await get('', '')).status).toBe(401);
    expect((await get('', principal)).status).toBe(403);
    expect((await get('', founderAal1)).status).toBe(403);
    expect((await post({ action: 'start', caseIds: ['maths-percent-discount'], models: [] }, principal)).status).toBe(403);
  });
});

describe('with no key', () => {
  it('lists no provider, and a run is refused as not configured', async () => {
    const { res } = await get();
    const body = await res.json();
    expect(body.providers).toEqual([]);
    expect(body.keyReady).toBe(true);
    expect(body.cases.length).toBeGreaterThanOrEqual(40);
    const started = await post({ action: 'start', caseIds: ['maths-percent-discount'], models: [{ provider: 'anthropic', model: 'claude-x' }, { provider: 'openai', model: 'gpt-x' }] });
    expect(started).toEqual({ status: 409, body: { error: 'not done', code: 'not_configured' } });
    expect(await q(`select count(*)::int as n from control.ai_eval_runs`)).toEqual([{ n: 0 }]);
  });
});

describe('two configured providers, side by side', () => {
  const CASES = ['maths-percent-discount', 'maths-area-rectangle-json', 'edge-quota-large-request', 'edge-timeout-long-answer'];
  const MODELS = [
    { provider: 'anthropic', model: 'claude-lab-a' },
    { provider: 'openai', model: 'gpt-lab-b' },
  ];
  let runId = '';
  const snapshot = async () => {
    const tables = (await q(
      `select format('%I.%I', n.nspname, c.relname) as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r', 'p') and n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg\\_%'
          and not (n.nspname = 'control' and c.relname like 'ai\\_eval\\_%') order by 1`
    )) as { t: string }[];
    const out: Record<string, string> = {};
    for (const { t } of tables) out[t] = String((await q(`select md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h from ${t} x`))[0].h);
    return out;
  };

  it('runs every case on each model, one request a cell, into a comparable table; writes nothing outside control.ai_eval_*', async () => {
    await seal('anthropic', ANTHROPIC_KEY);
    await seal('openai', OPENAI_KEY);
    const before = await snapshot();
    expect(Object.keys(before).length).toBeGreaterThan(100);
    for (const t of ['control.ai_usage', 'public.audit_log', 'family.attempts', 'family.children']) expect(before, t).toHaveProperty([t]);
    h.statements = [];

    const setup = await (await get()).res.json();
    expect(setup.providers).toEqual(['anthropic', 'openai']);
    expect(JSON.stringify(setup)).not.toContain(ANTHROPIC_KEY.slice(-12));

    // A model the run does not name, and a provider without a key, are refused.
    expect((await post({ action: 'start', caseIds: CASES, models: [MODELS[0], { provider: 'gemini', model: 'g-x' }] })).body.code).toBe('provider');
    expect((await post({ action: 'start', caseIds: CASES, models: [MODELS[0], MODELS[0]] })).body.code).toBe('models');
    expect((await post({ action: 'start', caseIds: ['no-such-case'], models: MODELS })).body.code).toBe('cases');

    const started = await post({ action: 'start', caseIds: CASES, models: MODELS });
    expect(started.status).toBe(200);
    runId = started.body.runId;
    expect((await post({ action: 'case', runId, caseId: CASES[0], provider: 'openai', model: 'gpt-other' })).status).toBe(404);

    for (const caseId of CASES) for (const m of MODELS) expect((await post({ action: 'case', runId, caseId, ...m })).status).toBe(200);

    const { res } = await get(`?runId=${runId}`);
    const { run } = (await res.json()) as { run: LabRun };
    const table = labTable(run);
    expect(table.columns).toEqual(MODELS);
    expect(table.rows.map((r) => r.caseId)).toEqual(CASES);
    expect(table.rows.every((r) => r.cells.every((c) => c !== null))).toBe(true);
    const cell = (caseId: string, provider: string) => table.rows.find((r) => r.caseId === caseId)!.cells[provider === 'anthropic' ? 0 : 1]!;

    // The worked answer: both answer; only one is right by the deterministic check.
    expect(cell('maths-percent-discount', 'anthropic')).toMatchObject({ errorClass: null, checkPassed: true, jsonValid: null, tokensIn: 30, tokensOut: 18 });
    expect(cell('maths-percent-discount', 'openai')).toMatchObject({ errorClass: null, checkPassed: false, tokensIn: 25, tokensOut: 15 });
    expect(cell('maths-percent-discount', 'anthropic').firstTokenMs).not.toBeNull();
    // The JSON case: one kept the format, one wrapped it in words.
    expect(cell('maths-area-rectangle-json', 'anthropic')).toMatchObject({ jsonValid: true, checkPassed: true, errorClass: null });
    expect(cell('maths-area-rectangle-json', 'openai')).toMatchObject({ jsonValid: false, errorClass: 'output_schema_invalid' });
    expect(cell('maths-area-rectangle-json', 'openai').outputText).toContain('Here you go');
    // The quota probe: a 429 is named, not hidden.
    expect(cell('edge-quota-large-request', 'anthropic')).toMatchObject({ errorClass: 'rate_limited', outputText: '' });
    // The timeout probe: the case's own two seconds end the call, and it says so.
    expect(cell('edge-timeout-long-answer', 'openai')).toMatchObject({ errorClass: 'upstream_timeout' });
    expect(cell('edge-timeout-long-answer', 'openai').latencyMs).toBeGreaterThanOrEqual(1_900);

    // Scores 1–5 and a note; 6 is refused.
    const r = cell('maths-percent-discount', 'anthropic');
    expect((await post({ action: 'score', resultId: r.resultId, score: 5, notes: 'Clear steps.' })).status).toBe(200);
    expect((await post({ action: 'score', resultId: r.resultId, score: 6, notes: null })).body.code).toBe('score');
    expect((await post({ action: 'score', resultId: cell('maths-percent-discount', 'openai').resultId, score: 2, notes: null })).status).toBe(200);
    const after = ((await (await get(`?runId=${runId}`)).res.json()) as { run: LabRun }).run;
    const summary = columnSummaries(labTable(after));
    expect(summary[0]).toMatchObject({ answered: 3, failed: 1, jsonValid: 1, jsonExpected: 1, checksPassed: 2, checks: 2, meanScore: 5, scored: 1 });
    expect(summary[1]).toMatchObject({ answered: 3, failed: 1, jsonValid: 0, jsonExpected: 1, checksPassed: 1, checks: 2, meanScore: 2, scored: 1 });

    // Exports: CSV, one line a cell, and JSON with each model's summary.
    const csv = await (await get(`?runId=${runId}&format=csv`)).res.text();
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toMatch(/^run_id,dataset_version,case_id,area,/);
    expect(lines.length).toBe(1 + CASES.length * MODELS.length);
    expect(csv).toContain('rate_limited');
    const json = JSON.parse(await (await get(`?runId=${runId}&format=json`)).res.text());
    expect(json.models[0].summary.meanScore).toBe(5);
    expect(json.cases).toHaveLength(CASES.length);
    expect(csv + JSON.stringify(json)).not.toContain(OPENAI_KEY.slice(-12));

    // Isolation: every table outside control.ai_eval_* is byte for byte as it was (learner history, family tables, the
    // content library, the usage counts, the audit log), and every write the Lab made went to control.ai_eval_*.
    expect(await snapshot()).toEqual(before);
    const writes = h.statements.filter((s) => /^\s*(insert|update|delete)\b/i.test(s) || /\bcount_ai_usage\b/i.test(s));
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) expect(w).toMatch(/^\s*(insert into|update) control\.ai_eval_(runs|results)\b/i);
  }, 30_000);

  it('only the platform role holds anything on the lab tables: select, insert and update, never delete', async () => {
    const privs = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
    for (const t of ['control.ai_eval_runs', 'control.ai_eval_results']) {
      for (const role of ['anon', 'authenticated', 'service_role', 'app_user', 'family_app', 'app_backend', 'audit_writer']) {
        const exists = (await q(`select 1 from pg_roles where rolname = $1`, [role])).length > 0;
        if (!exists) continue;
        for (const p of privs) expect((await q(`select has_table_privilege($1, $2, $3) as ok`, [role, t, p]))[0].ok, `${role} ${p} ${t}`).toBe(false);
      }
      const held = await Promise.all(privs.map(async (p) => ((await q(`select has_table_privilege('nca_super', $1, $2) as ok`, [t, p]))[0].ok ? p : null)));
      expect(held.filter(Boolean)).toEqual(['SELECT', 'INSERT', 'UPDATE']);
      const rls = (await q(`select relrowsecurity, relforcerowsecurity from pg_class where oid = $1::regclass`, [t]))[0];
      expect(rls).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    }
  });
});
