import type { ModuleId, SchoolRole } from './modules';

// The filter engine's contract (17 §1a; engine built in P1-b, Decision Log
// C110). Every list in the product speaks this one model: fields with
// operators, AND/OR groups, quick filters, full-text search, sort, columns,
// saved views and cursor pagination. Exports and bulk actions act on
// exactly the filtered set (bulk.ts).

export type FilterFieldType = 'text' | 'number' | 'date' | 'boolean' | 'enum' | 'reference';

export const OPERATORS_BY_TYPE = {
  text: ['eq', 'neq', 'contains', 'starts_with', 'is_empty', 'is_not_empty'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_empty', 'is_not_empty'],
  date: ['on', 'before', 'after', 'between', 'last_n_days', 'is_empty', 'is_not_empty'],
  boolean: ['eq'],
  enum: ['in', 'not_in', 'is_empty', 'is_not_empty'],
  reference: ['in', 'not_in', 'is_empty', 'is_not_empty'],
} as const satisfies Record<FilterFieldType, readonly string[]>;

export type FilterOperator = (typeof OPERATORS_BY_TYPE)[FilterFieldType][number];

export type FilterField = {
  key: string; // stable id; custom fields use 'cf:<fieldId>'
  label: string;
  type: FilterFieldType;
  // enum: fixed choices; reference: loaded from `optionsFrom`.
  options?: readonly { value: string; label: string }[];
  optionsFrom?: 'classes' | 'sections' | 'sessions' | 'staff' | 'subjects';
  quick?: boolean; // shown as a quick-filter chip
  sortable?: boolean;
  column?: { defaultVisible: boolean };
  custom?: boolean; // a school's custom field
};

export type FilterValue = string | number | boolean | null | readonly (string | number)[] | { from: string | number; to: string | number };

export type FilterCondition = { field: string; op: FilterOperator; value?: FilterValue };

export type FilterGroup = { combinator: 'and' | 'or'; conditions: readonly (FilterCondition | FilterGroup)[] };

export type SortSpec = { field: string; dir: 'asc' | 'desc' };

export type ListQuery = {
  filter?: FilterGroup;
  search?: string;
  sort?: readonly SortSpec[];
  columns?: readonly string[];
  pageSize?: number; // default 50, maximum 200
  cursor?: string; // opaque, from the previous page
};

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
// A list's query travels in this URL parameter, so a view can be shared.
export const LIST_QUERY_PARAM = 'q';

export type ListPage<Row> = {
  rows: readonly Row[];
  total: number; // count of the whole filtered set
  nextCursor: string | null;
};

// Describes one list: what can be filtered and shown (served by the API).
export type ListDefinition = {
  listId: string; // 'students', 'guardians', 'staff', …
  moduleId: ModuleId;
  fields: readonly FilterField[];
  defaultSort: readonly SortSpec[];
  searchPlaceholder: string;
};

export type SavedView = {
  viewId: string;
  listId: string;
  name: string;
  scope: 'personal' | 'school';
  ownerUserId: string;
  query: ListQuery;
  // A school view can be the default for some roles.
  defaultForRoles?: readonly SchoolRole[];
  createdAt: string;
  updatedAt: string;
};

export function isFilterGroup(node: FilterCondition | FilterGroup): node is FilterGroup {
  return 'combinator' in node;
}
