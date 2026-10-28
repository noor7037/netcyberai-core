import type { Counts } from './control';

// Control → AI's "Use" table (W6-C, C397): a workload with no use today and none this month collapses into one line;
// the totals are sums of the counts the server holds, nothing else.

type Usage = { profileId: string; today: Counts; month: Counts };
const idle = (c: Counts) => !c.requests && !c.failures && !c.capRefusals && !c.tokensIn && !c.tokensOut;

export function splitUsage<U extends Usage>(usage: U[]): { active: U[]; idle: U[] } {
  const active: U[] = [];
  const quiet: U[] = [];
  for (const u of usage) (idle(u.today) && idle(u.month) ? quiet : active).push(u);
  return { active, idle: quiet };
}

export function totals(usage: Usage[]): { today: Counts; month: Counts } {
  const zero = (): Counts => ({ requests: 0, failures: 0, capRefusals: 0, tokensIn: 0, tokensOut: 0 });
  const t = { today: zero(), month: zero() };
  for (const u of usage)
    for (const k of ['today', 'month'] as const)
      for (const f of Object.keys(t[k]) as (keyof Counts)[]) t[k][f] += u[k][f];
  return t;
}
