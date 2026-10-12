import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, ruleError } from '@/lib/frameworks/route';
import { familyDues, openLink } from '@/lib/fees/family';
import { FINANCE } from '@/lib/fees/structures';
import { requireSession } from '@/lib/auth/require-session';
import { listMethods } from '@/lib/payments/methods';
import { providerForSchool } from '@/lib/payments/setup';
import { readUpiSettings, upiReady } from '@/lib/payments/upi';

// GET ?studentId=: everything this child's family owes, child by child with one total, its open payment link if any, and whether online payment is switched on (C168, C169).
export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const chosen = session?.schoolId ? await providerForSchool(session.schoolId) : null;
  return appRoute(req, async ({ claims, db }) => {
    if (!FINANCE.includes(claims.role)) return ruleError(403, 'not_allowed');
    const studentId = req.nextUrl.searchParams.get('studentId');
    if (!isUuid(studentId)) return ruleError(400, 'not_sent_properly');
    // A link can be paid online through a gateway, or by UPI straight to the school's own account when the school offers that.
    const upi = (await listMethods(db, claims.schoolId)).find((m) => m.method === 'direct_upi');
    const upiOn = upi?.enabled === true && upiReady(readUpiSettings(upi.settings));
    const family = await familyDues(db, claims.schoolId, studentId);
    if (!family) return jsonError(404, 'not found', { code: 'unknown_student' });
    return NextResponse.json({ family, link: await openLink(db, claims.schoolId, studentId), online: (session?.schoolId === claims.schoolId && chosen !== null) || upiOn });
  });
}
