import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { setHeadActive, setHeadMandatory } from '@/lib/fees/structures';

// PATCH: retire a fee head or bring it back, or say whether every child must pay it (C157, C159). One change at a time. Its name never changes.
export async function PATCH(req: NextRequest, { params }: { params: { headId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    if (!isUuid(params.headId) || (typeof body?.isActive !== 'boolean') === (typeof body?.isMandatory !== 'boolean')) return ruleError(400, 'not_sent_properly');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const result = typeof body?.isActive === 'boolean' ? await setHeadActive(db, actor, params.headId, body.isActive) : await setHeadMandatory(db, actor, params.headId, body?.isMandatory === true);
    if (result.ok) return NextResponse.json({ head: result.head });
    return result.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(404, 'not found', { code: 'not_found' });
  });
}
