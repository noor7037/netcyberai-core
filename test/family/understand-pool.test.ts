import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { standInAdapter } from '@/lib/ai/adapters';
import type { AdapterRequest, AdapterResult } from '@/lib/ai/adapters';

// F1-3: no database connection is held while the AI answers. Understand runs on the real AI platform here, through the
// stand-in adapter made slow: the call waits until the test lets it go. The pool has ONE connection (DB_POOL_MAX=1),
// so if the request still held it during the call, any other query would wait for the call to end.

const ACCOUNT = 'f7000000-0000-4000-8000-0000000000a1';
const CHILD = 'f7000000-0000-4000-8000-0000000000a2';
const VERSION = 'f7000000-0000-4000-8000-0000000000c1';
const FOUNDER = 'f7000000-0000-4000-8000-0000000000f1';
const CHAPTER = 'cbse.c9.mathematics.u1.ch01';
const TOPIC = `${CHAPTER}.t01`;

const item = (id: string) => ({ id, question: `Question ${id}?`, options: ['10', '12', '14', '16'], answer: 1, hint: 'Think of pairs.', why: 'Because 6 + 6 = 12.', wrong: ['One pair', '', 'Two more', 'Doubled'] });
const LINES = [
  { type: 'explanation', title: 'Adding', idea: 'Adding puts groups together.', example: 'Two rotis and three rotis make five rotis.', steps: ['Count the first group', 'Count on'], terms: [] },
  { type: 'check', items: [item('c1'), item('c2')] },
  { type: 'practice', items: [item('p1')] },
].map((b) => JSON.stringify(b));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let R: Record<string, any>;
let jar: Record<string, string>;
const vendor = { reply: { ok: true, text: '', tokensIn: 30, tokensOut: 40 } as AdapterResult, started: () => {}, release: () => {} };

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-understand-pool-tests-0123456789';
  process.env.AI_PLATFORM_STAND_IN = 'on';
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'pool@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ('${CHILD}', '${ACCOUNT}', 'Nila', 9, 'CBSE', 'en', 'en', 'IN-KL');
    insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at)
      values ('${VERSION}', 'CBSE', 9, 'mathematics', '2026-27', 1, 'published', 'everyone', 'repository', 'test', '${FOUNDER}', now());
    insert into content.chapters (chapter_id, version_id, chapter_key, position, title_en, source_url, source_page, checked_on)
      values ('f7000000-0000-4000-8000-0000000000d1', '${VERSION}', '${CHAPTER}', 1, 'Number System', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
    insert into content.topics (version_id, chapter_id, topic_key, position, title_en, source_url, source_page, checked_on)
      values ('${VERSION}', 'f7000000-0000-4000-8000-0000000000d1', '${TOPIC}', 1, 'Rational numbers', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
    insert into control.ai_providers (provider_id, cleared_for_minors, cleared_terms_url, cleared_at, cleared_by) values ('stand-in', true, 'https://example.org/none', now(), '${FOUNDER}') on conflict do nothing;
    update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/none', cleared_at = now(), cleared_by = '${FOUNDER}', enabled = true where provider_id = 'stand-in';
    update control.ai_profiles set provider_id = 'stand-in', model = 'slow', fallback = '[]', enabled = true where profile_id = 'family.resolver';
    update control.settings set value = '20'::jsonb where key = 'family.ai.daily_requests';
  `);
  const { signFamilySession } = await import('@/lib/family/session');
  jar = { ncf_session: await signFamilySession({ accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' }), ncf_child: CHILD };
  R = { understand: await import('@/app/api/family/understand/route') };
  // The slow vendor: it says it has started, then waits for the test before it answers.
  vi.spyOn(standInAdapter, 'streamText').mockImplementation(async (_request: AdapterRequest, onDelta: (t: string) => void) => {
    vendor.started();
    await new Promise<void>((r) => (vendor.release = r));
    if (vendor.reply.ok) for (const l of LINES) onDelta(`${l}\n`);
    return vendor.reply;
  });
}, 90_000);
afterAll(async () => {
  vi.restoreAllMocks();
  delete process.env.AI_PLATFORM_STAND_IN;
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});
beforeEach(() => {
  vendor.reply = { ok: true, text: LINES.join('\n'), tokensIn: 30, tokensOut: 40 };
});

const post = (body: unknown) =>
  new NextRequest('http://localhost/api/family/understand', { method: 'POST', headers: { 'content-type': 'application/json', cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: JSON.stringify(body) });

// Starts a request and resolves once the vendor call is pending; `answer` (wrapped, so awaiting the call does not wait
// for it) is the whole stream once released.
async function pendingCall(body: unknown) {
  const started = new Promise<void>((r) => (vendor.started = r));
  const res: Response = await R.understand.POST(post(body));
  const answer = res.text().then((t) => t.trim().split('\n').map((l) => JSON.parse(l)));
  await started;
  return { answer };
}
const within = <T>(p: Promise<T>, ms = 3000) => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error('the pool connection is still held')), ms))]);
// The database owner's view, read only while no request holds the one connection.
const usage = async () => (await db.pg.query(`select coalesce(sum(requests), 0)::int as requests, coalesce(sum(failures), 0)::int as failures, coalesce(sum(tokens_in), 0)::int as tokens_in from control.ai_usage`)).rows[0];

describe('no database connection is held while the AI answers', () => {
  it('another query through the pool runs during the call; the cap is taken before it, the metering and the library after', async () => {
    const { withFamilyContext } = await import('@/lib/family/db');
    const { answer } = await pendingCall({ kind: 'topic', key: TOPIC });
    // The call is pending: the pool's only connection is free.
    const seen = await within(withFamilyContext({ accountId: ACCOUNT, tokenVersion: 0 }, (c) => c.query(`select requests from family.ai_daily where account_id = $1`, [ACCOUNT])));
    expect(seen.rows).toEqual([{ requests: 1 }]);
    expect(await usage()).toEqual({ requests: 0, failures: 0, tokens_in: 0 });
    expect((await db.pg.query(`select count(*)::int n from content.responses`)).rows[0].n).toBe(0);
    vendor.release();
    const ev = await answer;
    expect(ev[0]).toMatchObject({ t: 'meta', cached: false });
    expect(ev.filter((e) => e.t === 'block').map((e) => e.block.type)).toEqual(['explanation', 'check', 'practice']);
    expect(ev.at(-1)).toEqual({ t: 'done', complete: true });
    expect(await usage()).toEqual({ requests: 1, failures: 0, tokens_in: 30 });
    expect((await db.pg.query(`select topic_key, prompt_version from content.responses`)).rows).toEqual([{ topic_key: TOPIC, prompt_version: 'v1' }]);
  });

  it('a library hit is served without asking the AI', async () => {
    const res: Response = await R.understand.POST(post({ kind: 'topic', key: TOPIC }));
    const ev = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
    expect(ev[0]).toMatchObject({ t: 'meta', cached: true });
    expect(standInAdapter.streamText).toHaveBeenCalledTimes(1);
  });

  it('a vendor failure is still metered, after the call', async () => {
    vendor.reply = { ok: false, failure: 'http', status: 529 };
    const { withFamilyContext } = await import('@/lib/family/db');
    const { en } = await import('@/lib/i18n/messages/en');
    const { answer } = await pendingCall({ kind: 'topic', key: TOPIC, followUp: 'simpler' });
    await within(withFamilyContext({ accountId: ACCOUNT, tokenVersion: 0 }, (c) => c.query('select 1')));
    vendor.release();
    expect(await answer).toEqual([{ t: 'refused', reason: 'failed', message: en['ai.failed'] }]);
    expect(await usage()).toEqual({ requests: 2, failures: 1, tokens_in: 30 });
  });

  it('signed out everywhere during the call: nothing is written for the family, but the call is still counted', async () => {
    const { answer } = await pendingCall({ kind: 'chapter', key: CHAPTER });
    await db.pg.query(`update family.accounts set token_version = token_version + 1 where account_id = $1`, [ACCOUNT]);
    vendor.release();
    const ev = await answer;
    expect(ev.at(-1)).toMatchObject({ t: 'refused', reason: 'not_found' });
    expect((await db.pg.query(`select count(*)::int n from content.responses where topic_key = $1`, [CHAPTER])).rows[0].n).toBe(0);
    expect(await usage()).toEqual({ requests: 3, failures: 1, tokens_in: 60 });
  });
});
