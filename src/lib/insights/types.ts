import type { ModuleId, SchoolRole } from '@/lib/contracts/modules';

// School facts (docs/26 §2, slice 8d, C203): ONE set of numbers about a
// school, each computed by one function, under the reader's own row level
// security, for a date range. The dashboard shows them; Reports, the School
// Health Auditor and Early Warning call the same functions, so two screens
// cannot disagree about a number.
//
// What a fact is:
//   - an id, the module it belongs to (switched off, the fact is not
//     computed) and the roles that may read it. The roles MIRROR the tables'
//     row level security; they never widen it. The query runs as the reader,
//     so the database has the last word (test/insights/access.test.ts).
//   - load(db, ctx): the value, and a total where "x of y" makes sense.
//   - provenance (docs/21): the moment it was counted, the rule that says how
//     (a message key) with its version, the tables it came from, and the
//     place that shows its rows (an address with the filter in the query).
//
// What a fact is not: a fact the role may not read is ABSENT, never zero.
// Something not set up says 'not_set_up', never 0. Nothing here ranks a
// child, a class or a teacher, and no fee figure is computed together with
// anything about learning (docs/26 §3 rules 4 and 5).

export const FACT_IDS = [
  'attendance.classes_marked', 'attendance.classes_unmarked', 'attendance.students_marked', 'attendance.present', 'attendance.absent', 'attendance.late', 'attendance.leave', 'attendance.present_rate',
  'students.active', 'students.waiting_consent',
  'fees.collected', 'fees.owed', 'fees.overdue', 'fees.promises_due', 'fees.upi_to_verify',
  'pulse.sent', 'pulse.understood', 'pulse.needs_help', 'followups.open',
  'homework.set', 'homework.checked', 'homework.not_done',
  'messages.total', 'messages.failed', 'messages.held', 'whatsapp.spend',
  'complaints.open', 'complaints.overdue', 'notices.waiting', 'ptm.coming', 'events.coming', 'parent_ai.drafts',
  'tickets.open', 'tickets.waiting',
  // Staff leave and covers (slices 8b and 8c) are added here by the lead, with their definitions in facts.ts:
  // 'staff.leave_waiting', 'staff.on_leave_today', 'proxy.uncovered_today'.
] as const;
export type FactId = (typeof FACT_IDS)[number];
export const isFactId = (v: unknown): v is FactId => typeof v === 'string' && (FACT_IDS as readonly string[]).includes(v);

// India's dates, both ends included.
export type FactRange = { from: string; to: string };
export const RANGE_IDS = ['today', '7d', '30d'] as const;
export type RangeId = (typeof RANGE_IDS)[number];

// What days a number is about. today: India's today. range: the chosen days.
// now: as things stand this moment. month: this calendar month in India.
// coming: from today onward.
export type FactPeriod = 'today' | 'range' | 'now' | 'month' | 'coming';
export type FactUnit = 'count' | 'inr_paise' | 'percent';

// How the number relates to the screen it opens:
//   rows    it is the count of the rows listed there (`count` when the value is an amount, which is then their sum)
//   sum     it is the sum of one figure the rows there carry (answers, "not done")
//   figure  the screen says this figure itself (the month's spend; the present rate, above the days it is worked out from)
// A fact has an address only when its screen lists exactly its rows for that address; without one (`href` null)
// the number is shown and opens nothing.
export type FactDrill = 'rows' | 'sum' | 'figure';

export type FactPart = { key: string; value: number; unit?: FactUnit; href?: string };
export type FactPoint = { date: string; value: number | null };

// A minimal SQL client: the reader's own tenant transaction.
export type InsightsSql = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export type FactContext = {
  schoolId: string;
  userId: string;
  role: SchoolRole;
  today: string; // India's date
  range: FactRange;
  sunday: boolean; // India's today is a Sunday: no attendance is expected
  // Several facts read one query (today's attendance, the fee summary): it runs once for a load.
  once: <T>(key: string, load: () => Promise<T>) => Promise<T>;
};

// What a fact's own function answers.
export type FactNumbers = {
  // ok: counted. no_data: nothing was recorded in those days to count from. not_set_up: the thing it counts is not set up yet.
  state?: 'ok' | 'no_data' | 'not_set_up';
  value: number | null; // null unless state is 'ok'
  total?: number; // "x of y"
  count?: number; // how many rows are behind an amount
  href?: string;
  parts?: FactPart[];
  series?: FactPoint[];
  // Needs a person now: it joins the attention list.
  attention?: boolean;
};

export type FactDefinition = {
  id: FactId;
  moduleId: ModuleId;
  roles: readonly SchoolRole[];
  unit: FactUnit;
  period: FactPeriod;
  drill: FactDrill;
  // The rule's version: raised whenever how the number is counted changes.
  version: number;
  // The tables the number is read from.
  sources: readonly string[];
  load: (db: InsightsSql, ctx: FactContext) => Promise<FactNumbers>;
};

export type FactResult = {
  id: FactId;
  moduleId: ModuleId;
  state: 'ok' | 'no_data' | 'not_set_up';
  value: number | null;
  total?: number;
  count?: number;
  unit: FactUnit;
  period: FactPeriod;
  // The days the number covers, where it is about days.
  range?: FactRange;
  drill: FactDrill;
  // The moment it was counted (ISO).
  countedAt: string;
  // The sentence that says how it is counted (`fact.<id>.rule` in the message files) and its version.
  rule: { key: string; version: number };
  sources: readonly string[];
  // The place that shows its rows, the filter in the query string.
  href: string | null;
  parts?: FactPart[];
  series?: FactPoint[];
  attention: boolean;
};

export type LoadedFacts = { facts: FactResult[]; failed: FactId[]; today: string; range: FactRange };
