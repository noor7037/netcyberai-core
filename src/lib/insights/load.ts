import { isModuleEnabled, type SchoolEntitlements } from '@/lib/contracts/entitlements';
import type { SchoolRole } from '@/lib/contracts/modules';
import { indiaDate } from '@/lib/time/india';
import { FACTS } from './facts';
import { DEFAULT_RANGE, rangeFor } from './screens';
import type { FactContext, FactDefinition, FactId, FactRange, FactResult, InsightsSql, LoadedFacts, RangeId } from './types';

// Loading school facts (docs/26 slice 8d, C203).

export function factDefinition(id: FactId): FactDefinition {
  const def = FACTS.find((f) => f.id === id);
  if (!def) throw new Error(`unknown fact ${id}`);
  return def;
}

// Which facts are this person's: their role, and a module the school has on.
export function factsFor(role: SchoolRole, entitlements: SchoolEntitlements): FactDefinition[] {
  return FACTS.filter((f) => f.roles.includes(role) && isModuleEnabled(entitlements, f.moduleId));
}

// The fixed part of a fact's answer: what it is, how it is counted, where it comes from.
export function describeFact(id: FactId): Pick<FactResult, 'id' | 'moduleId' | 'unit' | 'period' | 'drill' | 'rule' | 'sources'> {
  const def = factDefinition(id);
  return { id: def.id, moduleId: def.moduleId, unit: def.unit, period: def.period, drill: def.drill, rule: { key: `fact.${def.id}.rule`, version: def.version }, sources: def.sources };
}

const isSunday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 0;

export function factContext(who: { schoolId: string; userId: string; role: SchoolRole }, today: string, range: FactRange): FactContext {
  const kept = new Map<string, Promise<unknown>>();
  return {
    ...who,
    today,
    range,
    sunday: isSunday(today),
    once<T>(key: string, load: () => Promise<T>): Promise<T> {
      if (!kept.has(key)) kept.set(key, load());
      return kept.get(key) as Promise<T>;
    },
  };
}

// A fact asked for by a role it is not for. loadFact refuses before any query runs.
export class NotThisRolesFact extends Error {
  constructor(readonly factId: FactId, readonly role: SchoolRole) {
    super(`the fact ${factId} is not for the role ${role}`);
    this.name = 'NotThisRolesFact';
  }
}

// One fact, as the reader. For a caller that needs a single number (a report's total, a check).
// A role the fact is not for gets a refusal, never the number: some tables (attendance, the message log) have
// no role policy in the database, so for them this list is what stands between the number and the role. Every
// way to a fact's value in this library passes here.
export async function loadFact(db: InsightsSql, def: FactDefinition, ctx: FactContext): Promise<FactResult> {
  if (!def.roles.includes(ctx.role)) throw new NotThisRolesFact(def.id, ctx.role);
  const got = await def.load(db, ctx);
  const state = got.state ?? 'ok';
  return {
    ...describeFact(def.id),
    state,
    value: state === 'ok' ? got.value : null,
    ...(got.total !== undefined ? { total: got.total } : {}),
    ...(got.count !== undefined ? { count: got.count } : {}),
    ...(def.period === 'range' ? { range: ctx.range } : def.period === 'today' ? { range: { from: ctx.today, to: ctx.today } } : {}),
    countedAt: new Date().toISOString(),
    href: got.href ?? null,
    ...(got.parts ? { parts: got.parts } : {}),
    ...(got.series ? { series: got.series } : {}),
    attention: state === 'ok' && got.attention === true,
    ...(state === 'ok' && got.attentionCount !== undefined ? { attentionCount: got.attentionCount } : {}),
  };
}

// Every fact this person may read, for the chosen days. Each runs in the
// caller's own tenant transaction behind its own savepoint, so one that
// cannot answer is left out (and named in `failed`) without ending the
// transaction or taking the others with it: the pattern of loadMyDay. A
// fact the role may not read is not asked for and is not in the answer.
//
// `given` narrows the load: `ids` to some facts (a report needs two, not
// thirty), `today` for tests.
export async function loadFacts(
  db: InsightsSql,
  who: { schoolId: string; userId: string; role: SchoolRole },
  entitlements: SchoolEntitlements,
  given: { range?: RangeId | FactRange; today?: string; ids?: readonly FactId[] } = {}
): Promise<LoadedFacts> {
  const today = given.today ?? indiaDate();
  const range = typeof given.range === 'object' ? given.range : rangeFor(today, given.range ?? DEFAULT_RANGE);
  const ctx = factContext(who, today, range);
  const facts: FactResult[] = [];
  const failed: FactId[] = [];
  for (const def of factsFor(who.role, entitlements)) {
    if (given.ids && !given.ids.includes(def.id)) continue;
    try {
      await db.query('savepoint school_fact');
      const fact = await loadFact(db, def, ctx);
      await db.query('release savepoint school_fact');
      facts.push(fact);
    } catch (err) {
      await db.query('rollback to savepoint school_fact').catch(() => undefined);
      console.error('[insights] a fact could not be computed', def.id, err instanceof Error ? err.name : 'error');
      failed.push(def.id);
    }
  }
  return { facts, failed, today, range };
}
