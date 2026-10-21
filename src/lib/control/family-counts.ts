import type { PoolClient } from 'pg';

// Control → Family (docs/family-app/10 §2 and §9, M1-7): counts of the Family app, read through family.control_counts(),
// the only door Control has to family data (it holds no right on a family table). The function returns numbers only;
// this reader keeps only the keys named here, as numbers, so a name, a child, an answer or an email cannot reach the
// screen even if the function one day returned more.

type Sql = Pick<PoolClient, 'query'>;

export interface FamilyCounts {
  accounts: number;
  accountsWithPin: number;
  children: number;
  childrenByClass: { classLevel: number; count: number }[]; // lowest class first
  studyCoreGranted: number;
  answers7d: number;
  childrenAnswering7d: number;
  topicsMastered: number;
  aiRequestsToday: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

export function readFamilyCounts(raw: unknown): FamilyCounts {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const byClass = r.children_by_class && typeof r.children_by_class === 'object' ? (r.children_by_class as Record<string, unknown>) : {};
  return {
    accounts: num(r.accounts),
    accountsWithPin: num(r.accounts_with_pin),
    children: num(r.children),
    childrenByClass: Object.entries(byClass)
      .map(([k, v]) => ({ classLevel: Number(k), count: num(v) }))
      .filter((c) => Number.isInteger(c.classLevel) && c.classLevel >= -2 && c.classLevel <= 14)
      .sort((a, b) => a.classLevel - b.classLevel),
    studyCoreGranted: num(r.study_core_granted),
    answers7d: num(r.answers_7d),
    childrenAnswering7d: num(r.children_answering_7d),
    topicsMastered: num(r.topics_mastered),
    aiRequestsToday: num(r.ai_requests_today),
  };
}

export async function loadFamilyCounts(db: Sql): Promise<FamilyCounts> {
  const { rows } = await db.query(`select family.control_counts() as counts`);
  return readFamilyCounts(rows[0]?.counts);
}
