import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// M2-11 and M2-12's migration (C285, C286): Control reads M2's counts through one definer function and nothing else in
// family.*; a family adds one to a response's asks through its function and can change nothing else of a response.

const A = 'f9000000-0000-4000-8000-0000000000a1';
const CHILD = 'f9000000-0000-4000-8000-0000000000a2';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(role: string, fn: (tx: any) => Promise<T>, account = ''): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query(`set local role ${role}`);
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [account]);
    return fn(tx);
  });

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${A}', 'health@example.org');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ('${CHILD}', '${A}', 'Ira', 7, 'CBSE', 'en', 'en', 'IN-KA');
    insert into family.plan_days (account_id, child_id, day, items, minutes, completed_at) values ('${A}', '${CHILD}', (now() at time zone 'Asia/Kolkata')::date, '[{"kind":"next","topicKey":"a.t1","subject":"science"}]', 10, now());
    insert into family.day_counts (account_id, child_id, day, photo_questions, voice_seconds) values ('${A}', '${CHILD}', (now() at time zone 'Asia/Kolkata')::date, 2, 40);
    insert into content.responses (response_id, board_id, class_level, subject, topic_key, language, style, prompt_version, schema_version, blocks, provider, model)
      values ('f9000000-0000-4000-8000-0000000000c1', 'CBSE', 7, 'science', 'cbse.c7.sci.ch01.t01', 'en', 'en', 'v3', 1, '[]', 'p', 'm');
  `);
}, 90_000);
afterAll(async () => {
  await db?.stop();
});

describe('M2 counts for Control', () => {
  it('the platform role reads counts only; it still reaches no family table', async () => {
    const c = await as('nca_super', async (tx) => (await tx.query(`select family.m2_counts() as c`)).rows[0].c);
    expect(c).toMatchObject({ plans_built_7d: 1, plans_done_7d: 1, children_plan_done_7d: 1, photo_questions_today: 2, voice_seconds_7d: 40 });
    await expect(as('nca_super', (tx) => tx.query(`select * from family.plan_days`))).rejects.toThrow(/permission denied/);
    await expect(as('family_app', (tx) => tx.query(`select family.m2_counts()`), A)).rejects.toThrow(/permission denied/);
  });
});

describe('asks on a response', () => {
  it('a family adds one through the function, and cannot set it', async () => {
    await as('family_app', (tx) => tx.query(`select content.count_response_ask('f9000000-0000-4000-8000-0000000000c1')`), A);
    await as('family_app', (tx) => tx.query(`select content.count_response_ask('f9000000-0000-4000-8000-0000000000c1')`), A);
    expect((await db.pg.query(`select asks from content.responses`)).rows[0].asks).toBe(2);
    await expect(as('family_app', (tx) => tx.query(`update content.responses set asks = 999`), A)).rejects.toThrow(/permission denied/);
  });
});
