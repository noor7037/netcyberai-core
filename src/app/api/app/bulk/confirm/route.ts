import { NextRequest, NextResponse } from 'next/server';
import { confirmBulk } from '@/lib/frameworks/bulk-engine';
import { bulkAction } from '@/lib/frameworks/bulk-actions';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { appRoute, jsonError, readJson } from '@/lib/frameworks/route';
import { kickJobs } from '@/lib/jobs/handlers';
import { jobQueue } from '@/lib/jobs/pg-queue';

// Confirm a previewed bulk action (C112): { previewId }. Runs it now, or
// queues it on the job pipeline above the action's syncLimit. Confirming
// twice returns the same run.
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (!body) return jsonError(400, 'previewId is required');
  let jobKey: string | undefined;
  const res = await appRoute(req, async ({ claims, db }) => {
    const { rows } = await db.query(`select action_id from bulk_runs where school_id = $1 and run_id::text = $2`, [claims.schoolId, String(body.previewId)]);
    const action = bulkAction(rows[0]?.action_id);
    if (!action) return jsonError(404, 'preview not found');
    const access = await checkModuleAccess(db, claims, action.def.moduleId, { write: true, roles: action.def.allowedRoles });
    if (!access.ok) return jsonError(access.status, access.error);
    const r = await confirmBulk(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, body.previewId, jobQueue);
    if (!r.ok) {
      const { ok: _ok, status, error, ...extra } = r;
      return jsonError(status, error, extra);
    }
    jobKey = r.jobKey;
    return NextResponse.json({ run: r.run });
  });
  // After the commit: start the queued job now; the sweeper covers the rest.
  if (jobKey) await kickJobs([jobKey]);
  return res;
}
