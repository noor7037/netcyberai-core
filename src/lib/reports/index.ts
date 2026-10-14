// Reports (docs/26 slice 8h, C207): a fixed list of tables about a school, each for a span of days, with a total
// row and a CSV of exactly the rows shown. Start with types.ts.
//
//   const mine = reportsFor(role, entitlements);                       // a report this role may not read is absent
//   const asked = await askReport(db, { schoolId, userId, role }, entitlements, 'daily-collection', searchParams);
//   if (asked.ok) asked.result.rows, asked.result.total                // refused otherwise, with the reason
//
// `db` is the reader's own tenant transaction: row level security applies.
export * from './types';
export { REPORTS, RECEIPT_METHODS } from './reports';
export { REPORT_ROLES, askReport, listed, reportDefinition, reportsFor, runReport, totalOf, type AskedReport } from './load';
export { DEFAULT_REPORT_RANGE, REPORT_RANGE_IDS, daysIn, isRealDay, isReportRangeId, rangeQuery, readReportRange } from './range';
export { fileCell, fileHeading, reportAbout, reportCsv, reportEmpty, reportRule, reportTable, reportTitle, sayCell, sayHeading } from './table';
