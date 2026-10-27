import type { JobHandler, Sql } from '@/lib/jobs/types';
import { prepareKeyTest, recordModelList } from '../control';
import { chainOf } from '../platform';

// The health probe (G5, C373): every 15 minutes (pg_cron → public.ai_health_probe_enqueue → this job), each provider
// in an enabled route (Primary, Backup 1, Backup 2) that has a key is asked its free check: the vendor's model list or
// token count (adapters/connection.ts, Vertex AI's countTokens, the OpenAI-compatible adapter's /models), never a paid
// answer. The result goes to every model of that provider in a route, in control.ai_provider_health's probe columns,
// through control.record_ai_probe. A probe never moves a circuit (only real calls do, C370): it tells the founder
// whether a provider answers while nothing is being asked of it.
//
// Each key is opened in its own short transaction (prepareKeyTest, as Control's "Test the key"), the vendor is asked
// with no database connection held, and the results are written in one more. One provider failing does not stop the
// others; a provider that cannot be checked for free (no check, no key, no address) is left as it is.

export const AI_HEALTH_PROBE_JOB = 'ai.health_probe';

type Platform = <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;

// Provider → its models in enabled routes, from the profiles' rows. Pure, so the test reads the same grouping.
export function probeTargets(rows: { provider_id: string | null; model: string | null; fallback: unknown; enabled: boolean }[]): Map<string, string[]> {
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.enabled) continue;
    for (const link of chainOf(r) ?? []) {
      const models = out.get(link.provider) ?? new Set<string>();
      models.add(link.model);
      out.set(link.provider, models);
    }
  }
  return new Map(Array.from(out, ([p, m]) => [p, [...m].sort()]));
}

export function aiHealthProbeHandler(deps: { platform: Platform }): JobHandler {
  return async () => {
    const targets = await deps.platform(async (db) =>
      probeTargets((await db.query(`select provider_id, model, fallback, enabled from control.ai_profiles`)).rows as { provider_id: string | null; model: string | null; fallback: unknown; enabled: boolean }[])
    );
    const results = await Promise.all(
      Array.from(targets, async ([provider, models]) => {
        const prepared = await deps.platform((db) => prepareKeyTest(db, provider)).catch(() => null);
        if (!prepared?.ok) return null;
        const outcome = await prepared.run().catch(() => ({ ok: false, models: null }));
        return { provider, models, ok: outcome.ok, list: outcome.models };
      })
    );
    const done = results.filter((r): r is { provider: string; models: string[]; ok: boolean; list: string[] | null | undefined } => r !== null);
    if (!done.length) return;
    await deps.platform(async (db) => {
      for (const r of done) {
        for (const model of r.models) await db.query(`select control.record_ai_probe($1, $2, $3, 'health_endpoint')`, [r.provider, model, r.ok]);
        // The model ids the same answer gave, for Control's pickers (G6, C379).
        await recordModelList(db, r.provider, r.list);
      }
    });
  };
}
