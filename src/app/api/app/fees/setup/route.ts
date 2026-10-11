import { NextRequest, NextResponse } from 'next/server';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { FINANCE, listHeads, listStructures } from '@/lib/fees/structures';
import { indiaDate } from '@/lib/time/india';

// GET: what the Fees page needs to show and edit heads and structures (docs/23 6a, C157).
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!FINANCE.includes(claims.role)) return ruleError(403, 'not_allowed');
    const classes = (await db.query(`select class_id, name from classes where school_id = $1 order by name`, [claims.schoolId])).rows;
    const sessions = (await db.query(`select session_id, label, start_date::text as start_date, end_date::text as end_date, is_current from academic_sessions where school_id = $1 order by start_date desc`, [claims.schoolId])).rows;
    return NextResponse.json({ today: indiaDate(), heads: await listHeads(db, claims.schoolId), structures: await listStructures(db, claims.schoolId), classes, sessions });
  });
}
