import { NextRequest, NextResponse } from 'next/server';
import { bulkAction } from '@/lib/frameworks/bulk-actions';
import { previewBulk } from '@/lib/frameworks/bulk-engine';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { appRoute, jsonError, readJson } from '@/lib/frameworks/route';

// Preview a bulk action (C112): { actionId, selection, params } → the
// count, the first rows and what happens to each, warnings, and a
// previewId to confirm with. Nothing changes yet.
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const action = bulkAction(body?.actionId);
  if (!body || !action) return jsonError(404, 'unknown action');
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, action.def.moduleId, { write: true, roles: action.def.allowedRoles });
    if (!access.ok) return jsonError(access.status, access.error);
    const r = await previewBulk(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, body);
    if (r.ok) return NextResponse.json({ preview: r.preview });
    const { ok: _ok, status, error, ...extra } = r;
    return jsonError(status, error, extra);
  });
}
