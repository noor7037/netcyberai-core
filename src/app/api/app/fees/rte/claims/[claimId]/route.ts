import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { settleClaim } from '@/lib/rte/desk';

// POST { action: 'paid', paidOn, reference } | { action: 'write_off', note }: a raised claim is paid by the state
// or written off (C223). Either is final.
export async function POST(req: NextRequest, { params }: { params: { claimId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!isUuid(params.claimId) || !b) return ruleError(400, 'not_sent_properly');
    const input =
      b.action === 'paid' && typeof b.paidOn === 'string' && typeof b.reference === 'string' && b.reference.length <= 500
        ? { action: 'paid' as const, paidOn: b.paidOn, reference: b.reference }
        : b.action === 'write_off' && typeof b.note === 'string' && b.note.length <= 2000
          ? { action: 'write_off' as const, note: b.note }
          : null;
    if (!input) return ruleError(400, 'not_sent_properly');
    const done = await settleClaim(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.claimId, input);
    if (done.ok) return NextResponse.json({ ok: true });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (done.reason === 'not_found') return ruleError(404, 'not_found');
    return jsonError(400, 'the claim was not changed', { code: done.reason });
  });
}
