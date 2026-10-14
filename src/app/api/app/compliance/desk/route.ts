import { NextRequest, NextResponse } from 'next/server';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { loadDisclosure } from '@/lib/compliance/disclosure';
import { deskInPlan, loadRegister } from '@/lib/compliance/qualifications';
import { loadSqaaf } from '@/lib/compliance/sqaaf';

// The compliance desk (docs/28 row 10d, C227).
//   GET  the teacher register (each teaching staff account's qualifications and TET, what is missing and what ends
//        within the school's window), the mandatory disclosure items in force with their earlier versions, and the
//        SQAAF standards with the school's evidence. The principal and the school admin only, of a school whose plan
//        has the desk. Form 6 is its own route (/api/app/compliance/form6).
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await deskInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed'); // a part of the plan (C226)
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const register = await loadRegister(db, actor);
    const disclosure = await loadDisclosure(db, actor);
    const sqaaf = await loadSqaaf(db, actor);
    if (!register || !disclosure || !sqaaf) return ruleError(403, 'not_allowed');
    return NextResponse.json({ register, disclosure, sqaaf }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
