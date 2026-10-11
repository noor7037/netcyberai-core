import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { setHeadActive } from '@/lib/fees/structures';

// PATCH: retire a fee head, or bring it back. Its name never changes (C157).
export async function PATCH(req: NextRequest, { params }: { params: { headId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    if (!isUuid(params.headId) || typeof body?.isActive !== 'boolean') return ruleError(400, 'not_sent_properly');
    const result = await setHeadActive(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.headId, body.isActive);
    if (result.ok) return NextResponse.json({ head: result.head });
    return result.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(404, 'not found', { code: 'not_found' });
  });
}
