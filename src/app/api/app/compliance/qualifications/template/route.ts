import { NextRequest } from 'next/server';
import { csvResponse, toCsv } from '@/lib/export/csv';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { deskInPlan, isDeskRole } from '@/lib/compliance/qualifications';
import { TEACHER_COLUMNS } from '@/lib/free-tools/teacher-register';

// GET: an empty CSV in the website tool's own columns (TEACHER_COLUMNS), to fill in and import (C227).
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await deskInPlan(db, claims.schoolId)) || !isDeskRole(claims.role)) return ruleError(403, 'not_allowed');
    return csvResponse('teacher-register-template', toCsv([...TEACHER_COLUMNS], []));
  });
}
