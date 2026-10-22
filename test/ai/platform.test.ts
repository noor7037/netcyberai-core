import { randomBytes } from 'crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { REFUSAL_MESSAGE, prepareText, streamText, type AiContext, type AiRequest } from '@/lib/ai/platform';
import { adapterFor, standInAllowed } from '@/lib/ai/adapters';
import { sealAiKey, aiEncryptionKey } from '@/lib/ai/credentials';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';
import { anthropicOk, anthropicRefusal, httpError, openaiOk } from './streams';

// M1-3 (C249): the AI platform on the real migrations (PGlite), run as the family session runs it (family_app, own
// account). Vendors are replaced at fetch, so what the adapters send is captured byte for byte. Made-up people only.

const A = 'f2000000-0000-4000-8000-0000000000a1';
const B = 'f2000000-0000-4000-8000-0000000000b1';
const FOUNDER = 'f2000000-0000-4000-8000-0000000000f1';
const ANTHROPIC_KEY = `sk-ant-${'a'.repeat(30)}WXYZ`;
const OPENAI_KEY = `sk-${'b'.repeat(30)}QRST`;
// Cloudflare Workers AI (C230-U): "<account id>:<API token>"; the open-weight provider for the children's paths.
const WORKERS_KEY = `${'c'.repeat(32)}:cfat_${'W'.repeat(36)}`;
const DAY = '2026-10-21';

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
// The database's owner, for setting up and reading back (it is not row-level-security bound).
const q = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;

const ctxA: AiContext = { accountId: A, childFirstNames: ['Asha', 'आशा'], parentEmail: 'parent.a@example.org', day: DAY };
const ask = (text = 'What is photosynthesis?'): AiRequest => ({ system: 'Explain for a Class 7 student.', messages: [{ role: 'user', content: text }] });
const run = (ctx: AiContext = ctxA, request: AiRequest = ask(), onDelta?: (t: string) => void) => asFamily(ctx.accountId, (tx) => streamText(tx as never, ctx, 'family.resolver', request, onDelta));

type Call = { url: string; body: string; headers: Record<string, string> };
let calls: Call[] = [];
let replies: (() => Response)[] = [];

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
const useProfile = (provider: string | null, model: string | null, fallback: unknown[] = [], enabled = true) =>
  q(`update control.ai_profiles set provider_id = $1, model = $2, fallback = $3::jsonb, enabled = $4 where profile_id = 'family.resolver'`, [provider, model, JSON.stringify(fallback), enabled]);

beforeAll(async () => {
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_CREDENTIALS_KEY_VERSION = '1';
  db = await startHarnessDb({ port: 0 });
  await q(`insert into family.accounts (account_id, email) values ($1, 'parent.a@example.org'), ($2, 'parent.b@example.org')`, [A, B]);
  await q(
    `insert into family.children (account_id, first_name, class_level, board_id, language, style, state_code)
     values ($1, 'Asha', 7, 'CBSE', 'hi', 'hinglish', 'IN-UP'), ($1, 'आशा', 6, 'CBSE', 'hi', 'hi', 'IN-UP'), ($2, 'Ravi', 9, 'CBSE', 'en', 'en', 'IN-HR')`,
    [A, B]
  );
}, 90_000);
afterAll(async () => {
  await db?.stop();
});

beforeEach(async () => {
  calls = [];
  replies = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: String(init.body), headers: init.headers as Record<string, string> });
      const next = replies.shift();
      if (!next) throw new Error('no reply prepared');
      return next();
    })
  );
  // A clean slate: nothing cleared, no key, the profile unset, today's counts empty, the cap as the migration seeds it.
  await q(`update control.ai_profiles set provider_id = null, model = null, fallback = '[]', enabled = true`);
  await q(`delete from control.ai_credentials`);
  await q(`update control.ai_providers set cleared_for_minors = false, cleared_terms_url = null, cleared_at = null, cleared_by = null`);
  await q(`delete from control.ai_usage`);
  await q(`delete from family.ai_daily`);
  await q(`update control.settings set value = '20'::jsonb where key = 'family.ai.daily_requests'`);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_PLATFORM_STAND_IN;
});

describe('not switched on', () => {
  it('no provider set: refused, nothing sent, nothing counted', async () => {
    expect(await run()).toEqual({ ok: false, reason: 'not_switched_on' });
    expect(calls).toHaveLength(0);
    expect(await q(`select * from family.ai_daily`)).toHaveLength(0);
  });

  it('the profile switched off, or no key: refused the same way', async () => {
    await clear('anthropic');
    await useProfile('anthropic', 'test-model-a', [], false);
    await sealInto('anthropic', ANTHROPIC_KEY);
    expect(await run()).toEqual({ ok: false, reason: 'not_switched_on' });
    await useProfile('anthropic', 'test-model-a');
    await q(`delete from control.ai_credentials`);
    expect(await run()).toEqual({ ok: false, reason: 'not_switched_on' });
    expect(calls).toHaveLength(0);
  });

  it('with no server key the stored key cannot open: not switched on', async () => {
    await clear('anthropic');
    await useProfile('anthropic', 'test-model-a');
    await sealInto('anthropic', ANTHROPIC_KEY);
    const saved = process.env.AI_CREDENTIALS_KEY;
    delete process.env.AI_CREDENTIALS_KEY;
    try {
      expect(await run()).toEqual({ ok: false, reason: 'not_switched_on' });
    } finally {
      process.env.AI_CREDENTIALS_KEY = saved;
    }
  });

  it('the family-facing words, in English and Hindi', () => {
    expect(en[REFUSAL_MESSAGE.not_switched_on]).toBe('Explanations are not switched on yet');
    expect(hi[REFUSAL_MESSAGE.not_switched_on]).toMatch(/चालू नहीं/);
  });
});

describe('allow: a cleared provider with a key streams', () => {
  beforeEach(async () => {
    await clear('anthropic');
    await useProfile('anthropic', 'test-model-a');
    await sealInto('anthropic', ANTHROPIC_KEY);
  });

  it('streams the text, counts the family and the use, and never stores the words', async () => {
    replies.push(() => anthropicOk(['Plants ', 'make food ', 'from light.'], 21, 9));
    const pieces: string[] = [];
    const got = await run(ctxA, ask(), (p) => pieces.push(p));
    expect(got).toEqual({ ok: true, text: 'Plants make food from light.', tokensIn: 21, tokensOut: 9, provider: 'anthropic', model: 'test-model-a' });
    expect(pieces).toEqual(['Plants ', 'make food ', 'from light.']);
    expect(calls).toHaveLength(1);
    expect(calls[0].headers['x-api-key']).toBe(ANTHROPIC_KEY);
    expect(JSON.parse(calls[0].body)).toMatchObject({ model: 'test-model-a', stream: true, max_tokens: 2000 });
    expect(await q(`select account_id, requests from family.ai_daily`)).toEqual([{ account_id: A, requests: 1 }]);
    const usage = await q(`select profile_id, provider_id, model, requests, failures, cap_refusals, tokens_in::int, tokens_out::int from control.ai_usage`);
    expect(usage).toEqual([{ profile_id: 'family.resolver', provider_id: 'anthropic', model: 'test-model-a', requests: 1, failures: 0, cap_refusals: 0, tokens_in: 21, tokens_out: 9 }]);
    // Counts and tokens only: no table of the AI platform holds a word of the question or the answer.
    const dump = JSON.stringify([await q(`select * from control.ai_usage`), await q(`select * from family.ai_daily`), await q(`select * from control.ai_credentials`)]);
    expect(dump).not.toMatch(/photosynthesis|Plants|make food/);
    expect(dump).not.toContain(ANTHROPIC_KEY);
  });

  it('another account’s daily count is untouched', async () => {
    replies.push(() => anthropicOk(['ok']));
    await run();
    expect(await q(`select * from family.ai_daily where account_id = $1`, [B])).toHaveLength(0);
    // And a family session cannot even see another account's count.
    expect((await asFamily(B, (tx) => tx.query(`select * from family.ai_daily`))).rows).toHaveLength(0);
  });

  it('JSON is asked for in the request when the caller wants it', async () => {
    replies.push(() => anthropicOk(['{"a":1}']));
    await run(ctxA, { ...ask(), responseFormat: 'json', maxTokens: 99_999 });
    const body = JSON.parse(calls[0].body);
    expect(body.system).toMatch(/JSON object only/);
    expect(body.max_tokens).toBe(2000); // never above the profile's own limit
  });
});

describe('the pre-processor, on the real request body', () => {
  it('no child identifier reaches the vendor', async () => {
    await clear('anthropic');
    await useProfile('anthropic', 'test-model-a');
    await sealInto('anthropic', ANTHROPIC_KEY);
    replies.push(() => anthropicOk(['ok']));
    const text = [
      'Asha asked: why is ASHA’s plant yellow? asha thinks it needs sun.',
      'आशा पूछ रही है कि पौधा पीला क्यों है।',
      'Write to parent.a@example.org or PARENT.A@EXAMPLE.ORG or teacher.k@school.example.in.',
      'Call +91 98765 43210, 9876543210, 098765-43210 or ९८७६५४३२१०.',
      'Aadhaar 1234 5678 9012 and 123456789012.',
    ].join('\n');
    await run(ctxA, { system: 'Student: Asha. Class 7.', messages: [{ role: 'user', content: text }, { role: 'assistant', content: 'Hello Asha' }, { role: 'user', content: 'thanks' }] });
    const body = calls[0].body;
    for (const leak of ['Asha', 'ASHA', 'asha', 'आशा', 'parent.a@', 'PARENT.A', 'teacher.k@', '98765', '9876543210', '43210', '९८७६५', '1234 5678', '123456789012']) {
      expect(body, leak).not.toContain(leak);
    }
    const sent = JSON.parse(body);
    expect(sent.system).toBe('Student: the student. Class 7.');
    expect(sent.messages[0].content).toContain('the student asked: why is the student’s plant yellow?');
    expect(sent.messages[0].content).toContain('an email address');
    expect(sent.messages[0].content).toContain('a phone number');
    expect(sent.messages[0].content).toContain('an ID number');
    expect(sent.messages[1].content).toBe('Hello the student');
  });

  it('the same on the other adapter', async () => {
    await clear('workers-ai');
    await useProfile('workers-ai', 'test-model-b');
    await sealInto('workers-ai', WORKERS_KEY);
    replies.push(() => openaiOk(['ok']));
    await run(ctxA, ask('Asha (parent.a@example.org, +919876543210) asks about आशा’s homework'));
    expect(calls[0].url).toMatch(/^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/c{32}\/ai\/v1\/chat\/completions$/);
    expect(calls[0].body).not.toMatch(/Asha|आशा|parent\.a|9876543210/);
    expect(calls[0].headers.authorization).toBe(`Bearer cfat_${'W'.repeat(36)}`);
  });
});

describe('deny: the minors check', () => {
  it('a provider not cleared in Control is refused, even if the profile names it', async () => {
    await clear('anthropic');
    await sealInto('anthropic', ANTHROPIC_KEY);
    await sealInto('openai', OPENAI_KEY);
    // The database refuses to set an uncleared provider on a child-words profile …
    await expect(useProfile('openai', 'test-model-b')).rejects.toThrow(/not cleared for minors/);
    // … and if it were there anyway (the trigger switched off by hand), the run itself refuses it.
    await q(`alter table control.ai_profiles disable trigger ai_profiles_minors_check`);
    try {
      await useProfile('anthropic', 'test-model-a', [{ provider: 'openai', model: 'test-model-b' }]);
    } finally {
      await q(`alter table control.ai_profiles enable trigger ai_profiles_minors_check`);
    }
    expect(await run()).toEqual({ ok: false, reason: 'not_cleared_for_minors' });
    expect(calls).toHaveLength(0);
    expect(await q(`select * from family.ai_daily`)).toHaveLength(0);
  });

  it('a provider cleared in Control whose adapter is not eligible in code is refused (OpenAI, Gemini: C230-U)', async () => {
    for (const [provider, key] of [['openai', OPENAI_KEY], ['gemini', `AIza${'G'.repeat(35)}`]] as const) {
      await clear(provider);
      await useProfile(provider, 'test-model-b');
      await sealInto(provider, key);
      expect(await run(), provider).toEqual({ ok: false, reason: 'not_cleared_for_minors' });
    }
    expect(calls).toHaveLength(0);
  });
});

describe('fallback', () => {
  beforeEach(async () => {
    await clear('anthropic');
    await clear('workers-ai');
    await sealInto('anthropic', ANTHROPIC_KEY);
    await sealInto('workers-ai', WORKERS_KEY);
    await useProfile('anthropic', 'test-model-a', [{ provider: 'workers-ai', model: 'test-model-b' }]);
  });

  it('the first provider fails: the next cleared one answers, and both are counted', async () => {
    replies.push(() => httpError(529), () => openaiOk(['From ', 'the backup.'], 13, 4));
    const got = await run();
    // Workers AI's answer ends at its stop, so its counts are estimated from the text (16 characters back: 4).
    expect(got).toMatchObject({ ok: true, text: 'From the backup.', tokensOut: 4, provider: 'workers-ai', model: 'test-model-b' });
    expect((got as { tokensIn: number }).tokensIn).toBeGreaterThan(0);
    expect(calls.map((c) => new URL(c.url).hostname)).toEqual(['api.anthropic.com', 'api.cloudflare.com']);
    const usage = await q(`select provider_id, requests, failures from control.ai_usage order by provider_id`);
    expect(usage).toEqual([
      { provider_id: 'anthropic', requests: 1, failures: 1 },
      { provider_id: 'workers-ai', requests: 1, failures: 0 },
    ]);
    expect(await q(`select requests from family.ai_daily`)).toEqual([{ requests: 1 }]);
  });

  it('a decline is a failure too; when every provider fails the answer is "failed"', async () => {
    replies.push(() => anthropicRefusal(), () => httpError(500));
    expect(await run()).toEqual({ ok: false, reason: 'failed' });
    expect(en[REFUSAL_MESSAGE.failed]).toBeTruthy();
  });

  it('no fallback once text has been shown', async () => {
    replies.push(() => {
      const body = 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Half"}}\n\n';
      return new Response(body, { status: 200 });
    });
    const pieces: string[] = [];
    expect(await run(ctxA, ask(), (p) => pieces.push(p))).toEqual({ ok: false, reason: 'failed' });
    expect(pieces).toEqual(['Half']);
    expect(calls).toHaveLength(1);
  });
});

describe('the daily cap', () => {
  beforeEach(async () => {
    await clear('anthropic');
    await useProfile('anthropic', 'test-model-a');
    await sealInto('anthropic', ANTHROPIC_KEY);
  });

  it('is Control’s setting, read live; at the cap the family is told and the refusal is counted', async () => {
    await q(`update control.settings set value = '2'::jsonb where key = 'family.ai.daily_requests'`);
    replies.push(() => anthropicOk(['one']), () => anthropicOk(['two']));
    expect((await run()).ok).toBe(true);
    expect((await run()).ok).toBe(true);
    expect(await run()).toEqual({ ok: false, reason: 'cap_reached' });
    expect(calls).toHaveLength(2);
    expect(await q(`select requests from family.ai_daily where account_id = $1`, [A])).toEqual([{ requests: 2 }]);
    expect(await q(`select requests, cap_refusals from control.ai_usage`)).toEqual([{ requests: 2, cap_refusals: 1 }]);
    // Raised in Control: the same family may ask again at once.
    await q(`update control.settings set value = '3'::jsonb where key = 'family.ai.daily_requests'`);
    replies.push(() => anthropicOk(['three']));
    expect((await run()).ok).toBe(true);
    // Another family's day is its own.
    replies.push(() => anthropicOk(['b']));
    expect((await run({ accountId: B, childFirstNames: ['Ravi'], day: DAY })).ok).toBe(true);
  });

  it('a new India day starts a new count', async () => {
    await q(`update control.settings set value = '1'::jsonb where key = 'family.ai.daily_requests'`);
    replies.push(() => anthropicOk(['a']), () => anthropicOk(['b']));
    expect((await run()).ok).toBe(true);
    expect((await run()).ok).toBe(false);
    expect((await run({ ...ctxA, day: '2026-10-22' })).ok).toBe(true);
  });

  it('staff preparing the shared library take no family cap place (C300)', async () => {
    await q(`update control.settings set value = '0'::jsonb where key = 'family.ai.daily_requests'`);
    expect(await run()).toEqual({ ok: false, reason: 'cap_reached' });
    replies.push(() => anthropicOk(['prepared']));
    expect((await run({ accountId: A, childFirstNames: [], day: DAY, staffPreparing: true })).ok).toBe(true);
    expect(await q(`select requests from family.ai_daily where account_id = $1`, [A])).toEqual([]);
  });

  it('the cap message, in English and Hindi', () => {
    expect(en[REFUSAL_MESSAGE.cap_reached]).toBe("You have used today's explanations. More tomorrow.");
    expect(hi[REFUSAL_MESSAGE.cap_reached]).toMatch(/कल/);
  });
});

describe('three steps, so no connection is held during the call (F1-3)', () => {
  it('prepare takes the cap place; send needs no database and goes out once; record writes the metering', async () => {
    await clear('anthropic');
    await useProfile('anthropic', 'test-model-a');
    await sealInto('anthropic', ANTHROPIC_KEY);
    replies.push(() => anthropicOk(['Plants ', 'make food.'], 5, 3));
    const prepared = await asFamily(A, (tx) => prepareText(tx as never, ctxA, 'family.resolver', ask('Asha asks: what is photosynthesis?')));
    if (!prepared.ok) throw new Error('not prepared');
    expect(await q(`select requests from family.ai_daily`)).toEqual([{ requests: 1 }]);
    expect(calls).toHaveLength(0);
    // The prepared call keeps the opened key out of reach: nothing a log could print.
    expect(JSON.stringify(prepared)).not.toContain(ANTHROPIC_KEY);
    const pieces: string[] = [];
    const sent = await prepared.text.send((p) => pieces.push(p));
    expect(sent.result).toMatchObject({ ok: true, text: 'Plants make food.', provider: 'anthropic' });
    expect(pieces).toEqual(['Plants ', 'make food.']);
    expect(calls[0].body).not.toContain('Asha');
    expect(await q(`select * from control.ai_usage`)).toHaveLength(0);
    // One cap place, one request: a second send goes nowhere.
    expect((await prepared.text.send()).result).toEqual({ ok: false, reason: 'failed' });
    expect(calls).toHaveLength(1);
    await asFamily(A, (tx) => sent.record(tx as never));
    expect(await q(`select requests, failures, tokens_in::int, tokens_out::int from control.ai_usage`)).toEqual([{ requests: 1, failures: 0, tokens_in: 5, tokens_out: 3 }]);
  });

  it('a refusal at prepare sends nothing and takes no cap place', async () => {
    expect(await asFamily(A, (tx) => prepareText(tx as never, ctxA, 'family.resolver', ask()))).toEqual({ ok: false, reason: 'not_switched_on' });
    expect(await q(`select * from family.ai_daily`)).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });
});

describe('the stand-in', () => {
  it('answers without a key or a network call outside production, when asked for', async () => {
    process.env.AI_PLATFORM_STAND_IN = 'on';
    await q(`insert into control.ai_providers (provider_id, cleared_for_minors, cleared_terms_url, cleared_at, cleared_by) values ('stand-in', true, 'https://example.org/none', now(), $1) on conflict do nothing`, [FOUNDER]);
    await useProfile('stand-in', 'any');
    const got = await run(ctxA, { ...ask(), responseFormat: 'json' });
    expect(got.ok && JSON.parse(got.text)).toEqual({ stand_in: true, model: 'any', questions: 1 });
    expect(calls).toHaveLength(0);
    await useProfile(null, null);
  });

  it('cannot exist in a production build', () => {
    expect(standInAllowed({ NODE_ENV: 'production', AI_PLATFORM_STAND_IN: 'on' })).toBe(false);
    expect(adapterFor('stand-in', { NODE_ENV: 'production', AI_PLATFORM_STAND_IN: 'on' })).toBeNull();
    expect(adapterFor('stand-in', { NODE_ENV: 'test' })).toBeNull();
  });
});
