// The completed drawing templates (C514): family.draw_completions, one row per child per template, ids and a time only,
// and the parent's "Allow all drawing activities" switch (family.child_settings.draw_open). On the family's own
// transaction (family_app; the tables' policies keep every row to its own account and, on a child's phone, that child).
// Each query runs under a savepoint, so a database without the migration yet answers "nothing" instead of failing a page.

import { drawTemplate, fitsClass, isLocked } from './draw-templates';
import { oneAtATime } from './savepoint';

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }> };

const NOT_THERE = new Set(['42P01', '42703']);

// A name of its own per call: the parent area reads several children at once on one connection.
let seq = 0;
function guarded<T>(db: Db, fn: () => Promise<T>, fallback: T): Promise<T> {
  return oneAtATime(db, () => guardedNow(db, fn, fallback));
}

async function guardedNow<T>(db: Db, fn: () => Promise<T>, fallback: T): Promise<T> {
  const sp = `draw_done_${++seq % 1_000_000}`;
  await db.query(`savepoint ${sp}`);
  try {
    const out = await fn();
    await db.query(`release savepoint ${sp}`);
    return out;
  } catch (err) {
    if (!NOT_THERE.has((err as { code?: string }).code ?? '')) throw err;
    await db.query(`rollback to savepoint ${sp}`);
    return fallback;
  }
}

export type DoneCheck = 'ok' | 'unknown' | 'wrong_class' | 'locked';

// Whether this child may complete this template: it exists, fits the child's class and, when it needs a parent, the
// parent has allowed drawing activities.
export function checkDone(templateId: unknown, classLevel: number, allowed: boolean): DoneCheck {
  const t = drawTemplate(templateId);
  if (!t) return 'unknown';
  if (!fitsClass(t, classLevel)) return 'wrong_class';
  if (isLocked(t, allowed)) return 'locked';
  return 'ok';
}

export function drawAllowed(db: Db, accountId: string, childId: string): Promise<boolean> {
  return guarded(
    db,
    async () => ((await db.query(`select draw_open from family.child_settings where account_id = $1 and child_id = $2`, [accountId, childId])).rows[0] as { draw_open?: boolean } | undefined)?.draw_open === true,
    false
  );
}

// The parent's switch; 'not_found' for a child the account does not have.
export async function setDrawAllowed(db: Db, accountId: string, childId: string, allowed: boolean): Promise<'ok' | 'not_found' | 'not_ready'> {
  const own = await db.query(`select 1 from family.children where account_id = $1 and child_id = $2`, [accountId, childId]);
  if (!own.rows.length) return 'not_found';
  return guarded<'ok' | 'not_ready'>(
    db,
    async () => {
      await db.query(
        `insert into family.child_settings as s (account_id, child_id, draw_open) values ($1, $2, $3)
         on conflict (child_id) do update set draw_open = excluded.draw_open, updated_at = now() where s.account_id = excluded.account_id`,
        [accountId, childId, allowed]
      );
      return 'ok';
    },
    'not_ready'
  );
}

// Kept once: a second Done for the same template keeps the first time. true when kept (or already there).
export function recordDone(db: Db, accountId: string, childId: string, templateId: string): Promise<boolean> {
  return guarded(
    db,
    async () => {
      await db.query(`insert into family.draw_completions (account_id, child_id, template_id) values ($1, $2, $3) on conflict (child_id, template_id) do nothing`, [accountId, childId, templateId]);
      return true;
    },
    false
  );
}

export function listDone(db: Db, accountId: string, childId: string): Promise<string[]> {
  return guarded(
    db,
    async () => ((await db.query(`select template_id from family.draw_completions where account_id = $1 and child_id = $2 order by completed_at`, [accountId, childId])).rows as { template_id: string }[]).map((r) => r.template_id),
    []
  );
}

// Counts only: completed in the window [from, to) and in all.
export function doneCounts(db: Db, accountId: string, childId: string, from: string, to: string): Promise<{ week: number; all: number }> {
  return guarded(
    db,
    async () => {
      const r = (
        await db.query(
          `select count(*) filter (where completed_at >= $3::timestamptz and completed_at < $4::timestamptz)::int as week, count(*)::int as all_n
             from family.draw_completions where account_id = $1 and child_id = $2`,
          [accountId, childId, from, to]
        )
      ).rows[0] as { week: number; all_n: number } | undefined;
      return { week: Number(r?.week ?? 0), all: Number(r?.all_n ?? 0) };
    },
    { week: 0, all: 0 }
  );
}

// The completions of every child of the account in [from, to), by child (for the weekly report).
export function doneByChild(db: Db, accountId: string, from: string, to: string): Promise<Map<string, number>> {
  return guarded(
    db,
    async () =>
      new Map(
        ((await db.query(`select child_id, count(*)::int as n from family.draw_completions where account_id = $1 and completed_at >= $2::timestamptz and completed_at < $3::timestamptz group by child_id`, [accountId, from, to])).rows as { child_id: string; n: number }[]).map((r) => [
          String(r.child_id),
          Number(r.n),
        ])
      ),
    new Map<string, number>()
  );
}
