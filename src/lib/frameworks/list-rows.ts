import type { ListColumn, SettingDefinition, SettingValue } from '@/lib/contracts/settings';

// The rows of a 'list' setting as the settings screen edits them (17 §1a, C230-AJ). The engine (settings-engine.ts)
// is what checks a list; these only make a person's typing into rows the engine can take: a row left empty is
// dropped, and a row added gets its code, made once from another column's words (an exam type "Olympiad" gets the
// code "olympiad") and never changed after, because records refer to the row by that code.

export type ListRow = Record<string, string | number | boolean>;

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

// A code from some words, in a-z, 0-9 and _ : not in `taken`, and matching `pattern` when the column has one.
export function codeFromText(words: string, taken: readonly string[], pattern: RegExp | null): string {
  const slug = words.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'row';
  // A code starts with a letter.
  const base = /^[a-z]/.test(slug) ? slug : `x_${slug}`;
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? base : `${base}_${n}`;
    if (!taken.includes(candidate) && (!pattern || pattern.test(candidate))) return candidate;
  }
  return `${base}_${taken.length + 1}`;
}

export const codeColumnOf = (columns: readonly ListColumn[] | undefined): ListColumn | null => columns?.find((c) => c.codeFrom) ?? null;

// The rows ready to send: words trimmed, rows with nothing typed dropped, new rows given their code.
export function finishListRows(def: Pick<SettingDefinition, 'columns'>, rows: readonly ListRow[]): ListRow[] {
  const columns = def.columns ?? [];
  const code = codeColumnOf(columns);
  const pattern = code?.pattern ? new RegExp(code.pattern) : null;
  const typed = (r: ListRow) => columns.some((c) => c.type === 'text' && c.key !== code?.key && text(r[c.key]) !== '');
  const kept = rows
    .map((r) => Object.fromEntries(columns.map((c) => [c.key, c.type === 'text' ? text(r[c.key]) : r[c.key]])) as ListRow)
    .filter((r) => typed(r) || (code !== null && text(r[code.key]) !== ''));
  if (!code) return kept;
  const taken = kept.map((r) => text(r[code.key])).filter(Boolean);
  return kept.map((r) => {
    if (text(r[code.key])) return r;
    const made = codeFromText(text(r[code.codeFrom as string]), taken, pattern);
    taken.push(made);
    return { ...r, [code.key]: made };
  });
}

// A list in a few words, for the "default" line and the history: the first column that is words and not a code.
export function listSummary(def: Pick<SettingDefinition, 'columns'>, rows: readonly ListRow[]): string {
  const column = (def.columns ?? []).find((c) => c.type === 'text' && !c.codeFrom);
  if (!column) return String(rows.length);
  return rows.map((r) => text(r[column.key])).filter(Boolean).join(', ').slice(0, 300);
}

// A row kept by its code (it has been saved) must still be named: the first row, 1-based, that is not, or null.
export function blankKeptRow(def: Pick<SettingDefinition, 'columns'>, rows: readonly ListRow[]): number | null {
  const columns = def.columns ?? [];
  const code = codeColumnOf(columns);
  if (!code) return null;
  const at = rows.findIndex((r) => text(r[code.key]) !== '' && !columns.some((c) => c.type === 'text' && c.key !== code.key && text(r[c.key]) !== ''));
  return at < 0 ? null : at + 1;
}

export const asRows =(v: SettingValue | undefined | ''): ListRow[] => (Array.isArray(v) ? (v as unknown as ListRow[]) : []);
