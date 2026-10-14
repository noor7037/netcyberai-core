import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { deskInPlan, removeEvidence } from '@/lib/rte/desk';

// DELETE: take a wrong piece of evidence out of a child's file (C223). Audited; the captured document itself stays.
export async function DELETE(req: NextRequest, { params }: { params: { evidenceId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await deskInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed'); // a part of the plan (C223-A)
    if (!isUuid(params.evidenceId)) return ruleError(400, 'not_sent_properly');
    const done = await removeEvidence(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.evidenceId);
    if (done.ok) return NextResponse.json({ ok: true });
    return done.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : ruleError(404, 'not_found');
  });
}
