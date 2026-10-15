import { NextRequest, NextResponse } from 'next/server';
import { appRoute } from '@/lib/frameworks/route';
import { loadOwnQualification } from '@/lib/compliance/qualifications';

// GET: the signed-in staff member's own qualification row, read-only, for their account page (C230-A, C232 part B).
// Row level security lets a teacher read that row and nothing else of the compliance desk; the office keeps it.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const own = await loadOwnQualification(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role });
    return NextResponse.json(own, { headers: { 'Cache-Control': 'no-store' } });
  });
}
