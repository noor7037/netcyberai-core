import type { CustomFieldDefinition, CustomFieldEntity } from '@/lib/contracts/custom-fields';
import { customFieldFilterKey } from '@/lib/contracts/custom-fields';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  OPERATORS_BY_TYPE,
  isFilterGroup,
  type FilterCondition,
  type FilterField,
  type FilterFieldType,
  type FilterGroup,
  type ListDefinition,
  type ListPage,
  type ListQuery,
  type SortSpec,
} from '@/lib/contracts/filters';
import type { Sql } from '@/lib/jobs/types';

// The one filter engine (17 §1a, C112). A list declares its fields and, for
// each, a trusted SQL expression; the engine validates a ListQuery against
// that declaration and compiles it to a parameterised WHERE / ORDER BY.
// Nothing from the request is ever spliced into SQL text: field keys only
// select a declared expression, and every value is a bind parameter. The
// query runs inside the caller's tenant context, so RLS still applies.

export type SqlField = {
  expr: string; // trusted SQL expression, text-comparable for 'reference'/'enum'
  sortExpr?: string; // what to order by, when not `expr`
};

export type ListSpec = {
  definition: ListDefinition;
  from: string; // FROM and joins
  idExpr: string; // the row id, for custom fields and a stable order
  schoolExpr: string; // the tenant column, pinned to the caller's school
  select: string; // the row's columns
  fields: Readonly<Record<string, SqlField>>; // one per definition field
  searchExprs: readonly string[];
  customEntity?: CustomFieldEntity;
};

export type CompileError = { path: string; message: string };

export type CompiledQuery = {
  where: string;
  orderBy: string;
  params: unknown[];
  pageSize: number;
  offset: number;
  query: ListQuery; // normalised
};

const MAX_DEPTH = 3;
const MAX_CONDITIONS = 30;
const MAX_IN_VALUES = 200;
const MAX_SORT = 3;
const MAX_SEARCH = 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class Params {
  readonly values: unknown[] = [];
  add(v: unknown): string {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function validDate(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const CUSTOM_TYPE: Record<CustomFieldDefinition['type'], FilterFieldType> = { text: 'text', number: 'number', date: 'date', boolean: 'boolean', list: 'enum' };

// The fields a list serves: its own, plus the school's custom fields.
export function listFields(spec: ListSpec, customFields: readonly CustomFieldDefinition[]): FilterField[] {
  return [
    ...spec.definition.fields,
    ...customFields
      .filter((c) => !c.archived)
      .map((c) => ({
        key: customFieldFilterKey(c.fieldId),
        label: c.label,
        type: CUSTOM_TYPE[c.type],
        ...(c.options ? { options: c.options.map((o) => ({ value: o, label: o })) } : {}),
        column: { defaultVisible: false },
        custom: true,
      })),
  ];
}

// `cf:<fieldId>` resolves to the value of that field for the row.
function customExpr(type: FilterFieldType, schoolParam: string, fieldParam: string, idExpr: string): string {
  const raw = `(select cv.value #>> '{}' from custom_field_values cv where cv.school_id = ${schoolParam} and cv.field_id = ${fieldParam}::uuid and cv.record_id = ${idExpr})`;
  if (type === 'number') return `(${raw})::numeric`;
  if (type === 'date') return `(${raw})::date`;
  if (type === 'boolean') return `(${raw})::boolean`;
  return raw;
}

type Resolved = { field: FilterField; expr: string; sortExpr: string };

export function compileListQuery(
  spec: ListSpec,
  input: unknown,
  ctx: { schoolId: string; customFields: readonly CustomFieldDefinition[] }
): { ok: true; compiled: CompiledQuery } | { ok: false; errors: CompileError[] } {
  const errors: CompileError[] = [];
  const params = new Params();
  const schoolParam = params.add(ctx.schoolId);
  const q = (input ?? {}) as Record<string, unknown>;
  if (typeof q !== 'object' || Array.isArray(q)) return { ok: false, errors: [{ path: '', message: 'query must be an object' }] };
  const known = new Set(['filter', 'search', 'sort', 'columns', 'pageSize', 'cursor']);
  for (const k of Object.keys(q)) if (!known.has(k)) errors.push({ path: k, message: 'is not part of a list query' });

  const fields = new Map(listFields(spec, ctx.customFields).map((f) => [f.key, f]));
  const resolved = new Map<string, Resolved>();
  const resolve = (key: unknown, path: string): Resolved | null => {
    if (typeof key !== 'string' || !fields.has(key)) {
      errors.push({ path, message: 'is not a field of this list' });
      return null;
    }
    const cached = resolved.get(key);
    if (cached) return cached;
    const field = fields.get(key)!;
    let r: Resolved;
    if (field.custom) {
      const expr = customExpr(field.type, schoolParam, params.add(key.slice(3)), spec.idExpr);
      r = { field, expr, sortExpr: expr };
    } else {
      const f = spec.fields[key];
      r = { field, expr: f.expr, sortExpr: f.sortExpr ?? f.expr };
    }
    resolved.set(key, r);
    return r;
  };

  let conditions = 0;
  const compileCondition = (c: FilterCondition, path: string): string | null => {
    const r = resolve(c.field, `${path}.field`);
    if (!r) return null;
    const ops = OPERATORS_BY_TYPE[r.field.type] as readonly string[];
    if (!ops.includes(c.op)) {
      errors.push({ path: `${path}.op`, message: `is not an operator for ${r.field.type} fields` });
      return null;
    }
    const e = r.expr;
    const v = c.value;
    const bad = (message: string) => {
      errors.push({ path: `${path}.value`, message });
      return null;
    };
    if (c.op === 'is_empty') return r.field.type === 'text' ? `(${e} is null or ${e} = '')` : `(${e} is null)`;
    if (c.op === 'is_not_empty') return r.field.type === 'text' ? `(${e} is not null and ${e} <> '')` : `(${e} is not null)`;
    switch (r.field.type) {
      case 'text': {
        if (typeof v !== 'string' || v.length < 1 || v.length > 200) return bad('must be text of 1 to 200 characters');
        if (c.op === 'eq') return `lower(${e}) = lower(${params.add(v)})`;
        if (c.op === 'neq') return `(${e} is null or lower(${e}) <> lower(${params.add(v)}))`;
        if (c.op === 'contains') return `${e} ilike '%' || ${params.add(likeEscape(v))} || '%'`;
        return `${e} ilike ${params.add(likeEscape(v))} || '%'`; // starts_with
      }
      case 'number': {
        if (c.op === 'between') {
          const b = v as { from?: unknown; to?: unknown } | null;
          if (!b || typeof b.from !== 'number' || typeof b.to !== 'number' || !Number.isFinite(b.from) || !Number.isFinite(b.to)) return bad('must be { from, to } numbers');
          return `(${e} between ${params.add(b.from)} and ${params.add(b.to)})`;
        }
        if (typeof v !== 'number' || !Number.isFinite(v)) return bad('must be a number');
        const sym = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[c.op as 'eq'];
        return c.op === 'neq' ? `(${e} is null or ${e} <> ${params.add(v)})` : `${e} ${sym} ${params.add(v)}`;
      }
      case 'date': {
        if (c.op === 'last_n_days') {
          if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 3660) return bad('must be a whole number of days');
          return `(${e})::date >= current_date - ${params.add(v)}::int`;
        }
        if (c.op === 'between') {
          const b = v as { from?: unknown; to?: unknown } | null;
          if (!b || !validDate(b.from) || !validDate(b.to)) return bad('must be { from, to } dates');
          return `((${e})::date between ${params.add(b.from)}::date and ${params.add(b.to)}::date)`;
        }
        if (!validDate(v)) return bad('must be a date as YYYY-MM-DD');
        const sym = { on: '=', before: '<', after: '>' }[c.op as 'on'];
        return `(${e})::date ${sym} ${params.add(v)}::date`;
      }
      case 'boolean':
        if (typeof v !== 'boolean') return bad('must be true or false');
        return `${e} = ${params.add(v)}`;
      case 'enum':
      case 'reference': {
        if (!Array.isArray(v) || v.length < 1 || v.length > MAX_IN_VALUES || !v.every((x) => typeof x === 'string' && x.length <= 200)) {
          return bad(`must be a list of 1 to ${MAX_IN_VALUES} values`);
        }
        if (r.field.type === 'enum' && r.field.options && !v.every((x) => r.field.options!.some((o) => o.value === x))) return bad('has a value that is not a choice');
        const list = params.add(v);
        return c.op === 'in' ? `${e} = any(${list}::text[])` : `(${e} is null or not (${e} = any(${list}::text[])))`;
      }
    }
  };

  const compileGroup = (g: unknown, path: string, depth: number): string | null => {
    const group = g as FilterGroup;
    if (typeof g !== 'object' || g === null || !isFilterGroup(group as FilterGroup | FilterCondition)) {
      errors.push({ path, message: 'must be a group { combinator, conditions }' });
      return null;
    }
    if (depth > MAX_DEPTH) {
      errors.push({ path, message: `groups nest at most ${MAX_DEPTH} deep` });
      return null;
    }
    if (group.combinator !== 'and' && group.combinator !== 'or') {
      errors.push({ path: `${path}.combinator`, message: 'must be and / or' });
      return null;
    }
    if (!Array.isArray(group.conditions)) {
      errors.push({ path: `${path}.conditions`, message: 'must be a list' });
      return null;
    }
    const parts: string[] = [];
    group.conditions.forEach((node, i) => {
      const p = `${path}.conditions[${i}]`;
      if (typeof node !== 'object' || node === null) return void errors.push({ path: p, message: 'must be a condition or a group' });
      if (isFilterGroup(node)) {
        const sub = compileGroup(node, p, depth + 1);
        if (sub) parts.push(sub);
      } else {
        if (++conditions > MAX_CONDITIONS) return void errors.push({ path: p, message: `at most ${MAX_CONDITIONS} conditions` });
        const sql = compileCondition(node, p);
        if (sql) parts.push(sql);
      }
    });
    if (parts.length === 0) return 'true';
    return `(${parts.join(group.combinator === 'and' ? ' and ' : ' or ')})`;
  };

  const where: string[] = [`${spec.schoolExpr} = ${schoolParam}`];
  if (q.filter !== undefined) {
    const sql = compileGroup(q.filter, 'filter', 1);
    if (sql) where.push(sql);
  }

  let search: string | undefined;
  if (q.search !== undefined) {
    if (typeof q.search !== 'string' || q.search.length > MAX_SEARCH) errors.push({ path: 'search', message: `must be text of at most ${MAX_SEARCH} characters` });
    else if (q.search.trim()) {
      search = q.search.trim();
      const p = params.add(likeEscape(search));
      where.push(`(${spec.searchExprs.map((e) => `${e} ilike '%' || ${p} || '%'`).join(' or ')})`);
    }
  }

  let sort: SortSpec[] = [...spec.definition.defaultSort];
  if (q.sort !== undefined) {
    if (!Array.isArray(q.sort) || q.sort.length > MAX_SORT) errors.push({ path: 'sort', message: `at most ${MAX_SORT} sort fields` });
    else sort = q.sort as SortSpec[];
  }
  const order: string[] = [];
  sort.forEach((s, i) => {
    const r = resolve(s?.field, `sort[${i}].field`);
    if (!r) return;
    if (!r.field.sortable && !r.field.custom) return void errors.push({ path: `sort[${i}].field`, message: 'cannot be sorted' });
    if (s.dir !== 'asc' && s.dir !== 'desc') return void errors.push({ path: `sort[${i}].dir`, message: 'must be asc or desc' });
    order.push(`${r.sortExpr} ${s.dir} nulls last`);
  });
  order.push(`${spec.idExpr} asc`);

  let columns: string[] | undefined;
  if (q.columns !== undefined) {
    if (!Array.isArray(q.columns) || q.columns.length > 50 || !q.columns.every((c) => typeof c === 'string' && fields.has(c))) {
      errors.push({ path: 'columns', message: 'must be fields of this list' });
    } else columns = q.columns as string[];
  }

  let pageSize = DEFAULT_PAGE_SIZE;
  if (q.pageSize !== undefined) {
    if (!Number.isInteger(q.pageSize) || (q.pageSize as number) < 1 || (q.pageSize as number) > MAX_PAGE_SIZE) {
      errors.push({ path: 'pageSize', message: `must be 1 to ${MAX_PAGE_SIZE}` });
    } else pageSize = q.pageSize as number;
  }
  let offset = 0;
  if (q.cursor !== undefined) {
    const o = decodeCursor(q.cursor);
    if (o === null) errors.push({ path: 'cursor', message: 'is not a cursor of this list' });
    else offset = o;
  }

  if (errors.length) return { ok: false, errors };
  const query: ListQuery = {
    ...(q.filter !== undefined ? { filter: q.filter as FilterGroup } : {}),
    ...(search ? { search } : {}),
    sort,
    ...(columns ? { columns } : {}),
    pageSize,
  };
  return { ok: true, compiled: { where: where.join(' and '), orderBy: order.join(', '), params: params.values, pageSize, offset, query } };
}

// Cursors are opaque to the client: base64url of the next offset.
export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset })).toString('base64url');
}

export function decodeCursor(cursor: unknown): number | null {
  if (typeof cursor !== 'string' || cursor.length > 64) return null;
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return Number.isInteger(v?.o) && v.o >= 0 && v.o <= 1_000_000 ? v.o : null;
  } catch {
    return null;
  }
}

export async function runList<Row>(db: Sql, spec: ListSpec, c: CompiledQuery): Promise<ListPage<Row>> {
  const { rows: count } = await db.query(`select count(*)::int as n from ${spec.from} where ${c.where}`, c.params);
  const n = c.params.length;
  const { rows } = await db.query(
    `select ${spec.select} from ${spec.from} where ${c.where} order by ${c.orderBy} limit $${n + 1} offset $${n + 2}`,
    [...c.params, c.pageSize, c.offset]
  );
  const total = count[0].n as number;
  const next = c.offset + rows.length;
  return { rows: rows as Row[], total, nextCursor: next < total && rows.length > 0 ? encodeCursor(next) : null };
}

// Every id of the filtered set, in list order, for exports and bulk actions.
// Returns null when the set is larger than `cap`.
export async function filteredIds(db: Sql, spec: ListSpec, c: CompiledQuery, cap: number): Promise<string[] | null> {
  const n = c.params.length;
  const { rows } = await db.query(`select ${spec.idExpr} as id from ${spec.from} where ${c.where} order by ${c.orderBy} limit $${n + 1}`, [...c.params, cap + 1]);
  return rows.length > cap ? null : rows.map((r) => r.id as string);
}
