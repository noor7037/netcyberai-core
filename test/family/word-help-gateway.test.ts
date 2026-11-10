import { randomBytes } from 'crypto';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { sealAiKey, aiEncryptionKey } from '@/lib/ai/credentials';
import { askWordHelp } from '@/lib/family/word-help';
import { openaiOk } from '../ai/streams';

// W23 integration (C497): word help through the real gateway, the vendor replaced at fetch. Its first version was refused
// before anything was sent (its own time was shorter than the chain minimum); the mocked-gateway tests could not see it.
const A = 'f2000000-0000-4000-8000-0000000000a1';
const FOUNDER = 'f2000000-0000-4000-8000-0000000000f1';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
beforeAll(async () => {
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_CREDENTIALS_KEY_VERSION = '1';
  db = await startHarnessDb({ port: 0 });
  await q(`insert into family.accounts (account_id, email) values ($1, 'parent@example.org') on conflict do nothing`, [A]);
  const s = sealAiKey(aiEncryptionKey()!, 'openai', `sk-${'b'.repeat(30)}QRST`);
  await q(
    `insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ('openai', $1, $2, $3, $4, 'QRST', $5)
     on conflict (provider_id) do update set ciphertext = excluded.ciphertext, iv = excluded.iv, tag = excluded.tag`,
    [s.ciphertext, s.iv, s.tag, s.keyVersion, FOUNDER]
  );
  await q(`update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/terms', cleared_at = now(), cleared_by = $1 where provider_id = 'openai'`, [FOUNDER]);
  // The tutor's route; word help has none of its own and follows it (chainFrom), as on the live database.
  await q(`update control.ai_profiles set provider_id = 'openai', model = 'test-model', fallback = '[]', enabled = true where profile_id = 'family.resolver'`);
  await q(`insert into control.settings (key, value) values ('ai.testing_mode', '"on"') on conflict (key) do update set value = excluded.value`);
}, 120_000);
afterAll(async () => db?.stop());
afterEach(() => vi.unstubAllGlobals());

it('a tapped word goes out on the tutor\'s route, comes back with its meaning and translation, and is kept for the next child', async () => {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (calls.push(String(url)), openaiOk(['{"meaning":"Can be beaten into thin sheets.","translation":"आघातवर्ध्य"}']))));
  const ask = () =>
    db.pg.transaction(async (tx: { query: (s: string, p?: unknown[]) => Promise<unknown> }) => {
      await tx.query('set local role family_app');
      await tx.query(`select set_config('app.current_account_id', $1, true)`, [A]);
      return askWordHelp(tx as never, { accountId: A, childFirstNames: ['Asha'], parentEmail: 'parent@example.org', day: '2026-11-10' }, 10, { text: 'malleable', context: 'Beat a metal gently; if it flattens into a sheet, it is malleable.', to: 'hi' });
    });
  expect(await ask()).toEqual({ ok: true, answer: { meaning: 'Can be beaten into thin sheets.', translation: 'आघातवर्ध्य' }, cached: false });
  expect(calls).toHaveLength(1);
  expect(await ask()).toMatchObject({ ok: true, cached: true });
  expect(calls).toHaveLength(1);
});
