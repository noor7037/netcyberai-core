import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { createPaymentLink } from '@/lib/fees/family';

// POST: one payment link for a child's family, for everything owed or for an amount (C168).
// Its lines fix which due of which child the money is for. Asking again for the same amount returns the same link.
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    if (!isUuid(body?.studentId) || (body?.amountMinor != null && typeof body.amountMinor !== 'number')) return ruleError(400, 'not_sent_properly');
    const result = await createPaymentLink(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { studentId: body.studentId as string, amountMinor: (body.amountMinor as number | null | undefined) ?? null });
    if (result.ok) return NextResponse.json({ link: result.link }, { status: result.created ? 201 : 200 });
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(result.reason === 'unknown_student' ? 404 : result.reason === 'link_exists' ? 409 : 400, 'the link was not made', { code: result.reason });
  });
}
