import { isFilterGroup, type FilterCondition, type FilterField, type FilterGroup, type FilterValue, type ListQuery } from '@/lib/contracts/filters';

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
