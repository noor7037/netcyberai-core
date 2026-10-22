import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { childrenAiStatus, llamaVersions, modelName, providerName } from '@/lib/family/ai-status';

// W2 (C315): the page "How the AI works" says what is switched on for children from Control's own settings, read as
// the family role with no account, and carries the Llama licence's attribution only when a Llama model is in use.

const FOUNDER = 'fe000000-0000-4000-8000-0000000000f1';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asGate = <T>(fn: (tx: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role family_app');
    return fn(tx);
  });

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
}, 90_000);
afterAll(async () => {
  await db?.stop();
});

describe('what the AI does for children now', () => {
  it('nothing is on before the founder clears a provider and chooses it', async () => {
    expect((await asGate((tx) => childrenAiStatus(tx))).map((s) => [s.feature, s.on])).toEqual([
      ['explanations', false],
      ['photos', false],
      ['voice', false],
      ['safety', false],
    ]);
  });

  it('a feature is on only with its provider cleared, its model chosen and the profile switched on', async () => {
    await db.pg.query(`update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/terms', cleared_at = now(), cleared_by = $1 where provider_id = 'workers-ai'`, [FOUNDER]);
    await db.pg.query(`update control.ai_profiles set provider_id = 'workers-ai', model = '@cf/meta/llama-4-scout-17b-16e-instruct' where profile_id = 'family.resolver'`);
    await db.pg.query(`update control.ai_profiles set provider_id = 'workers-ai', model = '@cf/meta/llama-guard-3-8b' where profile_id = 'family.moderation'`);
    await db.pg.query(`update control.ai_profiles set provider_id = 'workers-ai', model = '@cf/openai/whisper-large-v3-turbo', enabled = false where profile_id = 'family.voice_input'`);
    const s = await asGate((tx) => childrenAiStatus(tx));
    expect(s.find((x) => x.feature === 'explanations')).toEqual({ feature: 'explanations', on: true, provider: 'workers-ai', model: '@cf/meta/llama-4-scout-17b-16e-instruct' });
    expect(s.find((x) => x.feature === 'voice')).toMatchObject({ on: false, model: null });
    expect(llamaVersions(s)).toEqual(['Llama 3.1', 'Llama 4']);
    expect([providerName('workers-ai'), modelName('@cf/meta/llama-guard-3-8b')]).toEqual(['Cloudflare Workers AI', 'llama-guard-3-8b']);
  });

  it('no Llama model, no Llama notice', () => {
    expect(llamaVersions([{ feature: 'explanations', on: true, provider: 'anthropic', model: 'claude-haiku' }])).toEqual([]);
  });
});
