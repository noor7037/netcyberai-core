import { writeAuditLog } from '@/lib/audit/log';
import type { BulkPreview, BulkRun, BulkSelection } from '@/lib/contracts/bulk';
import type { SchoolRole } from '@/lib/contracts/modules';
import type { JobHandler, JobQueue, Sql } from '@/lib/jobs/types';
import { PermanentJobError } from '@/lib/jobs/types';
import { bulkAction, type BulkAction, type BulkParams } from './bulk-actions';
import { isUuid, listDefinitions } from './custom-fields';
import { compileListQuery, filteredIds, type ListSpec } from './filter-engine';
import { listSpec } from './lists';

// Bulk actions (17 §1a, C112). One bulk_runs row carries a run from
// preview to finish:
//   previewed ─confirm─▶ running ─▶ succeeded | partially_failed | failed ─undo─▶ undone
//   previewed ─confirm (more than syncLimit rows)─▶ queued ─job─▶ running ─▶ …
//   previewed ─(10 minutes, or the filtered set changed)─▶ expired
// The ids are fixed at preview. Confirm re-runs the filter and refuses if
// the set is no longer the one previewed. Every transition is a
// conditional update on the current status, so a double click or a
// retried job never runs an action twice. Audited with ids and counts.

export const MAX_BULK_ROWS = 5000;
const PREVIEW_TTL_MINUTES = 10;
const KEPT_FAILURES = 20;

type Actor = { schoolId: string; userId: string; role: SchoolRole };
export type BulkError = { ok: false; status: 400 | 403 | 404 | 409 | 410; error: string; count?: number; errors?: unknown };

function toRun(r: Record<string, any>): BulkRun {
  return {
    runId: r.run_id,
    actionId: r.action_id,
    status: r.status === 'previewed' && new Date(r.preview_expires_at) < new Date() ? 'expired' : r.status,
    total: r.total,
    done: r.done,
    failed: r.failed,
    failures: r.failures,
    startedBy: r.created_by,
    startedAt: new Date(r.started_at ?? r.created_at).toISOString(),
    ...(r.finished_at ? { finishedAt: new Date(r.finished_at).toISOString() } : {}),
    ...(r.undo_until && new Date(r.undo_until) > new Date() && ['succeeded', 'partially_failed'].includes(r.status)
      ? { undoUntil: new Date(r.undo_until).toISOString() }
      : {}),
  };
}

async function resolveSelection(db: Sql, spec: ListSpec, schoolId: string, selection: unknown): Promise<{ ok: true; ids: string[]; query: unknown | null } | BulkError> {
  const s = selection as BulkSelection | null;
  if (s?.mode === 'ids') {
    const ids = s.ids;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_BULK_ROWS || !ids.every(isUuid) || new Set(ids).size !== ids.length) {
      return { ok: false, status: 400, error: `ids must be 1 to ${MAX_BULK_ROWS} distinct row ids` };
    }
    const { rows } = await db.query(
      `select ${spec.idExpr} as id from ${spec.from} where ${spec.schoolExpr} = $1 and ${spec.idExpr} = any($2::uuid[])`,
      [schoolId, ids]
    );
    if (rows.length !== ids.length) return { ok: false, status: 400, error: 'some selected rows are not in this list' };
    return { ok: true, ids: [...ids], query: null };
  }
  if (s?.mode === 'filtered') {
    const customFields = spec.customEntity ? await listDefinitions(db, schoolId, spec.customEntity) : [];
    const compiled = compileListQuery(spec, s.query ?? {}, { schoolId, customFields });
    if (!compiled.ok) return { ok: false, status: 400, error: 'invalid list query', errors: compiled.errors };
    const ids = await filteredIds(db, spec, compiled.compiled, MAX_BULK_ROWS);
    if (ids === null) return { ok: false, status: 400, error: `more than ${MAX_BULK_ROWS} rows; narrow the filter` };
    if (ids.length !== s.expectedCount) return { ok: false, status: 409, error: 'selection_changed', count: ids.length };
    if (ids.length === 0) return { ok: false, status: 400, error: 'nothing selected' };
    const { cursor: _c, pageSize: _p, ...query } = compiled.compiled.query;
    return { ok: true, ids, query };
  }
  return { ok: false, status: 400, error: 'selection must be { mode: "ids" } or { mode: "filtered" }' };
}

export async function previewBulk(db: Sql, actor: Actor, body: Record<string, unknown>): Promise<{ ok: true; preview: BulkPreview } | BulkError> {
  const action = bulkAction(body.actionId);
  if (!action) return { ok: false, status: 404, error: 'unknown action' };
  if (!action.def.allowedRoles.includes(actor.role)) return { ok: false, status: 403, error: 'role_not_allowed' };
  const spec = listSpec(action.def.listId)!;
  const sel = await resolveSelection(db, spec, actor.schoolId, body.selection);
  if (!sel.ok) return sel;
  const { minRows = 1, maxRows = MAX_BULK_ROWS } = action.def;
  if (sel.ids.length < minRows || sel.ids.length > maxRows) {
    return { ok: false, status: 400, error: `${action.def.label} works on ${minRows} to ${maxRows} rows at a time` };
  }
  const params = await action.checkParams(db, actor.schoolId, body.params ?? {});
  if (!params.ok) return { ok: false, status: 400, error: params.error };

  const { firstRows, warnings } = await action.preview(db, actor.schoolId, sel.ids, params.params);
  const { rows } = await db.query(
    `insert into bulk_runs (school_id, action_id, params, selection_query, target_ids, total, created_by, created_role, preview_expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(mins => $9))
     returning run_id, preview_expires_at`,
    [actor.schoolId, action.def.actionId, JSON.stringify(params.params), sel.query ? JSON.stringify(sel.query) : null, sel.ids, sel.ids.length, actor.userId, actor.role, PREVIEW_TTL_MINUTES]
  );
  return {
    ok: true,
    preview: {
      previewId: rows[0].run_id,
      actionId: action.def.actionId,
      count: sel.ids.length,
      firstRows,
      warnings,
      runsAsJob: sel.ids.length > action.def.syncLimit,
      expiresAt: new Date(rows[0].preview_expires_at).toISOString(),
    },
  };
}

async function runAction(db: Sql, action: BulkAction, run: Record<string, any>, actor: { userId: string | null; role: SchoolRole | null }): Promise<void> {
  const result = await action.apply(db, run.school_id, run.target_ids, run.params as BulkParams, { userId: run.created_by, role: run.created_role });
  const failed = result.failures.length;
  const status = failed === 0 ? 'succeeded' : result.done === 0 ? 'failed' : 'partially_failed';
  const undoable = action.def.undoWindowSeconds && action.undo && result.done > 0;
  await db.query(
    `update bulk_runs set status = $3, done = $4, failed = $5, failures = $6, undo_data = $7, finished_at = now(),
            undo_until = case when $8::int is null then null else now() + make_interval(secs => $8::int) end
     where school_id = $1 and run_id = $2 and status = 'running'`,
    [run.school_id, run.run_id, status, result.done, failed, JSON.stringify(result.failures.slice(0, KEPT_FAILURES)), JSON.stringify(result.undo), undoable ? action.def.undoWindowSeconds : null]
  );
  await writeAuditLog(db, {
    schoolId: run.school_id,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'bulk.finished',
    targetType: 'bulk_runs',
    targetId: run.run_id,
    afterState: { actionId: run.action_id, status, total: run.total, done: result.done, failed },
  });
}

export async function confirmBulk(
  db: Sql,
  actor: Actor,
  previewId: unknown,
  queue: Pick<JobQueue, 'enqueue'>
): Promise<{ ok: true; run: BulkRun; jobKey?: string } | BulkError> {
  if (!isUuid(previewId)) return { ok: false, status: 404, error: 'preview not found' };
  const { rows } = await db.query(`select * from bulk_runs where school_id = $1 and run_id = $2 for update`, [actor.schoolId, previewId]);
  const run = rows[0];
  if (!run) return { ok: false, status: 404, error: 'preview not found' };
  if (run.created_by !== actor.userId) return { ok: false, status: 403, error: 'only the person who previewed can confirm' };
  if (run.status !== 'previewed') return { ok: true, run: toRun(run) }; // already confirmed: the same answer again
  if (new Date(run.preview_expires_at) < new Date()) {
    await db.query(`update bulk_runs set status = 'expired' where run_id = $1 and status = 'previewed'`, [run.run_id]);
    return { ok: false, status: 410, error: 'preview_expired' };
  }
  const action = bulkAction(run.action_id);
  if (!action || !action.def.allowedRoles.includes(actor.role)) return { ok: false, status: 403, error: 'role_not_allowed' };

  // The set must still be the one previewed.
  const spec = listSpec(action.def.listId)!;
  const selection: BulkSelection = run.selection_query
    ? { mode: 'filtered', query: run.selection_query, expectedCount: run.total }
    : { mode: 'ids', ids: run.target_ids };
  const again = await resolveSelection(db, spec, actor.schoolId, selection);
  const same = again.ok && again.ids.length === run.target_ids.length && [...again.ids].sort().join() === [...run.target_ids].sort().join();
  if (!same) {
    await db.query(`update bulk_runs set status = 'expired' where run_id = $1 and status = 'previewed'`, [run.run_id]);
    const count = again.ok ? again.ids.length : again.count;
    return { ok: false, status: 409, error: 'selection_changed', ...(count !== undefined ? { count } : {}) };
  }

  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'bulk.confirmed',
    targetType: 'bulk_runs',
    targetId: run.run_id,
    afterState: { actionId: run.action_id, total: run.total },
  });

  if (run.total > action.def.syncLimit) {
    const jobKey = `bulk.run:${run.run_id}`;
    await db.query(`update bulk_runs set status = 'queued' where run_id = $1 and status = 'previewed'`, [run.run_id]);
    await queue.enqueue(db, { type: 'bulk.run', payload: { runId: run.run_id }, idempotencyKey: jobKey, schoolId: actor.schoolId });
    return { ok: true, run: toRun({ ...run, status: 'queued' }), jobKey };
  }

  await db.query(`update bulk_runs set status = 'running', started_at = now() where run_id = $1 and status = 'previewed'`, [run.run_id]);
  await runAction(db, action, run, { userId: actor.userId, role: actor.role });
  const { rows: after } = await db.query(`select * from bulk_runs where run_id = $1`, [run.run_id]);
  return { ok: true, run: toRun(after[0]) };
}

// The 'bulk.run' job: a large confirmed run, on the platform connection.
export function bulkRunHandler(deps: { platform: <T>(fn: (db: Sql) => Promise<T>) => Promise<T> }): JobHandler {
  return async (job) => {
    const runId = job.payload.runId;
    if (!isUuid(runId)) throw new PermanentJobError('bad payload');
    await deps.platform(async (db) => {
      const { rows } = await db.query(`select * from bulk_runs where run_id = $1 and school_id = $2 for update`, [runId, job.schoolId]);
      const run = rows[0];
      if (!run) throw new PermanentJobError('run not found');
      if (run.status !== 'queued') return; // already run (a retried job)
      const action = bulkAction(run.action_id);
      if (!action) throw new PermanentJobError('unknown action');
      await db.query(`update bulk_runs set status = 'running', started_at = now() where run_id = $1 and status = 'queued'`, [runId]);
      await runAction(db, action, run, { userId: run.created_by, role: run.created_role });
    });
  };
}

export async function undoBulk(db: Sql, actor: Actor, runId: string): Promise<{ ok: true; run: BulkRun; restored: number; skipped: number } | BulkError> {
  const { rows } = await db.query(`select * from bulk_runs where school_id = $1 and run_id = $2 for update`, [actor.schoolId, runId]);
  const run = rows[0];
  if (!run) return { ok: false, status: 404, error: 'run not found' };
  const action = bulkAction(run.action_id);
  if (!action?.undo || !action.def.allowedRoles.includes(actor.role)) return { ok: false, status: 403, error: 'this run cannot be undone' };
  if (!['succeeded', 'partially_failed'].includes(run.status) || !run.undo_until || new Date(run.undo_until) < new Date()) {
    return { ok: false, status: 409, error: 'undo_window_closed' };
  }
  const { restored, skipped } = await action.undo(db, actor.schoolId, run.undo_data, run.params, { userId: actor.userId, role: actor.role });
  await db.query(`update bulk_runs set status = 'undone', undo_until = null where run_id = $1 and status in ('succeeded', 'partially_failed')`, [runId]);
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'bulk.undone',
    targetType: 'bulk_runs',
    targetId: runId,
    afterState: { actionId: run.action_id, restored, skipped },
  });
  return { ok: true, run: toRun({ ...run, status: 'undone', undo_until: null }), restored, skipped };
}

export async function getBulkRun(db: Sql, schoolId: string, runId: string): Promise<BulkRun | null> {
  const { rows } = await db.query(`select * from bulk_runs where school_id = $1 and run_id = $2`, [schoolId, runId]);
  return rows[0] ? toRun(rows[0]) : null;
}
