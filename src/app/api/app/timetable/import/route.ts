import { NextRequest, NextResponse } from 'next/server';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { importTimetable } from '@/lib/timetable/timetable';

// POST: a CSV of periods (class,day,period,subject,teacher), office only.
// All or nothing (C145): with any problem, a clash included, nothing is
// imported and the answer lists every problem by its line.
const MAX_CSV_CHARS = 200_000;

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!['principal', 'school_admin'].includes(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    if (typeof body?.csv !== 'string' || body.csv.length > MAX_CSV_CHARS) return ruleError(400, 'not_sent_properly');
    const result = await importTimetable(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, body.csv);
    if (!result.ok) return jsonError(422, 'nothing was imported: the file has problems', { code: 'import_problems', problems: result.problems });
    return NextResponse.json({ imported: result.imported });
  });
}
