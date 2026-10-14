import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { actOnClaim, deskInPlan, type ClaimAction } from '@/lib/rte/desk';

// POST, one of (C223, C225):
//   { action: 'receipt', amount: "5000.00", receivedOn, reference }  the state paid some or all of what is still due;
//                                                                    the receipt that covers the claim marks it paid
//   { action: 'write_off', note }                                     what is still due will not come
//   { action: 'reopen', reason }                                      a written-off claim raised again: the principal
//                                                                     or the school admin only
//   { action: 'reverse', receiptId, reason }                          a receipt typed wrongly taken back; the reason is
//                                                                     'typed_wrong', 'recorded_twice' or 'not_received'
export async function POST(req: NextRequest, { params }: { params: { claimId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await deskInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed'); // a part of the plan (C223-A)
    const b = await readJson(req);
    if (!isUuid(params.claimId) || !b) return ruleError(400, 'not_sent_properly');
    const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
    const input: ClaimAction | null =
      b.action === 'receipt' && text(b.amount, 20) && text(b.receivedOn, 10) && text(b.reference, 500)
        ? { action: 'receipt', amount: b.amount, receivedOn: b.receivedOn, reference: b.reference }
        : b.action === 'write_off' && text(b.note, 2000)
          ? { action: 'write_off', note: b.note }
          : b.action === 'reopen' && text(b.reason, 2000)
            ? { action: 'reopen', reason: b.reason }
            : b.action === 'reverse' && isUuid(b.receiptId) && text(b.reason, 40)
              ? { action: 'reverse', receiptId: b.receiptId as string, reason: b.reason }
              : null;
    if (!input) return ruleError(400, 'not_sent_properly');
    const done = await actOnClaim(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.claimId, input);
    if (done.ok) return NextResponse.json({ ok: true, state: done.state, dueMinor: done.dueMinor });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (done.reason === 'not_found') return ruleError(404, 'not_found');
    return jsonError(400, 'the claim was not changed', { code: done.reason });
  });
}
