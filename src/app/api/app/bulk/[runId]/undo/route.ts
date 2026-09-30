import { NextRequest, NextResponse } from 'next/server';
import { bulkAction } from '@/lib/frameworks/bulk-actions';
import { undoBulk } from '@/lib/frameworks/bulk-engine';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { appRoute, jsonError } from '@/lib/frameworks/route';

// Undo a bulk run inside its undo window (C112). Rows changed by someone
// else since the run are left as they are and counted as skipped.
export async function POST(req: NextRequest, { params }: { params: { runId: string } }) {
  if (!isUuid(params.runId)) return jsonError(404, 'run not found');
  return appRoute(req, async ({ claims, db }) => {
    const { rows } = await db.query(`select action_id from bulk_runs where school_id = $1 and run_id = $2`, [claims.schoolId, params.runId]);
    const action = bulkAction(rows[0]?.action_id);
    if (!action) return jsonError(404, 'run not found');
    const access = await checkModuleAccess(db, claims, action.def.moduleId, { write: true, roles: action.def.allowedRoles });
    if (!access.ok) return jsonError(access.status, access.error);
    const r = await undoBulk(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.runId);
    if (r.ok) return NextResponse.json({ run: r.run, restored: r.restored, skipped: r.skipped });
    return jsonError(r.status, r.error);
  });
}
