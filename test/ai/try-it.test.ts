import { randomBytes, randomUUID } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// W17-B1: Control → AI's "Try it" on the real migrations (PGlite), with the stand-in adapters (no key, no network).
// One live call of a feature's current route on made-up inputs: the answer by its kind, which place in the route
// answered, the counts and a ledger row marked 'try_it', one audit row, and no family's daily place. The route is the
// founder's (super_admin) without the authenticator step. Made-up people only.

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
import { POST } from '@/app/api/control/ai/try/route';
import { prepareSmokeTest, type TryResult } from '@/lib/ai/platform';
import { STAND_IN_AUDIO } from '@/lib/ai/adapters';
import { SMOKE_PHOTO_JPEG, SMOKE_SPEECH, SMOKE_TOPIC } from '@/demo-fixture/ai-smoke/inputs';
import { TRY_SAMPLES } from '@/lib/ai/try-samples';
import { PROFILES } from '@/lib/ai/platform';
import { indiaDate } from '@/lib/time/india';

const FOUNDER = randomUUID();
const PRINCIPAL = randomUUID();
const SCHOOL = randomUUID();
const q = async (sql: string, params: unknown[] = []) => (await h.db.pg.query(sql, params)).rows;

let founderAal1 = '';
let principal = '';
async function cookieFor(sub: string, role: string, schoolId: string | null, aal: 'aal1' | 'aal2') {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal, sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
const tryIt = async (profileId: string, cookie = founderAal1) => {
  const res = await POST(
    new NextRequest('https://www.netcyberai.test/api/control/ai/try', {
      method: 'POST',
      body: JSON.stringify({ profileId }),
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    })
  );
  return { status: res.status, body: (await res.json()) as TryResult & { error?: string } };
};
const route = (profileId: string, chain: { provider: string; model: string }[]) =>
  q(`update control.ai_profiles set provider_id = $2, model = $3, fallback = $4::jsonb, enabled = true where profile_id = $1`, [profileId, chain[0]?.provider ?? null, chain[0]?.model ?? null, JSON.stringify(chain.slice(1))]);
const ledger = (profileId: string) => q(`select provider_id, route_position, outcome, source from control.ai_usage_ledger where profile_id = $1 order by attempt_id`, [profileId]);
const requests = async (profileId: string) => Number((await q(`select coalesce(sum(requests), 0)::int as n from control.ai_usage where profile_id = $1`, [profileId]))[0].n);

let fetched = 0;
beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-ai-try-it-tests-0123456789';
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_PLATFORM_STAND_IN = 'on';
  h.db = await startHarnessDb({ port: 0 });
  await q(`insert into schools (school_id, name, jurisdiction) values ($1, 'Made-up School', 'IN-HR')`, [SCHOOL]);
  await q(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder'), ($2, $3, 'principal', 'Priya Principal')`, [FOUNDER, PRINCIPAL, SCHOOL]);
  await q(`insert into control.ai_providers (provider_id, cleared_for_minors, cleared_terms_url, cleared_at, cleared_by) values ('stand-in', true, 'https://example.org/none', now(), $1) on conflict do nothing`, [FOUNDER]);
  founderAal1 = await cookieFor(FOUNDER, 'super_admin', null, 'aal1');
  principal = await cookieFor(PRINCIPAL, 'principal', SCHOOL, 'aal1');
}, 90_000);
afterAll(async () => {
  await h.db?.stop();
});
beforeEach(async () => {
  // No vendor is ever reached: the stand-in answers in-process; any network call fails the test.
  fetched = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      fetched += 1;
      throw new Error('no network in this test');
    })
  );
  await q(`update control.ai_profiles set provider_id = null, model = null, fallback = '[]', enabled = true`);
  await q(`delete from control.ai_usage_ledger`);
  await q(`delete from control.ai_usage`);
  await q(`delete from control.ai_provider_health`);
});

describe('Try it: one live call of the current route, on made-up inputs', () => {
  it('every profile in the registry has a sample', () => {
    expect(Object.keys(TRY_SAMPLES).sort()).toEqual(PROFILES.map((p) => p.id).sort());
  });

  it('a text feature: the answer as text, who answered and how long, counted, one ledger row marked try_it, one audit row', async () => {
    await route('copilot.draft', [{ provider: 'stand-in', model: 'any' }]);
    const got = await tryIt('copilot.draft');
    expect(got.status).toBe(200);
    expect(got.body).toMatchObject({ ok: true, provider: 'stand-in', model: 'any', backupUsed: false, output: { kind: 'text', text: 'Stand-in answer (1 question).' } });
    expect(got.body.ms).toBeGreaterThanOrEqual(0);
    expect(await ledger('copilot.draft')).toEqual([{ provider_id: 'stand-in', route_position: 0, outcome: 'ok', source: 'try_it' }]);
    expect(await requests('copilot.draft')).toBe(1);
    const [audit] = await q(`select actor_user_id, target_id, after_state from audit_log where event_action = 'ai.try_it' order by created_at desc limit 1`);
    expect(audit.actor_user_id).toBe(FOUNDER);
    expect(audit.target_id).toBe('copilot.draft');
    expect(audit.after_state).toMatchObject({ profileId: 'copilot.draft', provider: 'stand-in', model: 'any', ok: true, backupUsed: false });
    // The audit row keeps the outcome only, never the answer.
    expect(JSON.stringify(audit.after_state)).not.toContain('Stand-in answer');
    expect(fetched).toBe(0);
  });

  it('a JSON feature: the answer parsed; a children’s feature takes no family’s daily place', async () => {
    await route('family.resolver', [{ provider: 'stand-in', model: 'any' }]);
    const got = await tryIt('family.resolver');
    expect(got.body).toMatchObject({ ok: true, output: { kind: 'json', json: { stand_in: true, model: 'any', questions: 1 } } });
    expect(await q(`select * from family.ai_daily`)).toEqual([]);
  });

  it('a backup answers when Primary cannot (no key): Backup used, and the route walked as a child’s call', async () => {
    await q(`update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/terms', cleared_at = now(), cleared_by = $1 where provider_id = 'openai'`, [FOUNDER]);
    await route('family.resolver', [
      { provider: 'openai', model: 'gpt-made-up' },
      { provider: 'stand-in', model: 'any' },
    ]);
    const got = await tryIt('family.resolver');
    expect(got.body).toMatchObject({ ok: true, provider: 'stand-in', backupUsed: true });
    expect(await ledger('family.resolver')).toEqual([{ provider_id: 'stand-in', route_position: 1, outcome: 'ok', source: 'try_it' }]);
    // The route first: a provider still in a children's route cannot lose its clearance.
    await route('family.resolver', []);
    await q(`update control.ai_providers set cleared_for_minors = false, cleared_terms_url = null, cleared_at = null, cleared_by = null where provider_id = 'openai'`);
  });

  it('the voice: the English and the Hindi line both synthesized, as two clips; no voice allowance taken', async () => {
    await route('family.text_to_speech', [{ provider: 'stand-in', model: 'any' }]);
    const got = await tryIt('family.text_to_speech');
    const audio = Buffer.from(STAND_IN_AUDIO).toString('base64');
    expect(got.body).toMatchObject({
      ok: true,
      output: {
        kind: 'audio',
        clips: [
          { language: 'en', audioBase64: audio, mediaType: 'audio/mpeg' },
          { language: 'hi', audioBase64: audio, mediaType: 'audio/mpeg' },
        ],
      },
    });
    expect((await ledger('family.text_to_speech')).map((r) => r.source)).toEqual(['try_it', 'try_it']);
    expect(await requests('family.text_to_speech')).toBe(2);
    expect(await q(`select * from family.ai_daily`)).toEqual([]);
  });

  it('speech to text: the bundled WAV is heard, the words come back as text', async () => {
    await route('family.voice_input', [{ provider: 'stand-in', model: 'any' }]);
    const got = await tryIt('family.voice_input');
    expect(got.body).toMatchObject({ ok: true, output: { kind: 'text', text: 'What is photosynthesis?' } });
    expect(await ledger('family.voice_input')).toEqual([{ provider_id: 'stand-in', route_position: 0, outcome: 'ok', source: 'try_it' }]);
  });

  it('the safety check: the verdict on the sample pair', async () => {
    await route('family.moderation', [{ provider: 'stand-in', model: 'any' }]);
    const got = await tryIt('family.moderation');
    expect(got.body).toMatchObject({ ok: true, output: { kind: 'json', json: { safe: true, categories: [] } } });
    expect((await ledger('family.moderation')).map((r) => r.source)).toEqual(['try_it']);
  });

  it('no provider set: a plain failure, nothing sent, nothing counted, still audited', async () => {
    const got = await tryIt('exams.mark');
    expect(got.status).toBe(200);
    expect(got.body).toEqual({ ok: false, provider: null, model: null, ms: 0, backupUsed: false, failure: 'not_switched_on' });
    expect(await ledger('exams.mark')).toEqual([]);
    expect(await requests('exams.mark')).toBe(0);
    expect(fetched).toBe(0);
    const [audit] = await q(`select after_state from audit_log where event_action = 'ai.try_it' and target_id = 'exams.mark' order by created_at desc limit 1`);
    expect(audit.after_state).toMatchObject({ ok: false, failure: 'not_switched_on' });
  });

  it('the realtime call with no provider: not switched on, no token minted', async () => {
    const got = await tryIt('family.voice_call');
    expect(got.body).toMatchObject({ ok: false, failure: 'not_switched_on' });
  });
});

describe('the smoke test, beside Try it', () => {
  it('still records its counts, and its ledger rows say smoke and move no circuit', async () => {
    await route('family.resolver', [{ provider: 'stand-in', model: 'any' }]);
    const ctx = { accountId: FOUNDER, childFirstNames: [], day: indiaDate() };
    const run = <T,>(fn: (db: never) => Promise<T>) =>
      h.db.pg.transaction(async (tx) => {
        await (tx as { query: (s: string) => Promise<unknown> }).query('set local role nca_super');
        return fn(tx as never);
      });
    const prepared = await run((db) => prepareSmokeTest(db, ctx, { photoJpegBase64: SMOKE_PHOTO_JPEG, speech: SMOKE_SPEECH, topic: SMOKE_TOPIC }));
    const checks = await prepared.send();
    await run((db) => prepared.record(db));
    expect(checks.filter((c) => c.profile === 'family.resolver').map((c) => [c.check, c.ok])).toEqual([
      ['text', true],
      ['text:system', true],
    ]);
    expect(await ledger('family.resolver')).toEqual([
      { provider_id: 'stand-in', route_position: 0, outcome: 'ok', source: 'smoke' },
      { provider_id: 'stand-in', route_position: 0, outcome: 'ok', source: 'smoke' },
    ]);
    expect(await requests('family.resolver')).toBe(2);
    expect(await q(`select * from control.ai_provider_health where provider_id = 'stand-in'`)).toEqual([]);
  });
});

describe('who may try', () => {
  it('no session and a school principal are refused; the founder without the authenticator step passes', async () => {
    expect((await tryIt('copilot.draft', '')).status).toBe(401);
    expect((await tryIt('copilot.draft', principal)).status).toBe(403);
    expect((await tryIt('copilot.draft', founderAal1)).status).toBe(200);
  });

  it('a profile the code does not know is refused before anything runs', async () => {
    const got = await tryIt('family.made_up');
    expect(got.status).toBe(400);
    expect(await q(`select 1 from audit_log where event_action = 'ai.try_it' and target_id = 'family.made_up'`)).toEqual([]);
  });
});
