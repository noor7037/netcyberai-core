import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// M2-1 (C275): M2's tables on the real migrations (PGlite), as each role the app uses. Two family accounts never see
// each other's revisits, plans, jars or counts; a row can only name a child of its own account; staff roles reach none
// of them; one open jar per child; families read the video picks a reviewer has not rejected and write them only
// through the two functions; the homework and voice profiles refuse a provider that is not cleared for minors.
// Made-up addresses only.

const A = 'f2000000-0000-4000-8000-0000000000a1';
const B = 'f2000000-0000-4000-8000-0000000000b1';
const CHILD_A = 'f2000000-0000-4000-8000-0000000000a2';
const CHILD_B = 'f2000000-0000-4000-8000-0000000000b2';
const REVIEWER = 'f2000000-0000-4000-8000-0000000000f1';
const TOPIC = 'cbse.c7.sci.ch01.t01';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; affectedRows?: number }> };

const asFamily = <T>(account: string, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [account]);
    return fn(tx);
  });
const asRole = <T>(role: string, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query(`set local role ${role}`);
    return fn(tx);
  });
const refused = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error('expected the database to refuse');
};
const pick = (videoId: string, channelId = 'UCchannel000000000000001', score = 1) => ({
  video_id: videoId,
  channel_id: channelId,
  channel_title: 'A made-up channel',
  title: 'Made-up lesson video',
  duration_s: 600,
  start_s: 0,
  captions: true,
  score,
});

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${A}', 'parent.a@example.org'), ('${B}', 'parent.b@example.org');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code)
    values ('${CHILD_A}', '${A}', 'Asha', 7, 'CBSE', 'hi', 'hinglish', 'IN-UP'),
           ('${CHILD_B}', '${B}', 'Ravi', 9, 'CBSE', 'en', 'en', 'IN-HR');
  `);
}, 60_000);
afterAll(async () => {
  await db?.stop();
});

describe('M2 family tables: own account only', () => {
  it('each account writes and reads only its own revisits, plans, jars and counts', async () => {
    await asFamily(A, async (tx) => {
      await tx.query(`insert into family.revisits (account_id, child_id, topic_key, subject, step, set_on, due_on) values ($1, $2, $3, 'science', 1, '2026-10-20', '2026-10-23')`, [A, CHILD_A, TOPIC]);
      await tx.query(`insert into family.plan_days (account_id, child_id, day, items, minutes) values ($1, $2, '2026-10-22', '[{"kind":"next"}]', 20)`, [A, CHILD_A]);
      await tx.query(`insert into family.reward_jars (account_id, child_id, reward, target_days, started_on) values ($1, $2, 'A trip to the fair', 10, '2026-10-22')`, [A, CHILD_A]);
      await tx.query(`insert into family.day_counts (account_id, child_id, day, photo_questions) values ($1, $2, '2026-10-22', 1)`, [A, CHILD_A]);
    });
    const seen = (account: string) =>
      asFamily(account, async (tx) =>
        Promise.all(['revisits', 'plan_days', 'reward_jars', 'day_counts'].map(async (t) => Number((await tx.query(`select count(*)::int as n from family.${t}`)).rows[0].n)))
      );
    expect(await seen(A)).toEqual([1, 1, 1, 1]);
    expect(await seen(B)).toEqual([0, 0, 0, 0]);
  });

  it("refuses a row for another account, or naming another account's child", async () => {
    expect(
      await refused(() => asFamily(A, (tx) => tx.query(`insert into family.day_counts (account_id, child_id, day) values ($1, $2, '2026-10-22')`, [B, CHILD_B])))
    ).toMatch(/row-level security/);
    expect(
      await refused(() => asFamily(A, (tx) => tx.query(`insert into family.revisits (account_id, child_id, topic_key, subject, step, set_on, due_on) values ($1, $2, $3, 'science', 1, '2026-10-20', '2026-10-23')`, [A, CHILD_B, TOPIC])))
    ).toMatch(/foreign key/);
  });

  it('one open jar per child; a revisit comes after the day it was set', async () => {
    expect(
      await refused(() => asFamily(A, (tx) => tx.query(`insert into family.reward_jars (account_id, child_id, reward, target_days, started_on) values ($1, $2, 'Another', 5, '2026-10-22')`, [A, CHILD_A])))
    ).toMatch(/unique/);
    expect(
      await refused(() => asFamily(A, (tx) => tx.query(`insert into family.revisits (account_id, child_id, topic_key, subject, step, set_on, due_on) values ($1, $2, $3, 'science', 2, '2026-10-20', '2026-10-20')`, [A, CHILD_A, TOPIC])))
    ).toMatch(/check/);
  });

  it('the parent sets the weekly goal, from 1 to 7 days', async () => {
    await asFamily(A, (tx) => tx.query(`update family.children set weekly_goal = 4 where child_id = $1`, [CHILD_A]));
    expect((await db.pg.query(`select weekly_goal from family.children where child_id = $1`, [CHILD_A])).rows[0].weekly_goal).toBe(4);
    expect(await refused(() => asFamily(A, (tx) => tx.query(`update family.children set weekly_goal = 8 where child_id = $1`, [CHILD_A])))).toMatch(/check/);
  });

  it('staff roles reach none of the M2 family tables', async () => {
    for (const role of ['app_user', 'nca_super']) {
      expect(await refused(() => asRole(role, (tx) => tx.query(`select * from family.plan_days`)))).toMatch(/permission denied/);
      expect(await refused(() => asRole(role, (tx) => tx.query(`select * from family.revisits`)))).toMatch(/permission denied/);
    }
  });
});

describe('the video picks', () => {
  it('a family saves the provider’s picks only through the function, and reads those not rejected', async () => {
    expect(
      await refused(() =>
        asFamily(A, (tx) => tx.query(`insert into content.video_picks (topic_key, language, video_id, channel_id, channel_title, title, duration_s, captions, score) values ($1, 'en', 'abcdefghijk', 'UCx1', 'c', 't', 60, true, 1)`, [TOPIC]))
      )
    ).toMatch(/permission denied|row-level security/);
    const saved = await asFamily(A, (tx) => tx.query(`select content.save_video_picks($1, 'en', $2::jsonb) as n`, [TOPIC, JSON.stringify([pick('aaaaaaaaaaa'), pick('bbbbbbbbbbb')])]));
    expect(saved.rows[0].n).toBe(2);
    // A reviewer pins one and rejects the other; the next refresh keeps both as they were.
    await db.pg.query(`update content.video_picks set status = 'pinned', reviewed_by = $2, reviewed_at = now() where topic_key = $1 and video_id = 'aaaaaaaaaaa'`, [TOPIC, REVIEWER]);
    await db.pg.query(`update content.video_picks set status = 'rejected', reviewed_by = $2, reviewed_at = now() where topic_key = $1 and video_id = 'bbbbbbbbbbb'`, [TOPIC, REVIEWER]);
    await asFamily(B, (tx) => tx.query(`select content.save_video_picks($1, 'en', $2::jsonb)`, [TOPIC, JSON.stringify([pick('aaaaaaaaaaa'), pick('bbbbbbbbbbb'), pick('ccccccccccc')])]));
    const rows = await asFamily(B, (tx) => tx.query(`select video_id, status from content.video_picks where topic_key = $1 order by video_id`, [TOPIC]));
    expect(rows.rows).toEqual([
      { video_id: 'aaaaaaaaaaa', status: 'pinned' },
      { video_id: 'ccccccccccc', status: 'auto' },
    ]);
  });

  it('skips a blocked channel and refuses more than five picks or a malformed one', async () => {
    await db.pg.query(`insert into content.video_channels (channel_id, title, kind, added_by) values ('UCblocked', 'Blocked', 'blocked', $1)`, [REVIEWER]);
    const n = await asFamily(A, (tx) => tx.query(`select content.save_video_picks('cbse.c7.sci.ch02.t01', 'hi', $1::jsonb) as n`, [JSON.stringify([pick('ddddddddddd', 'UCblocked')])]));
    expect(n.rows[0].n).toBe(0);
    const six = Array.from({ length: 6 }, (_, i) => pick(`eeeeeeeeee${i}`));
    expect(await refused(() => asFamily(A, (tx) => tx.query(`select content.save_video_picks($1, 'en', $2::jsonb)`, [TOPIC, JSON.stringify(six)])))).toMatch(/bad picks/);
    expect(await refused(() => asFamily(A, (tx) => tx.query(`select content.save_video_picks($1, 'en', $2::jsonb)`, [TOPIC, JSON.stringify([pick('short')])])))).toMatch(/check/);
  });

  it("takes a search from the day's quota until it is spent", async () => {
    const take = () => asFamily(A, async (tx) => (await tx.query(`select content.take_video_search('2026-10-22', 2) as ok`)).rows[0].ok);
    expect([await take(), await take(), await take()]).toEqual([true, true, false]);
    // A limit of 0 pauses searching and counts nothing.
    expect(await asFamily(A, async (tx) => (await tx.query(`select content.take_video_search('2026-10-23', 0) as ok`)).rows[0].ok)).toBe(false);
    expect((await db.pg.query(`select count(*)::int as n from content.video_searches where day = '2026-10-23'`)).rows[0].n).toBe(0);
    expect(await refused(() => asFamily(A, (tx) => tx.query(`select * from content.video_searches`)))).toMatch(/permission denied/);
  });
});

describe('control', () => {
  it("holds M2's settings, the video provider and the two profiles, and the minors check guards the profiles", async () => {
    const settings = (await db.pg.query(`select key, value from control.settings where key in ('family.plan_minutes', 'family.revisit_first_days', 'family.revisit_second_days', 'family.photo_questions_per_day') order by key`)).rows;
    expect(settings.map((r: { key: string; value: unknown }) => [r.key, Number(r.value)])).toEqual([
      ['family.photo_questions_per_day', 3],
      ['family.plan_minutes', 20],
      ['family.revisit_first_days', 3],
      ['family.revisit_second_days', 10],
    ]);
    expect((await db.pg.query(`select 1 from control.ai_providers where provider_id = 'youtube'`)).rows).toHaveLength(1);
    expect(await refused(() => db.pg.query(`update control.ai_profiles set provider_id = 'openai', model = 'some-model' where profile_id = 'family.homework'`))).toMatch(/not cleared for minors/);
  });
});
