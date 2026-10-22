import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { childHabit, checkReward, createJar, giveJar, mondayOf, openJar, parentHabit, removeJar, setGoal, talkQuestion, weeklySummary } from '@/lib/family/habit';
import type { FamilyChild } from '@/lib/family/children';

// M2-3 (C277): the forgiving weekly goal, badges for mastered topics, the reward jar, the weekly summary and tonight's
// talk question. Made-up names only. 2026-10-22 is a Thursday; its week starts on Monday 2026-10-19.

const ACCOUNT = 'f8000000-0000-4000-8000-0000000000a1';
const CHILD = 'f8000000-0000-4000-8000-0000000000a2';
const CHILD2 = 'f8000000-0000-4000-8000-0000000000a3';
const OTHER_ACCOUNT = 'f8000000-0000-4000-8000-0000000000b1';
const OTHER_CHILD = 'f8000000-0000-4000-8000-0000000000b2';
const VERSION = 'f8000000-0000-4000-8000-0000000000c1';
const CH = 'f8000000-0000-4000-8000-0000000000d1';
const T1 = 'cbse.c9.science.u1.ch01.t01';
const T2 = 'cbse.c9.science.u1.ch01.t02';
const T3 = 'cbse.c9.science.u1.ch01.t03';
const TODAY = '2026-10-22';
const child: FamilyChild = { childId: CHILD, firstName: 'Tara', classLevel: 9, board: 'CBSE', language: 'en', style: 'en', stateCode: 'IN-KA', freeSubject: 'science' } as FamilyChild;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };
const asFamily = <T>(fn: (tx: Tx) => Promise<T>, account = ACCOUNT): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [account]);
    return fn(tx);
  });
const planDay = (childId: string, day: string, done: boolean) =>
  db.pg.query(
    `insert into family.plan_days (account_id, child_id, day, items, minutes, completed_at) values ($1, $2, $3, '[{"kind":"next","topicKey":"${T1}","subject":"science"}]'::jsonb, 10, ${done ? 'now()' : 'null'})
     on conflict (child_id, day) do update set completed_at = excluded.completed_at`,
    [ACCOUNT, childId, day]
  );
const progress = (childId: string, topic: string, answered: number, correct: number, mastered: string | null) =>
  db.pg.query(
    `insert into family.topic_progress (account_id, child_id, topic_key, subject, answered, correct, first_correct_on, last_correct_on, mastered_on) values ($1, $2, $3, 'science', $4, $5, '2026-10-01', '2026-10-01', $6)`,
    [ACCOUNT, childId, topic, answered, correct, mastered]
  );
const answer = (childId: string, topic: string, day: string) =>
  db.pg.query(
    `insert into family.attempts (account_id, child_id, subject, topic_key, item_key, kind, answer, correct, answered_on) values ($1, $2, 'science', $3, 'q', 'check', 'x', true, $4)`,
    [ACCOUNT, childId, topic, day]
  );

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-habit-tests-0123456789';
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'habit@example.org'), ('${OTHER_ACCOUNT}', 'other-habit@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code, free_subject, free_subject_set_at) values
      ('${CHILD}', '${ACCOUNT}', 'Tara', 9, 'CBSE', 'en', 'en', 'IN-KA', 'science', now()),
      ('${CHILD2}', '${ACCOUNT}', 'Veer', 9, 'CBSE', 'en', 'en', 'IN-KA', 'science', now()),
      ('${OTHER_CHILD}', '${OTHER_ACCOUNT}', 'Zoya', 9, 'CBSE', 'en', 'en', 'IN-KA', 'science', now());
    insert into control.app_flags (app, module, enabled, reason) values ('family', 'habit', true, 'test') on conflict (app, module) do update set enabled = true;
    insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at)
      values ('${VERSION}', 'CBSE', 9, 'science', '2026-27', 1, 'published', 'everyone', 'repository', 'test', 'f8000000-0000-4000-8000-0000000000f1', now());
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

describe('the week and the badges', () => {
  it('counts only completed plan days in the last 7 India days, oldest first', async () => {
    await planDay(CHILD, '2026-10-15', true); // 8 days ago: outside
    await planDay(CHILD, '2026-10-16', true);
    await planDay(CHILD, '2026-10-20', true);
    await planDay(CHILD, '2026-10-21', false); // a plan not done counts for nothing
    await planDay(CHILD, TODAY, true);
    const h = await asFamily((tx) => childHabit(tx, ACCOUNT, child, TODAY, 'en'));
    expect(h.week).toEqual([true, false, false, false, true, false, true]);
    expect([h.doneDays, h.goal]).toEqual([3, 5]);
  });

  it('gives a badge per mastered topic only, newest first, none for days or time', async () => {
    await progress(CHILD, T1, 4, 4, '2026-10-21');
    await progress(CHILD, T2, 3, 1, null);
    await progress(CHILD, T3, 5, 5, '2026-10-10');
    const h = await asFamily((tx) => childHabit(tx, ACCOUNT, child, TODAY, 'en'));
    expect(h.badges.map((b) => b.title)).toEqual(['States of matter', 'Diffusion']);
  });
});

describe('the weekly goal', () => {
  it('is 1 to 7 whole days', async () => {
    for (const bad of [0, 8, 5.5, '5', null]) expect(await asFamily((tx) => setGoal(tx, ACCOUNT, CHILD, bad))).toBe('goal_bad');
    expect(await asFamily((tx) => setGoal(tx, ACCOUNT, CHILD, 3))).toBe('ok');
    expect((await asFamily((tx) => childHabit(tx, ACCOUNT, child, TODAY, 'en'))).goal).toBe(3);
  });
});

describe('the reward jar', () => {
  it('checks the reward: plain text, 1 to 80 characters, no 12-digit number', () => {
    expect(checkReward('  A trip   to the park ')).toBe('A trip to the park');
    expect(checkReward('')).toBeNull();
    expect(checkReward('x'.repeat(81))).toBeNull();
    expect(checkReward('call 1234 5678 9012')).toBeNull();
    expect(checkReward('<b>toy</b>')).toBeNull();
    expect(checkReward(12)).toBeNull();
  });

  it('refuses a bad target, a second open jar, and gives only a full jar', async () => {
    expect(await asFamily((tx) => createJar(tx, ACCOUNT, CHILD, 'A book', 2, TODAY))).toBe('target_bad');
    expect(await asFamily((tx) => createJar(tx, ACCOUNT, CHILD, 'A book', 61, TODAY))).toBe('target_bad');
    expect(await asFamily((tx) => createJar(tx, ACCOUNT, CHILD, 'Call 123456789012', 5, TODAY))).toBe('reward_bad');
    expect(await asFamily((tx) => createJar(tx, ACCOUNT, CHILD, 'A book', 3, TODAY))).toBe('ok');
    expect(await asFamily((tx) => createJar(tx, ACCOUNT, CHILD, 'Another', 5, TODAY))).toBe('jar_exists');
    expect(await asFamily((tx) => giveJar(tx, ACCOUNT, CHILD, TODAY))).toBe('jar_not_full');
  });

  it('fills from plan days on or after its start, sets filled_on once, then can be given', async () => {
    // Started 2026-10-22: the plan day of 10-22 counts, those before do not.
    let jar = await asFamily((tx) => openJar(tx, ACCOUNT, CHILD, TODAY));
    expect([jar?.days, jar?.filled]).toEqual([1, false]);
    await planDay(CHILD, '2026-10-23', true);
    await planDay(CHILD, '2026-10-24', true);
    jar = await asFamily((tx) => openJar(tx, ACCOUNT, CHILD, '2026-10-24'));
    expect([jar?.days, jar?.filled, jar?.filledOn]).toEqual([3, true, '2026-10-24']);
    // Read again later (and with one more day): filled_on is not moved.
    await planDay(CHILD, '2026-10-25', true);
    jar = await asFamily((tx) => openJar(tx, ACCOUNT, CHILD, '2026-10-30'));
    expect([jar?.days, jar?.filledOn]).toEqual([3, '2026-10-24']);
    expect(await asFamily((tx) => removeJar(tx, ACCOUNT, CHILD, '2026-10-30'))).toBe('jar_full');
    expect(await asFamily((tx) => giveJar(tx, ACCOUNT, CHILD, '2026-10-30'))).toBe('ok');
    expect(await asFamily((tx) => openJar(tx, ACCOUNT, CHILD, '2026-10-30'))).toBeNull();
    // After it is given, a new jar can be set.
    expect(await asFamily((tx) => createJar(tx, ACCOUNT, CHILD, 'A new jar', 4, '2026-10-30'))).toBe('ok');
  });

  it('removes an unfilled jar', async () => {
    expect(await asFamily((tx) => removeJar(tx, ACCOUNT, CHILD, '2026-10-30'))).toBe('ok');
    expect(await asFamily((tx) => removeJar(tx, ACCOUNT, CHILD, '2026-10-30'))).toBe('not_found');
  });
});

describe("the weekly summary and tonight's question", () => {
  it('has the Monday of the week', () => {
    expect([mondayOf('2026-10-22'), mondayOf('2026-10-25'), mondayOf('2026-10-19')]).toEqual(['2026-10-19', '2026-10-19', '2026-10-19']);
  });

  it('is made of checked answers only: days vs goal, topics mastered this week, one topic to support', async () => {
    await planDay(CHILD2, '2026-10-18', true); // last week's Sunday: not this week
    await planDay(CHILD2, '2026-10-19', true);
    await planDay(CHILD2, '2026-10-21', true);
    await progress(CHILD2, T1, 4, 4, '2026-10-20'); // mastered this week
    await progress(CHILD2, T2, 4, 1, null); // weakest: 1 of 4
    await progress(CHILD2, T3, 2, 1, null); // 1 of 2
    const s = await asFamily((tx) => weeklySummary(tx, ACCOUNT, CHILD2, TODAY, 'en'));
    expect(s).toEqual({ done: 2, goal: 5, masteredCount: 1, masteredTitles: ['States of matter'], support: 'Evaporation' });
  });

  it('gives a kind line (no topic to support) when nothing is weak, and no talk question without answers', async () => {
    const s = await asFamily((tx) => weeklySummary(tx, OTHER_ACCOUNT, OTHER_CHILD, TODAY, 'en'), OTHER_ACCOUNT);
    expect([s.support, s.masteredCount, s.done]).toEqual([null, 0, 0]);
    expect(await asFamily((tx) => talkQuestion(tx, ACCOUNT, CHILD2, TODAY, 'en'))).toBeNull();
  });

  it('picks the talk question from a topic answered on the latest day, changing by day', async () => {
    await answer(CHILD2, T2, '2026-10-21');
    await answer(CHILD2, T3, '2026-10-21');
    await answer(CHILD2, 'cbse.c9.science.question', '2026-10-22'); // a typed question moves no topic: ignored
    const a = await asFamily((tx) => talkQuestion(tx, ACCOUNT, CHILD2, '2026-10-22', 'en'));
    const b = await asFamily((tx) => talkQuestion(tx, ACCOUNT, CHILD2, '2026-10-23', 'en'));
    expect(['Evaporation', 'Diffusion']).toContain(a?.topic);
    expect(a?.template).not.toBe(b?.template);
    // Nothing answered in the last 7 days: no question.
    expect(await asFamily((tx) => talkQuestion(tx, ACCOUNT, CHILD2, '2026-11-05', 'en'))).toBeNull();
    const p = await asFamily((tx) => parentHabit(tx, ACCOUNT, CHILD2, TODAY, 'en'));
    expect(p.talk).not.toBeNull();
    expect(p.jar).toBeNull();
  });
});

describe('the routes', () => {
  const sign = async (parent: boolean) => {
    const { signFamilySession, signParentMode } = await import('@/lib/family/session');
    const s = { accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' };
    return `ncf_session=${await signFamilySession(s)}; ncf_child=${CHILD}${parent ? `; ncf_parent=${await signParentMode(s)}` : ''}`;
  };
  const call = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', parent: boolean, body?: unknown) => {
    const route = await import('@/app/api/family/habit/route');
    const req = new NextRequest('http://localhost/api/family/habit', { method, headers: { cookie: await sign(parent), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return route[method](req);
  };

  it('child mode cannot change the goal or the jar', async () => {
    expect((await call('PATCH', false, { childId: CHILD, goal: 7 })).status).toBe(403);
    expect((await call('POST', false, { childId: CHILD, reward: 'x', targetDays: 5 })).status).toBe(403);
    expect((await call('DELETE', false, { childId: CHILD })).status).toBe(403);
  });

  it('parent mode changes them, with a clear message for a second jar', async () => {
    expect((await call('PATCH', true, { childId: CHILD, goal: 7 })).status).toBe(200);
    expect((await call('POST', true, { childId: CHILD, reward: 'A picnic', targetDays: 5 })).status).toBe(200);
    const again = await call('POST', true, { childId: CHILD, reward: 'More', targetDays: 5 });
    expect([again.status, (await again.json()).error]).toEqual([409, 'jar_exists']);
    const view = await (await call('GET', false)).json();
    expect([view.goal, view.jar.reward, view.jar.targetDays]).toEqual([7, 'A picnic', 5]);
  });

  it("refuses another account's child", async () => {
    expect((await call('PATCH', true, { childId: OTHER_CHILD, goal: 7 })).status).toBe(404);
    expect((await call('POST', true, { childId: OTHER_CHILD, reward: 'x', targetDays: 5 })).status).toBe(404);
    expect((await call('DELETE', true, { childId: OTHER_CHILD })).status).toBe(404);
    expect((await db.pg.query(`select weekly_goal from family.children where child_id = $1`, [OTHER_CHILD])).rows[0].weekly_goal).toBe(5);
  });
});
