import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// M2-12 (C286): the review queue for cached responses (docs/family-app/11 L1). Each serving of a cached response from
// the library adds one ask (a fresh AI answer adds none); Control lists AI-made responses most asked first; "Mark
// checked" makes families see "Checked by NetCyberAI"; "Withdraw" hides it and the next ask makes a fresh one; both
// write an audit row. The oldest asked-for response against Control's target feeds M2-11's alerts. A family session
// reaches none of it. The model is scripted; the routes run on the real migrations (PGlite). Made-up names only.

const h = vi.hoisted(() => ({ db: null as unknown as { url: string; pg: { exec: (sql: string) => Promise<unknown>; transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>; query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }; stop: () => Promise<void> } }));
const ai = vi.hoisted(() => ({ lines: [] as string[], calls: 0 }));

vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  return {
    ...real,
    withTenantContext: (claims: { role: string; sub: string; schoolId: string | null }, fn: (db: unknown) => Promise<unknown>) =>
      h.db.pg.transaction(async (tx: any) => {
        await tx.query(`set local role ${claims.role === 'super_admin' ? 'nca_super' : 'app_user'}`);
        await tx.query(`select set_config('app.current_tenant_id', $1, true)`, [claims.schoolId ?? '00000000-0000-0000-0000-000000000000']);
        await tx.query(`select set_config('app.current_role', $1, true)`, [claims.role]);
        await tx.query(`select set_config('app.current_user_id', $1, true)`, [claims.sub]);
        return fn(tx);
      }),
  };
});
vi.mock('@/lib/ai/platform', async (original) => ({
  ...(await original<typeof import('@/lib/ai/platform')>()),
  activePromptVersion: async () => 'v1',
  // The safety check (C314) passes everything here; test/w2/moderation.test.ts covers it.
  prepareModeration: async () => ({ ok: true, moderation: { check: async () => ({ safe: true, categories: [] }), record: async () => {} } }),
  prepareText: async () => {
    ai.calls += 1;
    const lines = [...ai.lines];
    return {
      ok: true,
      text: {
        send: async (onDelta: (t: string) => void) => {
          for (const l of lines) onDelta(`${l}\n`);
          return { result: { ok: true, text: lines.join('\n'), tokensIn: 1, tokensOut: 1, provider: 'anthropic', model: 'test-model' }, record: async () => {} };
        },
      },
    };
  },
}));

// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';

const FOUNDER = 'c7000000-0000-4000-8000-0000000000f1';
const ACCOUNT = 'c7000000-0000-4000-8000-0000000000a1';
const CHILD = 'c7000000-0000-4000-8000-0000000000a2';
const VERSION = 'c7000000-0000-4000-8000-0000000000c1';
const TOPIC = 'cbse.c9.mathematics.u1.ch01.t01';
const OTHER_TOPIC = 'cbse.c9.mathematics.u1.ch01.t02';

const item = (id: string) => ({ id, question: `Question ${id}?`, options: ['10', '12', '14', '16'], answer: 1, hint: 'Think of pairs.', why: 'Because 6 + 6 = 12.', wrong: ['a', '', 'b', 'c'] });
const GOOD = [
  { type: 'explanation', title: 'Adding', idea: 'Adding puts groups together.', example: 'Two rotis and three rotis make five rotis.', steps: ['Count the first group', 'Count on'], terms: [] },
  { type: 'check', items: [item('c1')] },
  { type: 'practice', items: [item('p1')] },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let R: Record<string, any>;
let founder = '';
let familyCookie = '';

beforeAll(async () => {
  h.db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = h.db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-m2-12-queue-tests-0123456789';
  await h.db.pg.exec(`
    insert into users (user_id, school_id, role, display_name) values ('${FOUNDER}', null, 'super_admin', 'Made-up Founder');
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'queue@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ('${CHILD}', '${ACCOUNT}', 'Asha', 9, 'CBSE', 'en', 'en', 'IN-UP');
    insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at)
      values ('${VERSION}', 'CBSE', 9, 'mathematics', '2026-27', 1, 'published', 'everyone', 'repository', 'test', '${FOUNDER}', now());
    insert into content.chapters (chapter_id, version_id, chapter_key, position, title_en, source_url, source_page, checked_on)
      values ('c7000000-0000-4000-8000-0000000000d1', '${VERSION}', 'cbse.c9.mathematics.u1.ch01', 1, 'Number System', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
    insert into content.topics (version_id, chapter_id, topic_key, position, title_en, source_url, source_page, checked_on) values
      ('${VERSION}', 'c7000000-0000-4000-8000-0000000000d1', '${TOPIC}', 1, 'Rational numbers', 'https://cbseacademic.nic.in/', '4', '2026-10-21'),
      ('${VERSION}', 'c7000000-0000-4000-8000-0000000000d1', '${OTHER_TOPIC}', 2, 'Irrational numbers', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
  `);
  const token = await signAccessToken({ sub: FOUNDER, role: 'super_admin', schoolId: null, membershipId: null, tokenVersion: 0, aal: 'aal2', sessionId: randomUUID() });
  founder = `${ACCESS_COOKIE}=${token}`;
  const { signFamilySession } = await import('@/lib/family/session');
  familyCookie = `ncf_session=${await signFamilySession({ accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' })}; ncf_child=${CHILD}`;
  R = {
    understand: await import('@/app/api/family/understand/route'),
    list: await import('@/app/api/control/content/responses/route'),
    one: await import('@/app/api/control/content/responses/[responseId]/route'),
    queue: await import('@/lib/content/response-queue'),
  };
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await h.db?.stop();
});

const request = (path: string, body: unknown, cookie: string) =>
  new NextRequest(`http://localhost${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
const understand = async () => (await (await R.understand.POST(request('/api/family/understand', { kind: 'topic', key: TOPIC }, familyCookie))).text()).trim().split('\n').map((l: string) => JSON.parse(l));
const asksOf = async (topic = TOPIC) => (await h.db.pg.query(`select asks, status from content.responses where topic_key = $1 and status <> 'withdrawn'`, [topic])).rows[0];
const at = (responseId: string) => ({ params: { responseId } });

describe('counting asks', () => {
  it('a fresh AI answer adds no ask; each serving from the library adds one', async () => {
    ai.lines = GOOD.map((g) => JSON.stringify(g));
    const fresh = await understand();
    expect(fresh[0]).toMatchObject({ t: 'meta', cached: false });
    expect(await asksOf()).toEqual({ asks: 0, status: 'ai_made' });
    const callsBefore = ai.calls;
    expect((await understand())[0]).toMatchObject({ t: 'meta', cached: true, label: 'ai_made' });
    expect(await asksOf()).toEqual({ asks: 1, status: 'ai_made' });
    await understand();
    expect(await asksOf()).toEqual({ asks: 2, status: 'ai_made' });
    expect(ai.calls).toBe(callsBefore);
  });
});

describe('the queue in Control', () => {
  let topicId = '';
  let otherId = '';
  it('lists AI-made responses most asked first, with their topic, and the oldest against the target', async () => {
    otherId = (
      await h.db.pg.query(
        `insert into content.responses (board_id, class_level, subject, topic_key, language, style, prompt_version, schema_version, blocks, status, provider, model, asks, created_at)
         values ('CBSE', 9, 'mathematics', $1, 'en', 'en', 'v1', 1, $2::jsonb, 'ai_made', 'anthropic', 'test-model', 5, now() - interval '10 days') returning response_id`,
        [OTHER_TOPIC, JSON.stringify(GOOD)]
      )
    ).rows[0].response_id;
    const res = await R.list.GET(request('/api/control/content/responses', undefined, founder));
    expect(res.status).toBe(200);
    const got = await res.json();
    expect(got.responses.map((r: { topicKey: string; asks: number; topicTitle: string }) => [r.topicKey, r.asks, r.topicTitle])).toEqual([
      [OTHER_TOPIC, 5, 'Irrational numbers'],
      [TOPIC, 2, 'Rational numbers'],
    ]);
    expect(got.responses[0]).toMatchObject({ board: 'CBSE', classLevel: 9, subject: 'mathematics', language: 'en', promptVersion: 'v1', status: 'ai_made', ageDays: 10 });
    expect(got.age).toEqual({ oldestDays: 10, targetDays: 7, overdue: true });
    topicId = got.responses[1].responseId;
    const one = await (await R.one.GET(request(`/api/control/content/responses/${topicId}`, undefined, founder), at(topicId))).json();
    expect(one.blocks.map((b: { type: string }) => b.type)).toEqual(['explanation', 'check', 'practice']);
  });

  it('mark checked writes an audit row, and families then see "Checked by NetCyberAI"', async () => {
    const res = await R.one.POST(request(`/api/control/content/responses/${topicId}`, { action: 'check' }, founder), at(topicId));
    expect(res.status).toBe(200);
    expect((await h.db.pg.query(`select status, checked_by from content.responses where response_id = $1`, [topicId])).rows[0]).toEqual({ status: 'checked', checked_by: FOUNDER });
    const audit = (await h.db.pg.query(`select event_action, actor_user_id, before_state, after_state from audit_log where target_type = 'content_response' and target_id = $1`, [topicId])).rows;
    expect(audit).toEqual([{ event_action: 'content.response.checked', actor_user_id: FOUNDER, before_state: { status: 'ai_made' }, after_state: { status: 'checked', asks: 2 } }]);
    expect((await understand())[0]).toMatchObject({ t: 'meta', cached: true, label: 'checked' });
    // Checked once is enough; the queue no longer lists it.
    expect((await R.one.POST(request(`/api/control/content/responses/${topicId}`, { action: 'check' }, founder), at(topicId))).status).toBe(409);
    const queue = await (await R.list.GET(request('/api/control/content/responses', undefined, founder))).json();
    expect(queue.responses.map((r: { responseId: string }) => r.responseId)).toEqual([otherId]);
    const checked = await (await R.list.GET(request('/api/control/content/responses?status=checked', undefined, founder))).json();
    expect(checked.responses.map((r: { responseId: string; checkedByMe: boolean }) => [r.responseId, r.checkedByMe])).toEqual([[topicId, true]]);
  });

  it('withdraw writes an audit row; families stop seeing it and the next ask makes a fresh one', async () => {
    const res = await R.one.POST(request(`/api/control/content/responses/${topicId}`, { action: 'withdraw' }, founder), at(topicId));
    expect(res.status).toBe(200);
    const audit = (await h.db.pg.query(`select event_action, before_state from audit_log where target_type = 'content_response' and target_id = $1 order by audit_id`, [topicId])).rows;
    expect(audit.map((a) => a.event_action)).toEqual(['content.response.checked', 'content.response.withdrawn']);
    expect(audit[1].before_state).toEqual({ status: 'checked' });
    expect((await R.one.GET(request(`/api/control/content/responses/${topicId}`, undefined, founder), at(topicId))).status).toBe(404);
    const before = ai.calls;
    const fresh = await understand();
    expect(fresh[0]).toMatchObject({ t: 'meta', cached: false, label: 'ai_made' });
    expect(ai.calls).toBe(before + 1);
    expect(await asksOf()).toEqual({ asks: 0, status: 'ai_made' });
    expect((await h.db.pg.query(`select count(*)::int n from content.responses where topic_key = $1`, [TOPIC])).rows[0].n).toBe(2);
  });

  it('the oldest-age function says nothing is overdue once the queue is clear', async () => {
    await h.db.pg.query(`update content.responses set status = 'withdrawn', withdrawn_at = now() where response_id = $1`, [otherId]);
    const age = await h.db.pg.transaction(async (tx: any) => R.queue.oldestQueueAgeDays(tx));
    // The fresh response has no asks yet, so it is not waiting on anyone.
    expect(age).toEqual({ oldestDays: null, targetDays: 7, overdue: false });
  });

  it('a family session, or no session, reaches none of the Control routes', async () => {
    const someId = randomUUID();
    for (const cookie of [familyCookie, '']) {
      expect((await R.list.GET(request('/api/control/content/responses', undefined, cookie))).status).toBe(401);
      expect((await R.one.GET(request(`/api/control/content/responses/${someId}`, undefined, cookie), at(someId))).status).toBe(401);
      expect((await R.one.POST(request(`/api/control/content/responses/${someId}`, { action: 'withdraw' }, cookie), at(someId))).status).toBe(401);
    }
  });
});
