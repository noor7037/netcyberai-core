import { NextRequest, NextResponse } from 'next/server';
import { CUSTOM_FIELD_ENTITIES } from '@/lib/contracts/custom-fields';
import { createDefinition, ENTITY_MODULE, isEntity, listDefinitions, validateCreate } from '@/lib/frameworks/custom-fields';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { appRoute, jsonError, readJson } from '@/lib/frameworks/route';

// Custom field definitions of one record type (C112). Reading and
// defining both need the record type's module (Students, Parents, Staff,
// Admissions: office modules, 17 §5); RLS keeps it to the office as well.
export async function GET(req: NextRequest) {
  const entity = req.nextUrl.searchParams.get('entity');
  if (!isEntity(entity)) return jsonError(400, `entity must be one of ${CUSTOM_FIELD_ENTITIES.join(', ')}`);
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, ENTITY_MODULE[entity]);
    if (!access.ok) return jsonError(access.status, access.error);
    const includeArchived = req.nextUrl.searchParams.get('archived') === '1';
    return NextResponse.json({ fields: await listDefinitions(db, claims.schoolId, entity, includeArchived) });
  });
}

export async function POST(req: NextRequest) {
  const parsed = validateCreate(await readJson(req));
  if (!parsed.ok) return jsonError(400, parsed.error);
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, ENTITY_MODULE[parsed.value.entity], { write: true });
    if (!access.ok) return jsonError(access.status, access.error);
    const result = await createDefinition(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, parsed.value);
    return result.ok ? NextResponse.json({ field: result.field }, { status: 201 }) : jsonError(result.status, result.error);
  });
}
