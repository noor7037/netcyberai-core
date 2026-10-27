import type { Sql } from '@/lib/jobs/types';
import { adapterFor, textAdapters, type TextAdapter } from '../adapters';
import { workersModelLooksRight } from '../adapters/workers-ai';
import { aiEncryptionKey, unsealAiKey, type SealedRow } from '../credentials';
import { labCase, labDataset } from './cases';
import { runLabCall, type LabErrorClass, type LabOutcome } from './runner';

// The Quality Lab's database side (G4, C372). The founder only: every statement runs as the platform role (nca_super)
// through Control's route guard, and reads or writes control.ai_eval_runs and control.ai_eval_results and nothing else
// that it writes. A lab answer never enters a learner's history, a family table, the content library, the usage counts
// or any shared answer cache: it stays in these two tables (test/ai/lab.test.ts proves it on the real migrations).
//
// A call runs in three steps, as the platform's do, so no connection is held while a vendor answers: prepareLabCase()
// checks the cell belongs to the run and opens the provider's key in the caller's first short transaction; send() calls
// the adapter with no database; saveLabResult() writes the measured outcome in a second one. The lab names a provider
// and model directly and may only use a provider the founder has saved a key for (the stand-in, which needs none, is
// never offered here).

export type LabLink = { provider: string; model: string };
export type LabError = 'cases' | 'models' | 'provider' | 'model' | 'not_found' | 'not_configured' | 'score';
const MODEL = /^@?[A-Za-z0-9._:/-]{1,80}$/;
const PROVIDER = /^[a-z][a-z0-9_-]{1,39}$/;

// The providers the lab may call: a real text adapter that needs a key, whose saved key opens with the server's key.
async function openKeys(db: Sql, env: Record<string, string | undefined>): Promise<Map<string, { adapter: TextAdapter; apiKey: string }>> {
  const open = new Map<string, { adapter: TextAdapter; apiKey: string }>();
  const k = aiEncryptionKey(env);
  if (!k) return open;
  for (const adapter of textAdapters()) {
    if (!adapter.needsKey) continue;
    const { rows } = await db.query(`select ciphertext, iv, tag, key_version from control.ai_sealed_credential($1)`, [adapter.providerId]);
    if (!rows[0]) continue;
    try {
      open.set(adapter.providerId, { adapter, apiKey: unsealAiKey(k, adapter.providerId, rows[0] as SealedRow) });
    } catch {
      // Sealed with another key version, or changed: not usable until the key is saved again.
    }
  }
  return open;
}

export type LabSetup = {
  keyReady: boolean;
  datasetVersion: string;
  // Provider ids with a usable key (never a key, never its characters).
  providers: string[];
  // Provider and model pairs Control's features already name, offered as a starting choice.
  suggestions: LabLink[];
};

export async function loadLabSetup(db: Sql, env: Record<string, string | undefined> = process.env): Promise<LabSetup> {
  const keys = await openKeys(db, env);
  const providers = Array.from(keys.keys()).sort();
  const { rows } = await db.query(`select provider_id, model, fallback from control.ai_profiles where provider_id is not null and model is not null order by profile_id`);
  const seen = new Set<string>();
  const suggestions: LabLink[] = [];
  const add = (provider: unknown, model: unknown) => {
    if (typeof provider !== 'string' || typeof model !== 'string' || !keys.has(provider) || !MODEL.test(model)) return;
    const key = `${provider} ${model}`;
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push({ provider, model });
  };
  for (const r of rows) {
    add(r.provider_id, r.model);
    for (const f of Array.isArray(r.fallback) ? r.fallback : []) add(f?.provider, f?.model);
  }
  return { keyReady: aiEncryptionKey(env) !== null, datasetVersion: labDataset().version, providers, suggestions };
}

function linkLooksRight(l: LabLink): boolean {
  return PROVIDER.test(l.provider) && MODEL.test(l.model) && (l.provider !== 'workers-ai' || workersModelLooksRight(l.model));
}

// A new run: one to two hundred known cases, two to four distinct provider and model pairs, each provider with a
// usable key. The run keeps the cases' version, so its table can always be read against the cases it ran.
export async function startLabRun(db: Sql, by: { userId: string }, caseIds: string[], models: LabLink[], env: Record<string, string | undefined> = process.env): Promise<{ ok: true; runId: string } | { ok: false; code: LabError }> {
  const ids = Array.from(new Set(caseIds));
  if (ids.length === 0 || ids.length > 200 || ids.length !== caseIds.length || ids.some((id) => labCase(id) === null)) return { ok: false, code: 'cases' };
  const pairs = new Set(models.map((m) => `${m.provider} ${m.model}`));
  if (models.length < 2 || models.length > 4 || pairs.size !== models.length) return { ok: false, code: 'models' };
  if (models.some((m) => !linkLooksRight(m))) return { ok: false, code: 'model' };
  const keys = await openKeys(db, env);
  if (keys.size === 0) return { ok: false, code: 'not_configured' };
  if (models.some((m) => !keys.has(m.provider) || adapterFor(m.provider, env) === null)) return { ok: false, code: 'provider' };
  const { rows } = await db.query(`insert into control.ai_eval_runs (dataset_version, case_ids, models, started_by) values ($1, $2::text[], $3::jsonb, $4) returning run_id`, [
    labDataset().version,
    ids,
    JSON.stringify(models.map((m) => ({ provider: m.provider, model: m.model }))),
    by.userId,
  ]);
  return { ok: true, runId: String(rows[0].run_id) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PreparedLabCase = { ok: true; send: () => Promise<LabOutcome> } | { ok: false; code: LabError };

// Step 1, in the caller's transaction: the cell must be one of the run's (its case and one of its models), and the
// provider's key must open. The key lives only inside send's closure.
export async function prepareLabCase(db: Sql, runId: string, caseId: string, link: LabLink, env: Record<string, string | undefined> = process.env): Promise<PreparedLabCase> {
  if (!UUID.test(runId) || !linkLooksRight(link)) return { ok: false, code: 'not_found' };
  const run = (await db.query(`select case_ids, models from control.ai_eval_runs where run_id = $1`, [runId])).rows[0];
  const c = labCase(caseId);
  if (!run || !c || !(run.case_ids as string[]).includes(caseId)) return { ok: false, code: 'not_found' };
  if (!(run.models as LabLink[]).some((m) => m.provider === link.provider && m.model === link.model)) return { ok: false, code: 'not_found' };
  const keys = await openKeys(db, env);
  const ready = keys.get(link.provider);
  if (!ready) return { ok: false, code: 'not_configured' };
  let sent = false;
  return {
    ok: true,
    send: async () => {
      // One prepared cell, one vendor request.
      if (sent) throw new Error('a prepared lab call sends once');
      sent = true;
      return runLabCall(ready.adapter, ready.apiKey, link.model, c);
    },
  };
}

export type LabResult = {
  resultId: string;
  caseId: string;
  provider: string;
  model: string;
  outputText: string;
  latencyMs: number;
  firstTokenMs: number | null;
  tokensIn: number;
  tokensOut: number;
  jsonValid: boolean | null;
  checkPassed: boolean | null;
  errorClass: LabErrorClass | null;
  score: number | null;
  notes: string | null;
  createdAt: string;
};

const RESULT_COLUMNS = `result_id, case_id, provider_id, model, output_text, latency_ms, first_token_ms, tokens_in, tokens_out, json_valid, check_passed, error_class, score, notes, created_at`;
const resultOf = (r: Record<string, unknown>): LabResult => ({
  resultId: String(r.result_id),
  caseId: String(r.case_id),
  provider: String(r.provider_id),
  model: String(r.model),
  outputText: String(r.output_text ?? ''),
  latencyMs: Number(r.latency_ms),
  firstTokenMs: r.first_token_ms === null || r.first_token_ms === undefined ? null : Number(r.first_token_ms),
  tokensIn: Number(r.tokens_in),
  tokensOut: Number(r.tokens_out),
  jsonValid: typeof r.json_valid === 'boolean' ? r.json_valid : null,
  checkPassed: typeof r.check_passed === 'boolean' ? r.check_passed : null,
  errorClass: (r.error_class as LabErrorClass | null) ?? null,
  score: r.score === null || r.score === undefined ? null : Number(r.score),
  notes: (r.notes as string | null) ?? null,
  createdAt: new Date(r.created_at as string).toISOString(),
});

// Step 3, in the caller's second transaction. Running a cell again replaces its answer and clears its score.
export async function saveLabResult(db: Sql, runId: string, caseId: string, link: LabLink, o: LabOutcome): Promise<LabResult> {
  const { rows } = await db.query(
    `insert into control.ai_eval_results (run_id, case_id, provider_id, model, output_text, latency_ms, first_token_ms, tokens_in, tokens_out, json_valid, check_passed, error_class)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (run_id, case_id, provider_id, model) do update set output_text = excluded.output_text, latency_ms = excluded.latency_ms,
       first_token_ms = excluded.first_token_ms, tokens_in = excluded.tokens_in, tokens_out = excluded.tokens_out, json_valid = excluded.json_valid,
       check_passed = excluded.check_passed, error_class = excluded.error_class, score = null, notes = null, scored_by = null, scored_at = null, created_at = now()
     returning ${RESULT_COLUMNS}`,
    [runId, caseId, link.provider, link.model, o.outputText, o.latencyMs, o.firstTokenMs, o.tokensIn, o.tokensOut, o.jsonValid, o.checkPassed, o.errorClass]
  );
  return resultOf(rows[0]);
}

// The founder's 1–5 score (or none) and a short note on one answer.
export async function scoreLabResult(db: Sql, by: { userId: string }, resultId: string, score: number | null, notes: string | null): Promise<{ ok: true } | { ok: false; code: LabError }> {
  if (!UUID.test(resultId)) return { ok: false, code: 'not_found' };
  if (score !== null && (!Number.isInteger(score) || score < 1 || score > 5)) return { ok: false, code: 'score' };
  const note = notes?.trim() ? notes.trim().slice(0, 1000) : null;
  const { rows } = await db.query(`update control.ai_eval_results set score = $2, notes = $3, scored_by = $4, scored_at = now() where result_id = $1 returning result_id`, [resultId, score, note, by.userId]);
  return rows[0] ? { ok: true } : { ok: false, code: 'not_found' };
}

export type LabRun = { runId: string; datasetVersion: string; caseIds: string[]; models: LabLink[]; startedAt: string; results: LabResult[] };

export async function loadLabRun(db: Sql, runId: string): Promise<LabRun | null> {
  if (!UUID.test(runId)) return null;
  const run = (await db.query(`select run_id, dataset_version, case_ids, models, started_at from control.ai_eval_runs where run_id = $1`, [runId])).rows[0];
  if (!run) return null;
  const { rows } = await db.query(`select ${RESULT_COLUMNS} from control.ai_eval_results where run_id = $1 order by case_id, provider_id, model`, [runId]);
  return {
    runId: String(run.run_id),
    datasetVersion: String(run.dataset_version),
    caseIds: run.case_ids as string[],
    models: (run.models as LabLink[]).map((m) => ({ provider: m.provider, model: m.model })),
    startedAt: new Date(run.started_at as string).toISOString(),
    results: rows.map(resultOf),
  };
}

export type LabRunSummary = { runId: string; startedAt: string; cases: number; models: LabLink[]; answered: number; scored: number };

export async function listLabRuns(db: Sql): Promise<LabRunSummary[]> {
  const { rows } = await db.query(
    `select r.run_id, r.started_at, cardinality(r.case_ids) as cases, r.models,
            (select count(*) from control.ai_eval_results x where x.run_id = r.run_id) as answered,
            (select count(*) from control.ai_eval_results x where x.run_id = r.run_id and x.score is not null) as scored
       from control.ai_eval_runs r order by r.started_at desc limit 10`
  );
  return rows.map((r) => ({ runId: String(r.run_id), startedAt: new Date(r.started_at as string).toISOString(), cases: Number(r.cases), models: r.models as LabLink[], answered: Number(r.answered), scored: Number(r.scored) }));
}
