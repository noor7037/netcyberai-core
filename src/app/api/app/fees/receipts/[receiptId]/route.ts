import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { getReceipt, reverseReceipt } from '@/lib/fees/payments';
import { FINANCE } from '@/lib/fees/structures';

// One receipt (C160).
//   GET   the receipt as issued
//   POST  reverse it, with a reason (the principal or the school admin)
export async function GET(req: NextRequest, { params }: { params: { receiptId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!FINANCE.includes(claims.role)) return ruleError(403, 'not_allowed');
    if (!isUuid(params.receiptId)) return ruleError(400, 'not_sent_properly');
    const receipt = await getReceipt(db, claims.schoolId, params.receiptId);
    return receipt ? NextResponse.json({ receipt }) : jsonError(404, 'not found', { code: 'not_found' });
  });
}

export async function POST(req: NextRequest, { params }: { params: { receiptId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    if (!isUuid(params.receiptId) || typeof body?.reason !== 'string' || body.reason.length > 1000) return ruleError(400, 'not_sent_properly');
    const result = await reverseReceipt(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.receiptId, body.reason);
    if (result.ok) return NextResponse.json(result);
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(result.reason === 'not_found' ? 404 : result.reason === 'already_reversed' ? 409 : 400, 'the receipt was not reversed', { code: result.reason });
  });
}
