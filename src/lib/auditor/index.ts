// School Health Auditor v1 (docs/26 slice 8i, C208): twelve checks over a school's own setup and data, by fixed
// rules, each passing, needing attention (with a count and the screen that fixes it) or "not set up"; the result
// in words, "N of M checks pass"; and a dated record of each check-up. Start with rules.ts.
//
//   const checkUp = await runCheckUp(db, { schoolId, userId, role }, entitlements);   // the principal or the school admin
//   const kept = await recordCheckUp(db, who, checkUp);                               // today's row
//
// `db` is the reader's own tenant transaction: row level security applies. Rules only: no language model.
export * from './rules';
export { CHECKS, lastWorkingDays, type CheckContext, type CheckDefinition, type CheckOutcome } from './checks';
export { NotTheOfficesCheckUp, runCheckUp, type Auditor } from './run';
export { HISTORY_MAX, checkUpHistory, latestCheckUp, recordCheckUp } from './store';
