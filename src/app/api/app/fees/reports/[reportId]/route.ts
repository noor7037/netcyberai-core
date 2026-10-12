import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { verifyReport } from '@/lib/payments/upi';
import { reopenReport } from '@/lib/payments/upi-alerts';

// POST: a verifier of the school decides a reported UPI payment (docs/24 §3.4 path A, C174).
//   { action: 'found', amountSeenMinor, checked: true }  "I checked the school's bank account: this UTR shows a credit of ₹X"
//   { action: 'not_found' }
//   { action: 'reopen', reason }  a "not found" goes back to waiting (principal or accountant; C175)
// "Found" issues the receipt through the evidence table; above the school's limit it waits for the principal.
export async function POST(req: NextRequest, { params }: { params: { reportId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    if (!isUuid(params.reportId) || (body?.action !== 'found' && body?.action !== 'not_found' && body?.action !== 'reopen')) return ruleError(400, 'not_sent_properly');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    if (body.action === 'reopen') {
      const reopened = await reopenReport(db, actor, params.reportId, typeof body.reason === 'string' ? body.reason.slice(0, 400) : '');
      if (reopened.ok) return NextResponse.json({ state: 'reported' });
      return reopened.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(reopened.reason === 'not_found' ? 404 : reopened.reason === 'reason' ? 400 : 409, 'the payment was not reopened', { code: reopened.reason });
    }
    const result = await verifyReport(db, actor, params.reportId, body.action === 'found' ? { action: 'found', amountSeenMinor: typeof body.amountSeenMinor === 'number' ? body.amountSeenMinor : NaN, checked: body.checked === true } : { action: 'not_found' });
    if (result.ok) return NextResponse.json({ state: result.state, receiptId: result.state === 'verified' ? (result.credit.receiptId ?? null) : null, unappliedMinor: result.state === 'verified' ? result.credit.unappliedMinor : 0 });
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(result.reason === 'not_found' ? 404 : result.reason === 'already_decided' ? 409 : 400, 'the payment was not decided', { code: result.reason });
  });
}
