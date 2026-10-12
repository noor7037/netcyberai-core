import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { verifyReport } from '@/lib/payments/upi';

// POST: a verifier of the school decides a reported UPI payment (docs/24 §3.4 path A, C174).
//   { action: 'found', amountSeenMinor, checked: true }  "I checked the school's bank account: this UTR shows a credit of ₹X"
//   { action: 'not_found' }
// "Found" issues the receipt through the evidence table; above the school's limit it waits for the principal.
export async function POST(req: NextRequest, { params }: { params: { reportId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    if (!isUuid(params.reportId) || (body?.action !== 'found' && body?.action !== 'not_found')) return ruleError(400, 'not_sent_properly');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const result = await verifyReport(db, actor, params.reportId, body.action === 'found' ? { action: 'found', amountSeenMinor: typeof body.amountSeenMinor === 'number' ? body.amountSeenMinor : NaN, checked: body.checked === true } : { action: 'not_found' });
    if (result.ok) return NextResponse.json({ state: result.state, receiptId: result.state === 'verified' ? (result.credit.receiptId ?? null) : null, unappliedMinor: result.state === 'verified' ? result.credit.unappliedMinor : 0 });
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(result.reason === 'not_found' ? 404 : result.reason === 'already_decided' ? 409 : 400, 'the payment was not decided', { code: result.reason });
  });
}
