import { isFilterGroup, OPERATORS_BY_TYPE, type FilterCondition, type FilterField, type FilterGroup, type FilterValue, type ListDefinition, type ListQuery } from '@/lib/contracts/filters';

// Pure edits of a ListQuery (contracts/filters.ts) for the filter bar: the
// top-level group holds the conditions people add; a quick filter owns the
// one condition on its field. Nested groups (from a saved view) are kept
// as they are and shown as one chip.

export type Options = Record<string, readonly { value: string; label: string }[]>;

const top = (q: ListQuery): FilterGroup => q.filter ?? { combinator: 'and', conditions: [] };

function withConditions(q: ListQuery, conditions: FilterGroup['conditions'], combinator = top(q).combinator): ListQuery {
  const { filter: _f, cursor: _c, ...rest } = q;
  return conditions.length ? { ...rest, filter: { combinator, conditions } } : rest;
}

// The values a quick filter currently has (an 'in' on its field), or [].
export function quickValues(q: ListQuery, field: string): string[] {
  const c = top(q).conditions.find((n): n is FilterCondition => !isFilterGroup(n) && n.field === field && n.op === 'in');
  return Array.isArray(c?.value) ? (c!.value as string[]) : [];
}

export function setQuickFilter(q: ListQuery, field: string, values: readonly string[]): ListQuery {
  const others = top(q).conditions.filter((n) => isFilterGroup(n) || n.field !== field);
  return withConditions(q, values.length ? [...others, { field, op: 'in', value: [...values] }] : others);
}

export function setBooleanQuick(q: ListQuery, field: string, on: boolean): ListQuery {
  const others = top(q).conditions.filter((n) => isFilterGroup(n) || n.field !== field);
  return withConditions(q, on ? [...others, { field, op: 'eq', value: true }] : others);
}

export function addCondition(q: ListQuery, c: FilterCondition): ListQuery {
  return withConditions(q, [...top(q).conditions, c]);
}

export function removeAt(q: ListQuery, index: number): ListQuery {
  return withConditions(q, top(q).conditions.filter((_, i) => i !== index));
}

export function setCombinator(q: ListQuery, combinator: 'and' | 'or'): ListQuery {
  return withConditions(q, top(q).conditions, combinator);
}

export function clearFilters(q: ListQuery): ListQuery {
  const { filter: _f, search: _s, cursor: _c, ...rest } = q;
  return rest;
}

export function setSearch(q: ListQuery, search: string): ListQuery {
  const { search: _s, cursor: _c, ...rest } = q;
  return search.trim() ? { ...rest, search } : rest;
}

const OP_WORDS: Record<string, string> = {
  eq: 'is',
  neq: 'is not',
  contains: 'contains',
  starts_with: 'starts with',
  gt: 'more than',
  gte: 'at least',
  lt: 'less than',
  lte: 'at most',
  between: 'between',
  on: 'on',
  before: 'before',
  after: 'after',
  last_n_days: 'in the last',
  in: 'is',
  not_in: 'is not',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
};

function valueWords(field: FilterField | undefined, v: FilterValue | undefined, options: Options): string {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) {
    const opts = field?.options ?? (field?.optionsFrom ? options[field.optionsFrom] : undefined) ?? [];
    return v.map((x) => opts.find((o) => o.value === x)?.label ?? String(x)).join(', ');
  }
  if (typeof v === 'object' && 'from' in v) return `${v.from} and ${v.to}`;
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

// One applied filter in words, for its chip: "Status is Active, Inactive".
export function describe(node: FilterCondition | FilterGroup, fields: readonly FilterField[], options: Options = {}): string {
  if (isFilterGroup(node)) return `${node.conditions.length} conditions (${node.combinator === 'and' ? 'all' : 'any'})`;
  const field = fields.find((f) => f.key === node.field);
  const v = valueWords(field, node.value, options);
  const days = node.op === 'last_n_days' ? ' days' : '';
  return `${field?.label ?? node.field} ${OP_WORDS[node.op] ?? node.op}${v ? ` ${v}${days}` : ''}`;
}

// ---- Links from outside (C120) -------------------------------------------------
// A `q` from a link (hand-edited, or saved before a field changed) is
// checked against the list's definition before it is used: known fields
// only, the operators of each field's type, the value shape each operator
// needs, and the engine's limits. Anything wrong: the whole query is
// dropped (null) and the list shows unfiltered, never a half-applied filter.

const MAX_DEPTH = 3;
const MAX_CONDITIONS = 30;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const scalar = (v: unknown) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

function validValue(field: FilterField, op: string, v: unknown): boolean {
  if (op === 'is_empty' || op === 'is_not_empty') return v === undefined || v === null;
  if (op === 'in' || op === 'not_in') return Array.isArray(v) && v.length > 0 && v.length <= 200 && v.every(scalar);
  if (op === 'between') return isObj(v) && scalar(v.from) && scalar(v.to) && Object.keys(v).length === 2;
  if (op === 'last_n_days') return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 3660;
  if (field.type === 'boolean') return typeof v === 'boolean';
  if (field.type === 'number') return typeof v === 'number' && Number.isFinite(v);
  if (field.type === 'date') return typeof v === 'string' && DATE.test(v);
  return typeof v === 'string' && v.length >= 1 && v.length <= 200;
}

export function validateListQuery(def: ListDefinition, input: unknown): ListQuery | null {
  if (!isObj(input)) return null;
  const allowed = new Set(['filter', 'search', 'sort', 'columns', 'pageSize', 'cursor']);
  if (Object.keys(input).some((k) => !allowed.has(k))) return null;
  const fields = new Map(def.fields.map((f) => [f.key, f]));
  let count = 0;
  const group = (g: unknown, depth: number): boolean => {
    if (!isObj(g) || depth > MAX_DEPTH || (g.combinator !== 'and' && g.combinator !== 'or') || !Array.isArray(g.conditions)) return false;
    return g.conditions.every((n) => {
      if (isObj(n) && 'combinator' in n) return group(n, depth + 1);
      if (!isObj(n) || ++count > MAX_CONDITIONS) return false;
      const f = typeof n.field === 'string' ? fields.get(n.field) : undefined;
      return !!f && (OPERATORS_BY_TYPE[f.type] as readonly unknown[]).includes(n.op) && validValue(f, n.op as string, n.value);
    });
  };
  if (input.filter !== undefined && !group(input.filter, 1)) return null;
  if (input.search !== undefined && (typeof input.search !== 'string' || input.search.length > 100)) return null;
  if (
    input.sort !== undefined &&
    !(Array.isArray(input.sort) && input.sort.length <= 3 && input.sort.every((s) => isObj(s) && fields.get(s.field as string)?.sortable && (s.dir === 'asc' || s.dir === 'desc')))
  ) {
    return null;
  }
  if (input.columns !== undefined && !(Array.isArray(input.columns) && input.columns.length <= 50 && input.columns.every((c) => fields.has(c as string)))) return null;
  if (input.pageSize !== undefined && !(Number.isInteger(input.pageSize) && (input.pageSize as number) >= 1 && (input.pageSize as number) <= 200)) return null;
  const { cursor: _c, ...query } = input; // a position from an old link is never reused
  return query as ListQuery;
}
