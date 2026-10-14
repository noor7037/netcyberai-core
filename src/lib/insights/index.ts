// School facts (docs/26 slice 8d, C203): one set of numbers about a school,
// for the dashboard now and for Reports, the School Health Auditor and Early
// Warning next. Start with types.ts.
//
//   const { facts, failed } = await loadFacts(db, { schoolId, userId, role }, entitlements, { range: '7d' });
//   const overdue = facts.find((f) => f.id === 'fees.overdue');   // absent when the role may not read fees
//
// `db` is the reader's own tenant transaction: row level security applies.
export * from './types';
export { FACTS, NO_LIST_YET } from './facts';
export { NotThisRolesFact, describeFact, factContext, factDefinition, factsFor, loadFact, loadFacts } from './load';
export { ANSWERS_SHOW, ATTENDANCE_DAYS_SHOW, DEFAULT_RANGE, EVENTS_SHOW, FEES_SHOWS, NOTICES_SHOW, PROXY_SHOW, PTM_SHOW, STAFF_SHOWS, datesIn, isFeesShow, isRangeId, isStaffShow, rangeFor, readRange, readShow, readState, screenFor, type FeesShow, type ProxyShow, type StaffShow } from './screens';
