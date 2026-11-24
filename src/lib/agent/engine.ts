import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTenantContext } from '@/lib/auth/db';
import type { SessionClaims } from '@/lib/auth/types';
import { agentNoPreview, agentTx } from './ctx';
import { callStep, catalogEntry, type Auth } from './call';
import type { Change, DryRun, Step, StepResult, Tier } from './types';

// The change request engine (C546). A plan is an ordered list of school-app routes. It runs inside ONE transaction
// opened as the asking person (withTenantContext), which every route joins (src/lib/agent/ctx.ts):
//   check   → run every step, read what changed from the audit rows they wrote, roll everything back;
//   preview → the same, replayed on every screen the person opens (src/lib/agent/preview.ts), rolled back;
//   apply   → run again, and commit only if every step worked and what changed is exactly what was reviewed (the
//             hash), so nothing goes live that the person did not see. All or nothing.

export const MAX_STEPS = 60;
export const PRINCIPAL_ROLES = ['principal'] as const;

class RolledBack<T> extends Error {
  constructor(readonly value: T) {
    super('agent_rolled_back');
  }
}

export function planTier(steps: readonly Step[]): Tier | null {
  let tier: Tier = 0;
  for (const s of steps) {
    const e = catalogEntry(s.endpoint);
    if (!e) return null;
    if (e.tier > tier) tier = e.tier;
  }
  return tier;
}

// Who may make a plan live: tier 1 by the person who asked for it (their own role already ran every step); tier 2 by
// the principal only.
export function mayApprove(tier: Tier, approver: { role: string; userId: string }, author: string): boolean {
  if (tier >= 2) return (PRINCIPAL_ROLES as readonly string[]).includes(approver.role);
  return approver.userId === author || (PRINCIPAL_ROLES as readonly string[]).includes(approver.role);
}

const TIME_KEY = /(_at|At|_on|On|date|Date|time|Time|revision|hash|version)$/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// Keys in one order, as jsonb hands a stored plan back in its own order.
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

function stripTimes(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripTimes);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !TIME_KEY.test(k)).map(([k, x]) => [k, stripTimes(x)]));
  return v;
}

// What the person approves: the plan itself and what it changed, with times left out and every id the plan made
// named by its order ("#1"), so the same plan on the same school hashes the same at review and at going live.
export function diffHash(steps: readonly Step[], changes: readonly Change[], known: ReadonlySet<string>): string {
  const ids = new Map<string, string>();
  const json = canonical(stripTimes(changes)).replace(UUID, (id) => {
    const low = id.toLowerCase();
    if (known.has(low)) return low;
    if (!ids.has(low)) ids.set(low, `#${ids.size + 1}`);
    return ids.get(low)!;
  });
  return createHash('sha256').update(canonical(steps)).update('\n').update(json).digest('hex');
}

function uuidsIn(v: unknown, into: Set<string>): Set<string> {
  JSON.stringify(v ?? null).replace(UUID, (id) => {
    into.add(id.toLowerCase());
    return id;
  });
  return into;
}

async function runSteps(client: PoolClient, claims: SessionClaims, steps: readonly Step[], auth: Auth, mode: 'check' | 'preview' | 'apply'): Promise<DryRun> {
  const tier = planTier(steps);
  if (tier === null || steps.length === 0 || steps.length > MAX_STEPS) {
    return { steps: [], changes: [], ok: false, hash: '0'.repeat(64), tier: 0 };
  }
  const mark = Number((await client.query(`select coalesce(max(audit_id), 0) as m from audit_log`)).rows[0]?.m ?? 0);
  const results: StepResult[] = [];
  await agentTx.run({ client, userId: claims.sub, schoolId: claims.schoolId as string, mode, savepoints: 0 }, async () => {
    const answers: unknown[] = [];
    for (const step of steps) {
      const r = await callStep(step, answers, auth, true);
      results.push(r);
      answers.push(r.answer);
      if (!r.ok) break;
    }
  });
  const { rows } = await client.query(
    `select event_action, target_type, target_id, before_state, after_state from audit_log
      where audit_id > $1 and school_id = $2 and actor_user_id = $3 order by audit_id`,
    [mark, claims.schoolId, claims.sub]
  );
  const changes: Change[] = rows.map((r: Record<string, unknown>) => ({
    action: String(r.event_action),
    target: (r.target_type as string | null) ?? null,
    targetId: (r.target_id as string | null) ?? null,
    before: r.before_state ?? null,
    after: r.after_state ?? null,
  }));
  const ok = results.length === steps.length && results.every((r) => r.ok);
  const known = uuidsIn(steps, new Set<string>());
  for (const c of changes) uuidsIn(c.before, known);
  return { steps: results, changes, ok, hash: diffHash(steps, changes, known), tier };
}

// Runs the plan as the person and always rolls back.
export async function checkPlan(claims: SessionClaims, steps: readonly Step[], auth: Auth): Promise<DryRun> {
  try {
    await agentNoPreview.run(true, () =>
      withTenantContext(claims, async (client) => {
        throw new RolledBack(await runSteps(client, claims, steps, auth, 'check'));
      })
    );
  } catch (err) {
    if (err instanceof RolledBack) return err.value as DryRun;
    throw err;
  }
  throw new Error('unreachable');
}

export type ApplyOutcome = { ok: true; run: DryRun } | { ok: false; why: 'failed' | 'changed_since_review'; run: DryRun };

// Runs the plan again as the approver and commits only when every step worked and the hash matches the review.
// `inside` runs in the same transaction after the steps (the request's own status), so it commits with them.
export async function applyPlan(
  claims: SessionClaims,
  steps: readonly Step[],
  auth: Auth,
  reviewedHash: string,
  inside: (client: PoolClient, run: DryRun) => Promise<void>
): Promise<ApplyOutcome> {
  try {
    return await agentNoPreview.run(true, () =>
      withTenantContext(claims, async (client) => {
        const run = await runSteps(client, claims, steps, auth, 'apply');
        if (!run.ok) throw new RolledBack<ApplyOutcome>({ ok: false, why: 'failed', run });
        if (run.hash !== reviewedHash) throw new RolledBack<ApplyOutcome>({ ok: false, why: 'changed_since_review', run });
        await inside(client, run);
        return { ok: true as const, run };
      })
    );
  } catch (err) {
    if (err instanceof RolledBack) return err.value as ApplyOutcome;
    throw err;
  }
}

// Reads for the agent's answers: GET routes only, as the person, in a transaction that is rolled back.
export async function readSteps(claims: SessionClaims, steps: readonly Step[], auth: Auth): Promise<StepResult[]> {
  try {
    await agentNoPreview.run(true, () =>
      withTenantContext(claims, async (client) => {
        const out: StepResult[] = [];
        await agentTx.run({ client, userId: claims.sub, schoolId: claims.schoolId as string, mode: 'check', savepoints: 0 }, async () => {
          for (const s of steps) out.push(await callStep(s, [], auth, false));
        });
        throw new RolledBack(out);
      })
    );
  } catch (err) {
    if (err instanceof RolledBack) return err.value as StepResult[];
    throw err;
  }
  return [];
}
