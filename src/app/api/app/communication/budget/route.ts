import { NextRequest, NextResponse } from 'next/server';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { schoolSpend } from '@/lib/whatsapp/cost';

// GET: this school's WhatsApp month (C197): its budget, what delivered messages have cost, what is on its way, and
// how many messages the budget held back. For the principal and the school admin.
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (claims.role !== 'principal' && claims.role !== 'school_admin') return ruleError(403, 'not_allowed');
    return NextResponse.json(await schoolSpend(db, claims.schoolId), { headers: { 'Cache-Control': 'no-store' } });
  });
}
