import { NextRequest, NextResponse } from 'next/server';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { listSpec } from '@/lib/frameworks/lists';
import { appRoute, jsonError, readJson } from '@/lib/frameworks/route';
import { createView, listViews } from '@/lib/frameworks/saved-views';

// Saved views of one list (C112): GET ?listId= returns the views this
// person may see (their own and the school's) and their role's default.
export async function GET(req: NextRequest) {
  const spec = listSpec(req.nextUrl.searchParams.get('listId'));
  if (!spec) return jsonError(404, 'list not found');
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, spec.definition.moduleId);
    if (!access.ok) return jsonError(access.status, access.error);
    const views = await listViews(db, claims.schoolId, spec.definition.listId);
    const roleDefault = views.find((v) => v.scope === 'school' && v.defaultForRoles?.includes(claims.role)) ?? null;
    return NextResponse.json({ views, defaultViewId: roleDefault?.viewId ?? null });
  });
}

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const spec = listSpec(body?.listId);
  if (!body || !spec) return jsonError(400, 'listId of a known list is required');
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, spec.definition.moduleId);
    if (!access.ok) return jsonError(access.status, access.error);
    const { listId: _listId, ...rest } = body;
    const r = await createView(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, spec, rest);
    return r.ok ? NextResponse.json({ view: r.value }, { status: 201 }) : jsonError(r.status, r.error, r.errors ? { errors: r.errors } : {});
  });
}
