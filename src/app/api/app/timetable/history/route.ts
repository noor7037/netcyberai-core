import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { generatorInPlan, generatorNames, history, PLANNERS, versionDetail } from '@/lib/timetable/generator-store';

// The timetable's change history (docs/28 slice 10f, C229): each publish of a proposed timetable, who and when, and
// what it changed. The office reads it, with the timetable generator in the plan.
//   GET               the publishes, newest first
//   GET ?versionId=   one publish read back: the whole timetable before it and after it
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await generatorInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed'); // a part of the plan (C226)
    if (!PLANNERS.includes(claims.role)) return ruleError(403, 'not_allowed');
    const versionId = req.nextUrl.searchParams.get('versionId');
    const headers = { 'Cache-Control': 'no-store' };
    if (versionId === null) return NextResponse.json({ versions: await history(db, claims.schoolId) }, { headers });
    if (!isUuid(versionId)) return ruleError(400, 'not_sent_properly');
    const version = await versionDetail(db, claims.schoolId, versionId);
    if (!version) return ruleError(404, 'not_found');
    return NextResponse.json({ version, names: await generatorNames(db, claims.schoolId) }, { headers });
  });
}
