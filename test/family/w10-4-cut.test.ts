import { randomBytes } from 'crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { PROFILES, prepareText, type AiContext } from '@/lib/ai/platform';
import { aiEncryptionKey, sealAiKey } from '@/lib/ai/credentials';
import { jsonObjectScanner, parseBlockLine, type Block } from '@/lib/family/blocks';
import { keep, type Generated, type Pending } from '@/lib/family/resolver';

// W10-4 (C413): answer two on the founder's phone (30 Oct) said "This answer stopped before it was finished" under an
// answer that had every block. Reproduced here on the real AI platform and adapters (vendors replaced at fetch), with
// the answer's lines read as the resolver reads them (the JSON object scanner, then the block checks) and its last line
// made by the resolver's own keep():
//   1. the Primary says no answer text by its first-text time and is given up; the backup sends every block and ends
//      its turn, and its connection drops before the stream's last event: not cut;
//   2. a stream that closes normally after its last block, without its end mark: not cut;
//   3. a stream that stops inside a block: cut (and the block that never came is named).
// Made-up keys and words only.

const ACCOUNT = 'f1040000-0000-4000-8000-0000000000b1';
const NVIDIA_KEY = `nvapi-${'N'.repeat(40)}`;
const ANTHROPIC_KEY = `sk-ant-${'a'.repeat(30)}WXYZ`;
const FOUNDER = 'f1040000-0000-4000-8000-0000000000f1';
const ctx: AiContext = { accountId: ACCOUNT, childFirstNames: ['Tara'], parentEmail: 'cut@example.org', day: '2026-10-30' };

const item = (id: string) => ({ id, question: `Which part makes food (${id})?`, options: ['Root', 'Leaf', 'Stem', 'Flower'], answer: 1, hint: 'It is green.', why: 'Leaves hold chlorophyll.', wrong: ['Roots take in water', '', 'Stems carry water', 'Flowers make seeds'] });
const LINES = [
  JSON.stringify({ type: 'explanation', title: 'Plants make food', idea: 'Leaves make food from light.', paragraphs: ['Green leaves use sunlight, water and air to make sugar.'], example: 'A leaf in the sun', steps: ['Light', 'Sugar'], terms: [] }),
  JSON.stringify({ type: 'check', items: [item('c1')] }),
  JSON.stringify({ type: 'practice', items: [item('p1')] }),
].map((l) => `${l}\n`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
const asFamily = <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: { query: (s: string, p?: unknown[]) => Promise<unknown> }) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [ACCOUNT]);
    return fn(tx);
  });
async function seal(provider: string, key: string) {
  const k = aiEncryptionKey();
  if (!k) throw new Error('test key missing');
  const s = sealAiKey(k, provider, key);
  await q(`insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ($1, $2, $3, $4, $5, $6, $7)`, [provider, s.ciphertext, s.iv, s.tag, s.keyVersion, key.slice(-4), FOUNDER]);
  await q(`update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/terms', cleared_at = now(), cleared_by = $2 where provider_id = $1`, [provider, FOUNDER]);
}

// A vendor's stream: each piece after its wait, then ended, closed with no end mark, or broken. It stops when the call
// is aborted, as a real connection does.
const stream = (pieces: { after: number; data: string }[], signal: AbortSignal | undefined, end: 'close' | 'break' | 'hang') =>
  new Response(
    new ReadableStream({
      async start(c) {
        const enc = new TextEncoder();
        signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')));
        for (const p of pieces) {
          await new Promise((r) => setTimeout(r, p.after));
          if (signal?.aborted) return;
          c.enqueue(enc.encode(p.data));
        }
        if (end === 'close') c.close();
        if (end === 'break') c.error(new TypeError('connection reset'));
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  );
const nvidia = (delta: Record<string, unknown>) => `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`;
const claude = (type: string, data: Record<string, unknown>) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;

let primary: (signal: AbortSignal | undefined) => Response;
let backup: (signal: AbortSignal | undefined) => Response;
const resolver = PROFILES.find((p) => p.id === 'family.resolver') as { firstTextMs?: number };
const saved = resolver.firstTextMs;

beforeAll(async () => {
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_CREDENTIALS_KEY_VERSION = '1';
  db = await startHarnessDb({ port: 0 });
  await q(`insert into family.accounts (account_id, email) values ($1, 'cut@example.org')`, [ACCOUNT]);
  await q(`insert into family.children (account_id, first_name, class_level, board_id, language, style, state_code) values ($1, 'Tara', 7, 'CBSE', 'en', 'en', 'IN-HR')`, [ACCOUNT]);
  await seal('nvidia', NVIDIA_KEY);
  await seal('anthropic', ANTHROPIC_KEY);
  await q(`update control.ai_profiles set provider_id = 'nvidia', model = 'nvidia/made-up-1b', fallback = '[{"provider":"anthropic","model":"made-up-claude"}]'::jsonb, enabled = true where profile_id = 'family.resolver'`);
}, 120_000);
afterAll(async () => {
  await db?.stop();
});
beforeEach(() => {
  resolver.firstTextMs = 300;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => (new URL(String(url)).hostname === 'integrate.api.nvidia.com' ? primary(init.signal ?? undefined) : backup(init.signal ?? undefined)))
  );
});
afterEach(() => {
  resolver.firstTextMs = saved;
  vi.unstubAllGlobals();
});

// The answer as the resolver takes it: the platform's call, the scanner, the block checks, then keep()'s last line.
async function answer() {
  const prepared = await asFamily((tx) => prepareText(tx as never, ctx, 'family.resolver', { system: 'Teach.', messages: [{ role: 'user', content: 'What is photosynthesis?' }] }));
  if (!prepared.ok) throw new Error(`not prepared: ${prepared.reason}`);
  const scan = jsonObjectScanner();
  const kept: Block[] = [];
  const sent = await prepared.text.send((delta) => {
    for (const o of scan(delta)) {
      const b = parseBlockLine(o);
      if (b) kept.push(b);
    }
  });
  const plan = { questionType: 'concept', band: 'c6_8', depth: 'medium', blocks: ['explanation', 'check', 'practice'], visuals: [], lang: 'en' };
  const g = { sent: { result: sent.result, record: async () => {} }, subject: 'science', kept, refusedByModel: false, stopped: false, error: null, objects: kept.length, rejected: [], ...scan.dropped(), plan } as unknown as Generated;
  const pending = { ctx: { refusalWords: (k: string) => k }, line: null, moderation: null, cacheable: false } as unknown as Pending;
  return { result: sent.result, kept: kept.map((b) => b.type), done: await keep({ query: async () => ({ rows: [] }) }, pending, g) };
}

describe('the "stopped before it was finished" notice (W10-4)', () => {
  it('a Primary given up at its first-text time, a backup that ends its turn and then loses its connection: not cut', async () => {
    primary = (signal) => stream([0, 100, 100, 100, 100, 100].map((after) => ({ after, data: nvidia({ reasoning_content: 'hmm ' }) })), signal, 'hang');
    backup = (signal) =>
      stream(
        [
          { after: 0, data: claude('message_start', { message: { id: 'm', usage: { input_tokens: 10, output_tokens: 1 } } }) },
          ...LINES.map((text) => ({ after: 10, data: claude('content_block_delta', { index: 0, delta: { type: 'text_delta', text } }) })),
          { after: 0, data: claude('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 90 } }) },
        ],
        signal,
        'break'
      );
    const got = await answer();
    expect(got.result).toMatchObject({ ok: true, provider: 'anthropic' });
    expect(got.kept).toEqual(['explanation', 'check', 'practice']);
    expect(got.done).toEqual({ t: 'done', complete: true, missing: [], cut: false });
  });

  it('a stream that closes normally after its last block, with no end mark: not cut', async () => {
    primary = (signal) => stream(LINES.map((content) => ({ after: 10, data: nvidia({ content }) })), signal, 'close');
    const got = await answer();
    // The call itself is still counted as cut short (for staff); the child's answer is whole.
    expect(got.result).toEqual({ ok: false, reason: 'failed' });
    expect(got.kept).toEqual(['explanation', 'check', 'practice']);
    expect(got.done).toEqual({ t: 'done', complete: false, missing: [], cut: false });
  });

  it('a stream that stops inside a block: cut, and the block that never came is named', async () => {
    const half = LINES[2].slice(0, 40);
    primary = (signal) => stream([...LINES.slice(0, 2), half].map((content) => ({ after: 10, data: nvidia({ content }) })), signal, 'close');
    const got = await answer();
    expect(got.kept).toEqual(['explanation', 'check']);
    expect(got.done).toEqual({ t: 'done', complete: false, missing: ['practice'], cut: true });
  });
});
