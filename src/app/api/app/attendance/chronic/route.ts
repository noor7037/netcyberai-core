import { NextRequest, NextResponse } from 'next/server';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { LIST_ROLES, TELL_ROLES, chronicList } from '@/lib/attendance/chronic';
import { CHRONIC } from '@/lib/early-warning/chronic-absence';
import { indiaDate } from '@/lib/time/india';

// W20-B (docs/42 H2): the students who are becoming chronically absent, each with the reason the rule gives and when the
// family was last told. The principal and the school admin read the school's; a teacher, their own classes' (the
// database decides). Only the principal tells the family (POST ./tell).
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!LIST_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    const rows = await chronicList(db, claims.schoolId, indiaDate());
    return NextResponse.json({ rows, mayTell: TELL_ROLES.includes(claims.role), tellOnceInDays: CHRONIC.tellOnceInDays }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
