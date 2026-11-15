import type { ReviewState } from './types';

// What the importer wants in the database, and what is already there. Matching is by table + natural key.
// A row whose hash is unchanged is left alone, including its review state, so a second run does not un-approve anything.

export type DesiredRow = { table: string; key: string; hash: string; reviewDue: string; write: Record<string, unknown> };
export type StoredRow = { table: string; key: string; hash: string; reviewState: ReviewState };

export type ImportPlan = {
  insert: DesiredRow[];
  update: DesiredRow[];
  unchanged: number;
};

const idOf = (r: { table: string; key: string }) => `${r.table}\t${r.key}`;

export function planImport(desired: readonly DesiredRow[], stored: readonly StoredRow[]): ImportPlan {
  const have = new Map(stored.map((r) => [idOf(r), r]));
  const insert: DesiredRow[] = [];
  const update: DesiredRow[] = [];
  let unchanged = 0;
  const seen = new Set<string>();
  for (const row of desired) {
    const id = idOf(row);
    if (seen.has(id)) throw new Error(`duplicate seed key ${row.table}:${row.key}`);
    seen.add(id);
    const prev = have.get(id);
    if (!prev) insert.push(row);
    else if (prev.hash === row.hash) unchanged += 1;
    else update.push(row);
  }
  return { insert, update, unchanged };
}

// Apply a plan onto an in-memory table. Used by the idempotence test and mirrored by the SQL writer.
export function applyPlan(stored: Map<string, StoredRow>, plan: ImportPlan): void {
  for (const row of [...plan.insert, ...plan.update]) {
    stored.set(idOf(row), { table: row.table, key: row.key, hash: row.hash, reviewState: 'pending' });
  }
}
