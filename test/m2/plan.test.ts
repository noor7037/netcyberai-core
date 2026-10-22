import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { buildPlan, dayPlan, noteRevisits, parseItems } from '@/lib/family/plan';
import type { FamilyChild } from '@/lib/family/children';

// M2-2 (C276): the mastery loop's returns and the day's plan. A wrong answer brings its topic back after 3 and 10 days
// and a pending return is never pushed later; a return is done by an answer on or after its day. The plan is due
// returns, then weak topics, then the next topics of the syllabus, within the minutes; it is kept for the day; it is
// done only from that day's checked answers, and a deleted answer undoes it. Made-up names and addresses only.

const ACCOUNT = 'f7000000-0000-4000-8000-0000000000a1';
const CHILD = 'f7000000-0000-4000-8000-0000000000a2';
const VERSION = 'f7000000-0000-4000-8000-0000000000c1';
const CH = 'f7000000-0000-4000-8000-0000000000d1';
const T1 = 'cbse.c9.science.u1.ch01.t01';
const T2 = 'cbse.c9.science.u1.ch01.t02';
const T3 = 'cbse.c9.science.u1.ch01.t03';
const child: FamilyChild = { childId: CHILD, firstName: 'Tara', classLevel: 9, board: 'CBSE', language: 'en', style: 'en', stateCode: 'IN-KA', freeSubject: 'science' } as FamilyChild;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const asFamily = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [ACCOUNT]);
    return fn(tx);
  });
const answer = (topic: string, day: string, correct: boolean) =>
  db.pg.query(
    `insert into family.attempts (account_id, child_id, subject, topic_key, item_key, kind, answer, correct, answered_on) values ($1, $2, 'science', $3, 'q', 'check', 'x', $4, $5)`,
    [ACCOUNT, CHILD, topic, correct, day]
  );

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-plan-tests-0123456789';
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'plan@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code, free_subject, free_subject_set_at)
      values ('${CHILD}', '${ACCOUNT}', 'Tara', 9, 'CBSE', 'en', 'en', 'IN-KA', 'science', now());
    insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at)
      values ('${VERSION}', 'CBSE', 9, 'science', '2026-27', 1, 'published', 'everyone', 'repository', 'test', 'f7000000-0000-4000-8000-0000000000f1', now());
    insert into content.chapters (chapter_id, version_id, chapter_key, position, title_en, source_url, source_page, checked_on)
      values ('${CH}', '${VERSION}', 'cbse.c9.science.u1.ch01', 1, 'Matter', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
    insert into content.topics (version_id, chapter_id, topic_key, position, title_en, source_url, source_page, checked_on) values
      ('${VERSION}', '${CH}', '${T1}', 1, 'States of matter', 'https://cbseacademic.nic.in/', '4', '2026-10-21'),
      ('${VERSION}', '${CH}', '${T2}', 2, 'Evaporation', 'https://cbseacademic.nic.in/', '4', '2026-10-21'),
      ('${VERSION}', '${CH}', '${T3}', 3, 'Diffusion', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
  `);
}, 90_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('building a plan', () => {
  const c = (k: string) => ({ topicKey: k, subject: 'science' });
  it('takes returns, then weak topics, then new ones, within the minutes, each topic once', () => {
    expect(buildPlan({ budget: 20, due: [c('a.t1'), c('b.t1')], weak: [c('a.t1'), c('c.t1')], next: [c('d.t1'), c('e.t1')] }).map((i) => [i.kind, i.topicKey])).toEqual([
      ['revisit', 'a.t1'],
      ['revisit', 'b.t1'],
      ['weak', 'c.t1'],
    ]);
    expect(buildPlan({ budget: 20, due: [], weak: [], next: [c('d.t1'), c('e.t1'), c('f.t1')] }).map((i) => i.topicKey)).toEqual(['d.t1', 'e.t1']);
  });
  it('always gives one item, and never more than twelve', () => {
    expect(buildPlan({ budget: 5, due: [], weak: [], next: [c('d.t1')] })).toHaveLength(1);
    expect(buildPlan({ budget: 999, due: Array.from({ length: 20 }, (_, i) => c(`x.t${i}`)), weak: [], next: [] })).toHaveLength(12);
  });
  it('keeps only well-formed stored items', () => {
    expect(parseItems([{ kind: 'next', topicKey: 'a.t1', subject: 'science' }, { kind: 'next' }, { kind: 'odd', topicKey: 'a.t2', subject: 'science' }, 'x'])).toEqual([
      { kind: 'next', topicKey: 'a.t1', subject: 'science', minutes: 10 },
    ]);
  });
});

describe('revisits', () => {
  const note = (day: string, correct: boolean) => asFamily((tx) => noteRevisits(tx, { accountId: ACCOUNT, childId: CHILD, topicKey: T1, subject: 'science', day, correct }));
  const rows = async () => (await db.pg.query(`select step, set_on::text, due_on::text, done_on::text from family.revisits where topic_key = $1 order by step`, [T1])).rows;

  it('a wrong answer brings the topic back after 3 and 10 days; another wrong answer does not push it later', async () => {
    expect(await note('2026-10-20', false)).toBe('2026-10-23');
    expect(await note('2026-10-21', false)).toBe('2026-10-23');
    expect((await rows()).map((r: { due_on: string }) => r.due_on)).toEqual(['2026-10-23', '2026-10-30']);
  });
  it('an answer on or after the day does the return; a wrong one then schedules again', async () => {
    expect(await note('2026-10-22', true)).toBeNull();
    expect((await rows())[0].done_on).toBeNull();
    await note('2026-10-23', true);
    expect((await rows()).map((r: { done_on: string | null }) => r.done_on)).toEqual(['2026-10-23', null]);
    expect(await note('2026-10-24', false)).toBe('2026-10-27');
    expect((await rows()).map((r: { due_on: string; done_on: string | null }) => [r.due_on, r.done_on])).toEqual([
      ['2026-10-27', null],
      ['2026-10-30', null],
    ]);
  });
});

describe("the day's plan", () => {
  it('a new day with a return due: the return first, then the next topics; kept for the day', async () => {
    const day = '2026-10-27';
    const plan = await asFamily((tx) => dayPlan(tx, ACCOUNT, child, day, 'en'));
    expect(plan.items.map((i) => [i.kind, i.topicKey, i.title])).toEqual([
      ['revisit', T1, 'States of matter'],
      ['next', T2, 'Evaporation'],
    ]);
    expect(plan.complete).toBe(false);
    // A new wrong answer on another topic today does not change today's plan.
    await asFamily((tx) => noteRevisits(tx, { accountId: ACCOUNT, childId: CHILD, topicKey: T3, subject: 'science', day: '2026-10-20', correct: false }));
    expect((await asFamily((tx) => dayPlan(tx, ACCOUNT, child, day, 'en'))).items.map((i) => i.topicKey)).toEqual([T1, T2]);
  });

  it('is done only when every item has a checked answer that day; a deleted answer undoes it', async () => {
    const day = '2026-10-27';
    await answer(T1, day, true);
    await answer(T2, '2026-10-26', true);
    expect((await asFamily((tx) => dayPlan(tx, ACCOUNT, child, day, 'en'))).complete).toBe(false);
    await answer(T2, day, false);
    const done = await asFamily((tx) => dayPlan(tx, ACCOUNT, child, day, 'en'));
    expect([done.complete, done.items.every((i) => i.done)]).toEqual([true, true]);
    expect((await db.pg.query(`select completed_at is not null as c from family.plan_days where day = $1`, [day])).rows[0].c).toBe(true);
    await db.pg.query(`delete from family.attempts where topic_key = $1 and answered_on = $2`, [T2, day]);
    expect((await asFamily((tx) => dayPlan(tx, ACCOUNT, child, day, 'en'))).complete).toBe(false);
    expect((await db.pg.query(`select completed_at from family.plan_days where day = $1`, [day])).rows[0].completed_at).toBeNull();
  });
});

describe('the routes', () => {
  const get = async () => {
    const { signFamilySession } = await import('@/lib/family/session');
    const cookie = `ncf_session=${await signFamilySession({ accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' })}; ncf_child=${CHILD}`;
    const { GET } = await import('@/app/api/family/plan/route');
    return GET(new NextRequest('http://localhost/api/family/plan', { headers: { cookie } }));
  };
  it('the plan needs its module switched on in Control', async () => {
    expect((await get()).status).toBe(403);
    await db.pg.query(`insert into control.app_flags (app, module, enabled, reason) values ('family', 'plan', true, 'test')`);
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).items.length).toBeGreaterThan(0);
  });

  it("a wrong answer says when the topic comes back, in the child's language", async () => {
    const { sealItem } = await import('@/lib/family/items');
    const { signFamilySession } = await import('@/lib/family/session');
    const { POST } = await import('@/app/api/family/check/route');
    const token = sealItem({ id: 'q9', question: 'Q?', options: ['a', 'b'], answer: 0, hint: 'h', why: 'y', wrong: ['', 'w'] }, { accountId: ACCOUNT, childId: CHILD, topicKey: T3, subject: 'science', kind: 'practice' }).token;
    const cookie = `ncf_session=${await signFamilySession({ accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' })}; ncf_child=${CHILD}`;
    const res = await POST(new NextRequest('http://localhost/api/family/check', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ token, choice: 1 }) }));
    const body = await res.json();
    expect(body.correct).toBe(false);
    expect(body.revisitOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof body.revisitDay).toBe('string');
  });

  it("deleting all of a child's answers takes their returns and plans with them", async () => {
    const { deleteAllAnswers } = await import('@/lib/family/account');
    await asFamily((tx) => deleteAllAnswers(tx, ACCOUNT, CHILD));
    const n = async (t: string) => Number((await db.pg.query(`select count(*)::int as n from family.${t} where child_id = $1`, [CHILD])).rows[0].n);
    expect([await n('revisits'), await n('plan_days'), await n('attempts')]).toEqual([0, 0, 0]);
  });
});
