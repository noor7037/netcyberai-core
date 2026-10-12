import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { setHeadActive, setHeadMandatory, setHeadRteCovered } from '@/lib/fees/structures';

// PATCH: retire a fee head or bring it back, say whether every child must pay it, or whether RTE covers it (C157, C159, C162). One change at a time. Its name never changes.
export async function PATCH(req: NextRequest, { params }: { params: { headId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    const sent = (['isActive', 'isMandatory', 'rteCovered'] as const).filter((k) => typeof body?.[k] === 'boolean');
    if (!isUuid(params.headId) || sent.length !== 1) return ruleError(400, 'not_sent_properly');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const set = { isActive: setHeadActive, isMandatory: setHeadMandatory, rteCovered: setHeadRteCovered }[sent[0]];
    const result = await set(db, actor, params.headId, body?.[sent[0]] === true);
    if (result.ok) return NextResponse.json({ head: result.head });
    return result.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(404, 'not found', { code: 'not_found' });
  });
}
