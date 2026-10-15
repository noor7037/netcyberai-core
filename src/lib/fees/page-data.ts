import type { PoolClient } from 'pg';
import type { StaffRole } from '@/lib/auth/types';
import { bankLists } from '@/lib/bank/match';
import { listAccounts, listImports } from '@/lib/bank/statements';
import { listMethods } from '@/lib/payments/methods';
import { readUpiSettings, recentNotFound, waitingReports } from '@/lib/payments/upi';
import { indiaDate } from '@/lib/time/india';
import { listConcessions } from './concessions';
import { lastNightlyRun } from './nightly';
import { loadFeesSummary } from './overdue';
import { recentReceipts, reconcile } from './payments';
import { followUpList, refundList } from './recovery';
import { listHeads, listStructures } from './structures';
import { classOrderSql } from '@/lib/classes/class-order';

// What each part of the Fees page reads when it opens (C180). Every part has
// its own GET for reading again after an action; the page itself asks for
// all of them in ONE call (/api/app/fees/summary), so a phone on a slow
// connection makes one request, not nine (docs/19 rule 10). Each GET and the
// summary build a part with the same function here, so they cannot drift.

type Who = { schoolId: string; role: StaffRole };
const office = (role: StaffRole) => role === 'principal' || role === 'school_admin';

export const FEES_PARTS = {
  async reports(db: PoolClient, who: Who) {
    const upi = readUpiSettings((await listMethods(db, who.schoolId)).find((m) => m.method === 'direct_upi')?.settings);
    return { waiting: await waitingReports(db, who.schoolId), notFound: await recentNotFound(db, who.schoolId), mayReopen: who.role === 'principal' || who.role === 'accountant', mayVerify: upi.verifiers.includes(who.role), isPrincipal: who.role === 'principal', limitMinor: upi.principalLimitMinor };
  },
  async payments(db: PoolClient, who: Who) {
    const summary = await loadFeesSummary(db, who.schoolId);
    return { totals: await reconcile(db, who.schoolId), overdue: { minor: summary.overdueMinor, count: summary.overdueCount }, lastRun: await lastNightlyRun(db, who.schoolId), receipts: await recentReceipts(db, who.schoolId), mayReverse: office(who.role) };
  },
  async setup(db: PoolClient, who: Who) {
    const classes = (await db.query(`select class_id, name from classes where school_id = $1 order by ${classOrderSql('')}, class_id`, [who.schoolId])).rows;
    const sessions = (await db.query(`select session_id, label, start_date::text as start_date, end_date::text as end_date, is_current from academic_sessions where school_id = $1 order by start_date desc`, [who.schoolId])).rows;
    return { today: indiaDate(), heads: await listHeads(db, who.schoolId), structures: await listStructures(db, who.schoolId), classes, sessions };
  },
  async concessions(db: PoolClient, who: Who) {
    return { concessions: await listConcessions(db, who.schoolId), mayApprove: office(who.role) };
  },
  async bank(db: PoolClient, who: Who) {
    return { accounts: await listAccounts(db, who.schoolId), imports: await listImports(db, who.schoolId), lists: await bankLists(db, who.schoolId, who.role), mayAddAccount: office(who.role) };
  },
  async recovery(db: PoolClient, who: Who) {
    return { followUps: await followUpList(db, who.schoolId), refunds: await refundList(db, who.schoolId), mayRecordRefund: office(who.role) };
  },
} as const;
export type FeesPart = keyof typeof FEES_PARTS;

export async function feesPageData(db: PoolClient, who: Who): Promise<Record<FeesPart, unknown>> {
  const out = {} as Record<FeesPart, unknown>;
  for (const part of Object.keys(FEES_PARTS) as FeesPart[]) out[part] = await FEES_PARTS[part](db, who);
  return out;
}
