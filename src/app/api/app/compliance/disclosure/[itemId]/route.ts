import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { removeDisclosure } from '@/lib/compliance/disclosure';
import { deskInPlan } from '@/lib/compliance/qualifications';

// DELETE: removes a disclosure item from what is in force. Its versions are kept, with a last one that says it was
// removed, by whom and when. The principal and the school admin (C227).
export async function DELETE(req: NextRequest, { params }: { params: { itemId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await deskInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed'); // a part of the plan (C226)
    if (!isUuid(params.itemId)) return ruleError(400, 'not_sent_properly');
    const gone = await removeDisclosure(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.itemId);
    if (gone.ok) return NextResponse.json({ itemId: gone.itemId });
    return gone.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : ruleError(404, 'not_found');
  });
}
