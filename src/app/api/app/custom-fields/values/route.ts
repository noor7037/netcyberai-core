import { NextRequest, NextResponse } from 'next/server';
import { ENTITY_MODULE, isEntity, isUuid, readValues, writeValues } from '@/lib/frameworks/custom-fields';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { appRoute, jsonError, readJson } from '@/lib/frameworks/route';

// One record's custom field values (C112): GET ?entity=&recordId=, PUT
// { entity, recordId, values: { <fieldId>: value | null } }.
export async function GET(req: NextRequest) {
  const entity = req.nextUrl.searchParams.get('entity');
  const recordId = req.nextUrl.searchParams.get('recordId');
  if (!isEntity(entity) || !isUuid(recordId)) return jsonError(400, 'entity and recordId are required');
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, ENTITY_MODULE[entity]);
    if (!access.ok) return jsonError(access.status, access.error);
    return NextResponse.json({ values: await readValues(db, claims.schoolId, recordId) });
  });
}

export async function PUT(req: NextRequest) {
  const body = await readJson(req);
  if (!body || !isEntity(body.entity) || !isUuid(body.recordId)) return jsonError(400, 'entity, recordId and values are required');
  const entity = body.entity;
  const recordId = body.recordId;
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, ENTITY_MODULE[entity], { write: true });
    if (!access.ok) return jsonError(access.status, access.error);
    const result = await writeValues(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, entity, recordId, body.values);
    if (result.ok) return NextResponse.json({ values: result.values });
    return jsonError(result.status, result.error, result.errors ? { errors: result.errors } : {});
  });
}
