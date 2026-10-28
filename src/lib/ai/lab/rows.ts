import type { LabLink, LabResult } from './store';
import type { LabTable } from './table';

// The Quality Lab's results as one flat table (W6-C, C397): a row per case and model, sortable by a column. Pure, so
// the order is tested. A cell not run yet has no result and sorts last in either direction.

export type FlatRow = { key: string; caseId: string; column: number; link: LabLink; result: LabResult | null };
export const SORT_KEYS = ['case', 'model', 'time', 'tokens', 'cost', 'score'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type Sort = { key: SortKey; dir: 'asc' | 'desc' } | null;

export function flatRows(table: LabTable): FlatRow[] {
  return table.rows.flatMap((row) =>
    row.cells.map((result, column) => ({ key: `${row.caseId} ${column}`, caseId: row.caseId, column, link: table.columns[column], result })),
  );
}

const value = (r: FlatRow, key: SortKey): string | number | null => {
  const x = r.result;
  switch (key) {
    case 'case':
      return r.caseId;
    case 'model':
      return `${r.link.provider} ${r.link.model}`;
    case 'time':
      return x ? x.latencyMs : null;
    case 'tokens':
      return x ? x.tokensIn + x.tokensOut : null;
    case 'cost':
      return x ? x.costUsd : null;
    case 'score':
      return x ? x.score : null;
  }
};

// A stable sort: rows with an equal (or no) value keep the run's own order. Blind mode sorts by the column's letter,
// so `modelLabel` gives the text to compare for the model column.
export function sortRows(rows: FlatRow[], sort: Sort, modelLabel?: (r: FlatRow) => string): FlatRow[] {
  if (!sort) return rows;
  const sign = sort.dir === 'asc' ? 1 : -1;
  const get = (r: FlatRow) => (sort.key === 'model' && modelLabel ? modelLabel(r) : value(r, sort.key));
  return rows
    .map((r, i) => ({ r, i, v: get(r) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.i - b.i;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v), 'en', { numeric: true });
      return c ? c * sign : a.i - b.i;
    })
    .map((x) => x.r);
}

// A click on a column: ascending, then descending, then the run's own order.
export function nextSort(cur: Sort, key: SortKey): Sort {
  if (!cur || cur.key !== key) return { key, dir: 'asc' };
  return cur.dir === 'asc' ? { key, dir: 'desc' } : null;
}
