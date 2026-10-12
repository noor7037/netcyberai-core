import { NextRequest, NextResponse } from 'next/server';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { listThreads } from '@/lib/whatsapp/replies';

// GET: the conversations parents have started with the school (docs/25 slice 7f, C187). The principal and school
// admin see every one; a teacher, those of guardians of their own classes (row level security decides).
const STAFF: readonly string[] = ['principal', 'school_admin', 'teacher'];
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!STAFF.includes(claims.role)) return ruleError(403, 'not_allowed');
    return NextResponse.json({ threads: await listThreads(db, claims.schoolId), mayLift: claims.role === 'principal' || claims.role === 'school_admin' }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
