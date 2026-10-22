import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { recordAnswer } from '@/lib/family/learning';
import type { ItemSecret } from '@/lib/family/items';

// D1 (C292): the one celebration. recordAnswer says `masteredNow` only on the answer that makes a topic mastered (right
// on two days at least a week apart), never before and never again after.

const ACCOUNT = 'fa000000-0000-4000-8000-0000000000a1';
const CHILD = 'fa000000-0000-4000-8000-0000000000a2';
const TOPIC = 'cbse.c7.science.u1.ch01.t01';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const item = (i: string): ItemSecret => ({ a: 0, h: 'h', y: 'y', w: ['', 'w'], k: TOPIC, s: 'science', c: CHILD, acct: ACCOUNT, kind: 'practice', exp: Date.now() + 1e7, i, q: 'Q?', o: ['a', 'b'] });
const answer = (day: string, choice: number, i = day) =>
  db.pg.transaction(async (tx: { query: (s: string, p?: unknown[]) => Promise<unknown> }) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [ACCOUNT]);
    return recordAnswer(tx as never, { accountId: ACCOUNT, childId: CHILD, item: item(i), choice, hintUsed: false, day });
  });

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'mastery@example.org');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ('${CHILD}', '${ACCOUNT}', 'Nila', 7, 'CBSE', 'en', 'en', 'IN-TN');
  `);
}, 90_000);
afterAll(async () => {
  await db?.stop();
});

describe('mastery, the moment to celebrate', () => {
  it('only the answer that completes it says so', async () => {
    expect((await answer('2026-10-01', 0)).masteredNow).toBe(false);
    expect((await answer('2026-10-05', 0)).masteredNow).toBe(false);
    expect((await answer('2026-10-09', 1)).masteredNow).toBe(false);
    expect(await answer('2026-10-09', 0, 'again')).toMatchObject({ correct: true, masteredNow: true });
    expect((await answer('2026-10-12', 0)).masteredNow).toBe(false);
  });
});
