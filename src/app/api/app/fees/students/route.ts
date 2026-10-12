import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { FINANCE } from '@/lib/fees/structures';

// GET ?classId=: the students of a class the fee counter can take money for (C160).
// A student who has left may still owe, so every student ever placed in the class is listed.
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!FINANCE.includes(claims.role)) return ruleError(403, 'not_allowed');
    const classId = req.nextUrl.searchParams.get('classId');
    if (!isUuid(classId)) return ruleError(400, 'not_sent_properly');
    const { rows } = await db.query(`select student_id, name from fee_billing_students() where school_id = $1 and class_id = $2 order by name`, [claims.schoolId, classId]);
    return NextResponse.json({ students: rows });
  });
}
