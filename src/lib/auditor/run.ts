import type { PoolClient } from 'pg';
import { isModuleEnabled, type SchoolEntitlements } from '@/lib/contracts/entitlements';
import type { SchoolRole } from '@/lib/contracts/modules';
import { factContext, factDefinition, loadFact } from '@/lib/insights/load';
import { rangeFor } from '@/lib/insights/screens';
import type { FactResult } from '@/lib/insights/types';
import { schoolCalendar, type WorkingCalendar } from '@/lib/payments/upi';
import { indiaDate } from '@/lib/time/india';
import { CHECKS, type CheckContext, type CheckDefinition } from './checks';
import { AUDITOR_ROLES, AUDITOR_RULE_VERSION, summarise, type CheckResult, type CheckUp } from './rules';

// Running a check-up (docs/26 slice 8i, C208).

type Sql = Pick<PoolClient, 'query'>;
export type Auditor = { schoolId: string; userId: string; role: SchoolRole };

// A check-up asked for by a role it is not for. Refused before any query runs.
export class NotTheOfficesCheckUp extends Error {
  constructor(readonly role: string) {
    super(`a check-up is not for the role ${role}`);
    this.name = 'NotTheOfficesCheckUp';
  }
}

// What a check reads through: the reader's school, role and day; the school facts as that reader (the facts'
// own library refuses a role a fact is not for); and the school's calendar, read once.
function checkContext(db: Sql, who: Auditor, today: string): CheckContext {
  const facts = factContext(who, today, rangeFor(today, '7d'));
  let calendar: Promise<WorkingCalendar> | null = null;
  return {
    ...who,
    today,
    fact: (id): Promise<FactResult> => loadFact(db, factDefinition(id), facts),
    calendar: () => (calendar ??= schoolCalendar(db as PoolClient, who.schoolId)),
  };
}

// Every check, in the order of the registry, as this person: the principal or the school admin, in their own
// tenant transaction, so row level security decides every count.
//   - A check whose module is switched off for the school is "not set up": there is nothing of it to look at.
//   - EACH CHECK RUNS BEHIND ITS OWN SAVEPOINT. One that fails is "could not be checked", never a pass, and it
//     neither ends the transaction nor takes the other checks with it.
// Nothing is written here: recordCheckUp (store.ts) keeps the result.
// `given.today` and `given.checks` are for tests: another day, and a registry with a check made to fail.
export async function runCheckUp(db: Sql, who: Auditor, entitlements: SchoolEntitlements, given: { today?: string; checks?: readonly CheckDefinition[] } = {}): Promise<CheckUp> {
  if (!AUDITOR_ROLES.includes(who.role)) throw new NotTheOfficesCheckUp(who.role);
  const today = given.today ?? indiaDate();
  const ctx = checkContext(db, who, today);
  const results: CheckResult[] = [];
  for (const def of given.checks ?? CHECKS) {
    if (!isModuleEnabled(entitlements, def.moduleId)) {
      results.push({ id: def.id, state: 'not_set_up', count: null, href: null, off: true });
      continue;
    }
    try {
      await db.query('savepoint health_check');
      const outcome = await def.run(db, ctx);
      await db.query('release savepoint health_check');
      results.push(outcome.state === 'needs_attention' ? { id: def.id, state: outcome.state, count: outcome.count, href: outcome.href } : { id: def.id, state: outcome.state, count: null, href: outcome.state === 'not_set_up' ? def.screen : null });
    } catch (err) {
      await db.query('rollback to savepoint health_check').catch(() => undefined);
      console.error('[auditor] a check could not be run', def.id, err instanceof Error ? err.name : 'error');
      results.push({ id: def.id, state: 'could_not_check', count: null, href: null });
    }
  }
  const { passed, applicable } = summarise(results);
  return { date: today, ruleVersion: AUDITOR_RULE_VERSION, results, passed, applicable };
}
