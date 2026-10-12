import { NextRequest, NextResponse } from 'next/server';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { FINANCE } from '@/lib/fees/structures';
import { listMethods } from '@/lib/payments/methods';
import { readUpiSettings, waitingReports } from '@/lib/payments/upi';

// GET: the UPI payments parents have reported and the school has not yet verified (docs/24 §3.4 path A, C174),
// whether this person is one of the school's verifiers, and the amount above which the principal must also confirm.
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!FINANCE.includes(claims.role)) return ruleError(403, 'not_allowed');
    const upi = readUpiSettings((await listMethods(db, claims.schoolId)).find((m) => m.method === 'direct_upi')?.settings);
    return NextResponse.json({ waiting: await waitingReports(db, claims.schoolId), mayVerify: upi.verifiers.includes(claims.role), isPrincipal: claims.role === 'principal', limitMinor: upi.principalLimitMinor });
  });
}
