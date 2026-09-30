import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { listSpec } from '@/lib/frameworks/lists';
import { appRoute, jsonError, readJson } from '@/lib/frameworks/route';
import { deleteView, updateView } from '@/lib/frameworks/saved-views';

// Rename, re-query or re-default a saved view; delete it (C112).
export async function PATCH(req: NextRequest, { params }: { params: { viewId: string } }) {
  if (!isUuid(params.viewId)) return jsonError(404, 'view not found');
  const body = await readJson(req);
  if (!body) return jsonError(400, 'a JSON body is required');
  return appRoute(req, async ({ claims, db }) => {
    const { rows } = await db.query(`select list_id from saved_views where school_id = $1 and view_id = $2`, [claims.schoolId, params.viewId]);
    const spec = listSpec(rows[0]?.list_id);
    if (!spec) return jsonError(404, 'view not found');
    const access = await checkModuleAccess(db, claims, spec.definition.moduleId);
    if (!access.ok) return jsonError(access.status, access.error);
    const r = await updateView(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, spec, params.viewId, body);
    return r.ok ? NextResponse.json({ view: r.value }) : jsonError(r.status, r.error, r.errors ? { errors: r.errors } : {});
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { viewId: string } }) {
  if (!isUuid(params.viewId)) return jsonError(404, 'view not found');
  return appRoute(req, async ({ claims, db }) => {
    const r = await deleteView(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.viewId);
    return r.ok ? new NextResponse(null, { status: 204 }) : jsonError(r.status, r.error);
  });
}
