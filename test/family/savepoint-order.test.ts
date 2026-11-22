import { describe, expect, it } from 'vitest';
import { drawAllowed } from '@/lib/family/draw-done';
import { guarded } from '@/lib/family/chapter-store';

// The parent area crashed for a family with two children (founder's launch check, 22 Nov 2026): reads of several
// children ran at once on one connection and their savepoints interleaved. This fake connection keeps Postgres's rules:
// releasing a savepoint also releases every later one, and releasing or rolling back to one that is gone fails.
function fakeConnection() {
  const stack: string[] = [];
  const query = async (sql: string) => {
    await new Promise((r) => setTimeout(r, Math.random() * 3));
    const m = /^(savepoint|release savepoint|rollback to savepoint) (\w+)/.exec(sql);
    if (!m) return { rows: [{ draw_open: true }] };
    const [, op, name] = m;
    if (op === 'savepoint') stack.push(name);
    else {
      const at = stack.lastIndexOf(name);
      if (at < 0) throw new Error(`savepoint "${name}" does not exist`);
      stack.length = op === 'release savepoint' ? at : at + 1;
    }
    return { rows: [] };
  };
  return { query, stack };
}

describe('savepoint-guarded reads on one connection', () => {
  it('several children read at once never break each other', async () => {
    const db = fakeConnection();
    const out = await Promise.all(['a', 'b', 'c', 'd'].map((c) => drawAllowed(db, 'acct', c)));
    expect(out).toEqual([true, true, true, true]);
    const named = await Promise.all([1, 2, 3].map((n) => guarded(db, 'chapter_list', async () => n, 0)));
    expect(named).toEqual([1, 2, 3]);
    expect(db.stack).toEqual([]);
  });

  it('a failure in one read does not stop the next', async () => {
    const db = fakeConnection();
    const missing = Object.assign(new Error('no table'), { code: '42P01' });
    const results = await Promise.allSettled([
      guarded(db, 'one', async () => { throw new Error('boom'); }, 0),
      guarded(db, 'two', async () => { throw missing; }, 7),
      guarded(db, 'three', async () => 3, 0),
    ]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled', 'fulfilled']);
    expect((results[1] as PromiseFulfilledResult<number>).value).toBe(7);
    expect((results[2] as PromiseFulfilledResult<number>).value).toBe(3);
  });
});
