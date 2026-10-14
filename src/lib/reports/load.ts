import { isModuleEnabled, type SchoolEntitlements } from '@/lib/contracts/entitlements';
import { moduleById, type SchoolRole } from '@/lib/contracts/modules';
import { factContext, factDefinition, loadFact } from '@/lib/insights/load';
import { indiaDate } from '@/lib/time/india';
import { readReportRange } from './range';
import { REPORTS } from './reports';
import { NotThisRolesReport, ReportTooLarge, isReportId, type ReportCell, type ReportContext, type ReportDefinition, type ReportId, type ReportListed, type ReportRange, type ReportResult, type ReportRow, type ReportSql } from './types';

// Running a report (docs/26 slice 8h, C207).

// Reports is for these roles (the module registry). A report's own roles are never wider.
export const REPORT_ROLES: readonly SchoolRole[] = moduleById('reports').roles;

export function reportDefinition(id: ReportId): ReportDefinition {
  const def = REPORTS.find((r) => r.id === id);
  if (!def) throw new Error(`unknown report ${id}`);
  return def;
}

// Which reports are this person's: their role, and a module the school has on. In the order of the list.
export function reportsFor(role: SchoolRole, entitlements: SchoolEntitlements): ReportDefinition[] {
  return REPORTS.filter((r) => r.roles.includes(role) && isModuleEnabled(entitlements, r.moduleId));
}

export const listed = (def: ReportDefinition): ReportListed => ({ id: def.id, moduleId: def.moduleId, group: def.group, period: def.period });

// The counts of a row: its whole-number and amount columns, by key.
const counts = (def: ReportDefinition, row: ReportRow): Record<string, number> =>
  Object.fromEntries(def.columns.filter((c) => c.unit === 'count' || c.unit === 'inr_paise').map((c) => [c.key, Number(row[c.key] ?? 0)]));

// The total row, made from the rows: every 'sum' column is the rows added up, and a 'worked' column (a rate) is
// worked out from those sums by the report's own function, the one each row used. A 'whole' column is the one
// thing the rows cannot say by being added up (a day two classes were marked on is one day): its cell is the
// count the report made once for all its rows (`whole`), and it is empty when the report gave none. A report has
// ONE way to a total, this one.
export function totalOf(def: ReportDefinition, rows: readonly ReportRow[], whole: Record<string, number> = {}): ReportRow | null {
  if (rows.length === 0) return null;
  const sums: Record<string, number> = {};
  for (const c of def.columns) if (c.total === 'sum') sums[c.key] = rows.reduce((a, r) => a + Number(r[c.key] ?? 0), 0);
  const worked = def.worked?.(sums) ?? {};
  return Object.fromEntries(def.columns.map((c): [string, ReportCell] => [c.key, c.total === 'sum' ? sums[c.key] : c.total === 'worked' ? (worked[c.key] ?? null) : c.total === 'whole' ? (whole[c.key] ?? null) : null]));
}

// "Not set up" is the dashboard's own word, never a second test of it here: a report with no rows asks the
// number it names (`notSetUpAs`), in the same session, and repeats what that number says. So the dashboard and
// the report cannot say different things about a school that has not begun (docs/26 §3 rules 1 and 2). A report
// with rows is set up by the fact of them, and asks nothing.
async function notSetUp(db: ReportSql, def: ReportDefinition, ctx: ReportContext): Promise<boolean> {
  if (!def.notSetUpAs) return false;
  const fact = await loadFact(db, factDefinition(def.notSetUpAs), factContext({ schoolId: ctx.schoolId, userId: ctx.userId, role: ctx.role }, ctx.today, ctx.range));
  return fact.state === 'not_set_up';
}

// One report, as the reader, for the days asked. A role the report is not for gets a refusal, never the rows:
// some tables (attendance, Daily Pulse messages, the message log) have no role policy in the database, so for
// them the report's own roles are what stands between the rows and the role. Every way to a report's rows in
// this library passes here. The screen and the CSV both call it, so the file has the rows of the screen.
export async function runReport(db: ReportSql, def: ReportDefinition, ctx: ReportContext): Promise<ReportResult> {
  if (!def.roles.includes(ctx.role) || !REPORT_ROLES.includes(ctx.role)) throw new NotThisRolesReport(def.id, ctx.role);
  const got = await def.run(db, ctx);
  const rows = def.worked ? got.rows.map((r) => ({ ...r, ...def.worked?.(counts(def, r)) })) : got.rows;
  return {
    ...listed(def),
    state: rows.length === 0 && (await notSetUp(db, def, ctx)) ? 'not_set_up' : 'ok',
    range: def.period === 'range' ? ctx.range : null,
    columns: def.columns.map((c) => ({ key: c.key, label: c.label, unit: c.unit, ...(c.words ? { words: c.words } : {}), ...(c.empty ? { empty: c.empty } : {}) })),
    rows,
    total: totalOf(def, rows, got.whole),
    ranAt: new Date().toISOString(),
    rule: { key: `rpt.${def.id}.rule`, version: def.version },
    sources: def.sources,
    notes: got.notes ?? [],
  };
}

// A report asked for by its address, with the days in the query: the one door the two routes (the rows, and the
// CSV) share, so what is refused on the screen is refused for the file.
//   not_found      no such report
//   not_allowed    not this role's report
//   module_off     the school has the report's module switched off
//   range          the days asked are not two real dates in order, at most 366 days
//   too_many_rows  more rows than one report reads: fewer days are needed
export type AskedReport =
  | { ok: true; result: ReportResult; def: ReportDefinition; asked: { range: ReportRange; rangeId: string | null } }
  | { ok: false; reason: 'not_found' | 'not_allowed' | 'module_off' | 'range' | 'too_many_rows' };

export async function askReport(
  db: ReportSql,
  who: { schoolId: string; userId: string; role: SchoolRole },
  entitlements: SchoolEntitlements,
  reportId: string,
  params: { get: (name: string) => string | null },
  today: string = indiaDate()
): Promise<AskedReport> {
  if (!isReportId(reportId)) return { ok: false, reason: 'not_found' };
  const def = reportDefinition(reportId);
  if (!def.roles.includes(who.role) || !REPORT_ROLES.includes(who.role)) return { ok: false, reason: 'not_allowed' };
  if (!isModuleEnabled(entitlements, def.moduleId)) return { ok: false, reason: 'module_off' };
  const asked = readReportRange(params, today);
  if (!asked.ok) return { ok: false, reason: 'range' };
  try {
    return { ok: true, def, asked, result: await runReport(db, def, { ...who, today, range: asked.range }) };
  } catch (err) {
    if (err instanceof ReportTooLarge) return { ok: false, reason: 'too_many_rows' };
    throw err;
  }
}
