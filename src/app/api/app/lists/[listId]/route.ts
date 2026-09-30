import { NextRequest, NextResponse } from 'next/server';
import { decodeListQuery, LIST_QUERY_PARAM } from '@/lib/contracts/filters';
import { listDefinitions } from '@/lib/frameworks/custom-fields';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { compileListQuery, listFields, runList } from '@/lib/frameworks/filter-engine';
import { listSpec } from '@/lib/frameworks/lists';
import { appRoute, jsonError } from '@/lib/frameworks/route';

// One list through the filter engine (C112). GET ?q=<ListQuery, base64url>
// returns a page; GET ?definition=1 returns what can be filtered and shown
// (the list's fields plus the school's custom fields).
export async function GET(req: NextRequest, { params }: { params: { listId: string } }) {
  const spec = listSpec(params.listId);
  if (!spec) return jsonError(404, 'list not found');
  const sp = req.nextUrl.searchParams;
  const raw = sp.get(LIST_QUERY_PARAM);
  const query = raw ? decodeListQuery(raw) : {};
  if (query === null) return jsonError(400, 'q is not a valid list query');

  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, spec.definition.moduleId);
    if (!access.ok) return jsonError(access.status, access.error);
    const customFields = spec.customEntity ? await listDefinitions(db, claims.schoolId, spec.customEntity) : [];
    if (sp.get('definition') === '1') {
      return NextResponse.json({ definition: { ...spec.definition, fields: listFields(spec, customFields) } });
    }
    const compiled = compileListQuery(spec, query, { schoolId: claims.schoolId, customFields });
    if (!compiled.ok) return jsonError(400, 'invalid list query', { errors: compiled.errors });
    const page = await runList(db, spec, compiled.compiled);
    return NextResponse.json({ ...page, query: compiled.compiled.query });
  });
}
