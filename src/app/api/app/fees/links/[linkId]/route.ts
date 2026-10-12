import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, ruleError } from '@/lib/frameworks/route';
import { cancelPaymentLink } from '@/lib/fees/family';

// DELETE: cancel an open payment link (C168). The record stays; it can no longer be paid.
export async function DELETE(req: NextRequest, { params }: { params: { linkId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.linkId)) return ruleError(400, 'not_sent_properly');
    const result = await cancelPaymentLink(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.linkId);
    if (result.ok) return NextResponse.json({ cancelled: true });
    return result.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(404, 'not found', { code: 'not_found' });
  });
}
