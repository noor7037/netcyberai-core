import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, ruleError } from '@/lib/frameworks/route';
import { familyDues, openLink } from '@/lib/fees/family';
import { FINANCE } from '@/lib/fees/structures';
import { configuredPaymentProvider } from '@/lib/payments/provider';

// GET ?studentId=: everything this child's family owes, child by child with one total, its open payment link if any, and whether online payment is switched on (C168, C169).
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!FINANCE.includes(claims.role)) return ruleError(403, 'not_allowed');
    const studentId = req.nextUrl.searchParams.get('studentId');
    if (!isUuid(studentId)) return ruleError(400, 'not_sent_properly');
    const family = await familyDues(db, claims.schoolId, studentId);
    if (!family) return jsonError(404, 'not found', { code: 'unknown_student' });
    return NextResponse.json({ family, link: await openLink(db, claims.schoolId, studentId), online: configuredPaymentProvider() !== null });
  });
}
