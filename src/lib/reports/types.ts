import type { ModuleId, SchoolRole } from '@/lib/contracts/modules';
import type { MessageKey } from '@/lib/i18n';
import type { FactId } from '@/lib/insights/types';

// Reports (docs/26 slice 8h, C207): a FIXED list of tables about a school,
// each for a span of days, each with a total row and a CSV of exactly the
// rows shown. No report builder and no scheduled reports in v1 (docs/26 §5).
//
// What a report is:
//   - an id, the module it belongs to (switched off, the report is not
//     offered) and the roles that may read it. The roles MIRROR the row
//     level security of the tables it reads and the roles its module is for;
//     they never widen either. The report runs in the reader's own tenant
//     transaction, so the database has the last word.
//   - its columns, and run(db, ctx): the rows for the days asked.
//   - a total row that is made from the rows, by one function for every
//     report (load.ts): the total cannot differ from the rows above it. The
//     one figure the rows cannot be added up to (a count of days that two
//     classes share) is counted for the whole school by the module's own
//     function and is marked 'whole'; it is never a sum that means nothing.
//   - "not set up" where the dashboard says so (docs/26 §3 rule 1): a report
//     about a thing the school has not begun says that, never "nothing".
//
// One rule, one place (docs/26 §3 rule 2): a report writes no second
// definition of a number the dashboard shows. Its rows come from the same
// module function the school fact calls (src/lib/insights), grouped here by
// day, class or family; `agrees` names the dashboard numbers the total row
// must equal for the same days, and test/reports compares each.
//
// What a report is not: a report a role may not read is ABSENT from that
// role's list and refused by its address. Nothing here ranks a child, a
// class or a member of staff: rows come in the order of a date or a name,
// never of a count. No fee figure shares a report with anything about
// learning (docs/26 §3 rules 4 and 5).

export const REPORT_IDS = ['daily-collection', 'dues', 'attendance-by-class', 'absentees', 'homework-coverage', 'pulse-coverage', 'messages-by-state', 'staff-leave'] as const;
export type ReportId = (typeof REPORT_IDS)[number];
export const isReportId = (v: unknown): v is ReportId => typeof v === 'string' && (REPORT_IDS as readonly string[]).includes(v);

// How the list groups them on the screen. Fees sit apart from learning.
export const REPORT_GROUPS = ['money', 'learning', 'parents', 'staff'] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];

// India's dates, both ends included.
export type ReportRange = { from: string; to: string };

// What a cell holds:
//   text       words from the school's own records (a class, a name); null says the column's `empty` words
//   count      a whole number
//   inr_paise  an amount in paise
//   percent    a rate with one decimal, or null when there is nothing to work it out from
//   date       one day, YYYY-MM-DD, or null
//   dates      days and spans of days: 'YYYY-MM-DD' or 'YYYY-MM-DD/YYYY-MM-DD', in order
//   word       one of a fixed set of words: the message `<words><value>` says it
export type ReportUnit = 'text' | 'count' | 'inr_paise' | 'percent' | 'date' | 'dates' | 'word';
export type ReportCell = string | number | string[] | null;
export type ReportRow = Record<string, ReportCell>;

export type ReportColumn = {
  key: string;
  label: MessageKey;
  unit: ReportUnit;
  // The total row's cell: 'label' says "Total"; 'sum' adds the rows; 'worked' is worked out from the summed
  // columns by the report's own `worked` function (a rate is never added up); 'none' is left empty. 'whole' is a
  // count the rows share, so adding them up would count it twice (two classes marked on one day are one day of
  // the school): the report counts it once for all its rows and gives it beside them (`whole`).
  total: 'label' | 'sum' | 'worked' | 'whole' | 'none';
  // For 'word': the start of the message key. For 'text': what a missing value says.
  words?: string;
  empty?: MessageKey;
};

// A minimal SQL client: the reader's own tenant transaction.
export type ReportSql = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export type ReportContext = {
  schoolId: string;
  userId: string;
  role: SchoolRole;
  today: string; // India's date
  range: ReportRange;
};

// A sentence under the table that the rows cannot say themselves.
export type ReportNote = { key: MessageKey; params?: Record<string, string | number> };

// A dashboard number the total row equals for the same days: the fact's value, its "out of", the count of rows
// behind an amount, or one of its parts.
export type ReportAgrees = { column: string; fact: FactId; pick: 'value' | 'total' | 'count' | { part: string } };

export type ReportDefinition = {
  id: ReportId;
  moduleId: ModuleId;
  group: ReportGroup;
  roles: readonly SchoolRole[];
  // range: the rows are about the days asked. now: as things stand this moment; the days asked do not matter.
  period: 'range' | 'now';
  // The rule's version: raised whenever what a row or a column counts changes.
  version: number;
  // The tables the rows are read from.
  sources: readonly string[];
  columns: readonly ReportColumn[];
  agrees: readonly ReportAgrees[];
  // Cells worked out from a row's own counts (a rate). Called for every row and, on the summed counts, for the total.
  worked?: (counts: Record<string, number>) => ReportRow;
  // The dashboard number whose "not set up" this report repeats (docs/26 §3 rule 1). With no rows to show, the
  // report asks that number: while it says the thing it counts is not set up, the report says so too, in its own
  // words (`rpt.<id>.notSetUp.title` and `.do`), instead of "nothing to show".
  notSetUpAs?: FactId;
  // `whole`: the total row's cell for each column marked 'whole', by the column's key.
  run: (db: ReportSql, ctx: ReportContext) => Promise<{ rows: ReportRow[]; notes?: ReportNote[]; whole?: Record<string, number> }>;
};

// What a list of reports says about one: enough to draw its name and its days.
export type ReportListed = { id: ReportId; moduleId: ModuleId; group: ReportGroup; period: 'range' | 'now' };

export type ReportResult = ReportListed & {
  // ok: counted. not_set_up: the thing the report is about is not set up yet (it then has no rows and no total).
  state: 'ok' | 'not_set_up';
  // The days the rows cover; null for a report about this moment.
  range: ReportRange | null;
  columns: Pick<ReportColumn, 'key' | 'label' | 'unit' | 'words' | 'empty'>[];
  rows: ReportRow[];
  // Made from the rows. Null when there are no rows: nothing is not a row of zeros.
  total: ReportRow | null;
  // The moment it was run (ISO).
  ranAt: string;
  // The sentence that says what a row is and how it is counted (`rpt.<id>.rule`), and its version.
  rule: { key: string; version: number };
  sources: readonly string[];
  notes: ReportNote[];
};

// The most rows of a module's own list one report reads. A report that would need more is refused and says so:
// a total over a list that was cut short would be a wrong total. Only a report whose own rows are such a list,
// or are made from one entry by entry (absentees, dues, staff leave), can meet it. A report that is a row a day
// or a row a class is counted in the database by its module and reads no list, so it has no such limit.
export const REPORT_SOURCE_ROWS_MAX = 20_000;
// The longest span of days one report covers, both ends included.
export const REPORT_MAX_DAYS = 366;

export class NotThisRolesReport extends Error {
  constructor(readonly reportId: ReportId, readonly role: SchoolRole) {
    super(`the report ${reportId} is not for the role ${role}`);
    this.name = 'NotThisRolesReport';
  }
}
export class ReportTooLarge extends Error {
  constructor(readonly reportId: ReportId) {
    super(`the report ${reportId} has more rows than one report reads`);
    this.name = 'ReportTooLarge';
  }
}
