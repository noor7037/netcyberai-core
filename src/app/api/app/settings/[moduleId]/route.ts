import { NextRequest, NextResponse } from 'next/server';
import { isModuleId } from '@/lib/contracts/modules';
import type { SettingsUpdate } from '@/lib/contracts/settings';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { appRoute, jsonError, readJson } from '@/lib/frameworks/route';
import { settingsSchemaFor } from '@/lib/frameworks/settings-schemas';
import { readSettings, saveSettings, settingsHistory } from '@/lib/frameworks/settings-store';

// A module's settings (17 §1a, C112): GET returns the schema (the screen
// is generated from it), the stored values, the effective values and,
// with ?history=1, the change history. PUT saves a SettingsUpdate; a stale
// baseRevision is refused with 409.

function schemaOr404(moduleId: string) {
  if (!isModuleId(moduleId)) return null;
  return settingsSchemaFor(moduleId);
}

export async function GET(req: NextRequest, { params }: { params: { moduleId: string } }) {
  const schema = schemaOr404(params.moduleId);
  if (!schema) return jsonError(404, 'this module has no settings');
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, schema.moduleId);
    if (!access.ok) return jsonError(access.status, access.error);
    const view = await readSettings(db, claims.schoolId, schema);
    const history = req.nextUrl.searchParams.get('history') === '1' ? await settingsHistory(db, claims.schoolId, schema.moduleId) : undefined;
    return NextResponse.json({ ...view, ...(history ? { history } : {}) });
  });
}

export async function PUT(req: NextRequest, { params }: { params: { moduleId: string } }) {
  const schema = schemaOr404(params.moduleId);
  if (!schema) return jsonError(404, 'this module has no settings');
  const body = await readJson(req);
  if (!body) return jsonError(400, 'a JSON body is required');
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, schema.moduleId, { write: true });
    if (!access.ok) return jsonError(access.status, access.error);
    const update: SettingsUpdate = {
      moduleId: schema.moduleId,
      baseRevision: body.baseRevision as number,
      set: body.set as SettingsUpdate['set'],
      resetToDefault: body.resetToDefault as SettingsUpdate['resetToDefault'],
    };
    const result = await saveSettings(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, schema, update);
    if (result.ok) return NextResponse.json(result);
    const status = result.reason === 'stale_revision' ? 409 : result.reason === 'forbidden' ? 403 : 400;
    return NextResponse.json(result, { status });
  });
}
