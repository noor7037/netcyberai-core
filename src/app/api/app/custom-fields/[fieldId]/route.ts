import { NextRequest, NextResponse } from 'next/server';
import { ENTITY_MODULE, isUuid, patchDefinition } from '@/lib/frameworks/custom-fields';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { appRoute, jsonError, readJson } from '@/lib/frameworks/route';

// Change a custom field's label, options, required flag, or archive it
// (C112). Key and type never change once values may exist.
export async function PATCH(req: NextRequest, { params }: { params: { fieldId: string } }) {
  if (!isUuid(params.fieldId)) return jsonError(404, 'field not found');
  const body = await readJson(req);
  if (!body) return jsonError(400, 'a JSON body is required');
  return appRoute(req, async ({ claims, db }) => {
    const { rows } = await db.query(`select entity from custom_field_definitions where school_id = $1 and field_id = $2`, [claims.schoolId, params.fieldId]);
    if (!rows[0]) return jsonError(404, 'field not found');
    const access = await checkModuleAccess(db, claims, ENTITY_MODULE[rows[0].entity as keyof typeof ENTITY_MODULE], { write: true });
    if (!access.ok) return jsonError(access.status, access.error);
    const result = await patchDefinition(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.fieldId, body);
    return result.ok ? NextResponse.json({ field: result.field }) : jsonError(result.status, result.error);
  });
}
