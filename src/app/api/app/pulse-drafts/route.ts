import { NextRequest, NextResponse } from 'next/server';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { listDrafts } from '@/lib/pulse/drafts';
import { indiaDate } from '@/lib/time/india';

// GET: today's Pulse messages (drafts and ready), for the classes the caller may see (C151).
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!['principal', 'school_admin', 'teacher'].includes(claims.role)) return ruleError(403, 'not_allowed');
    const today = indiaDate();
    return NextResponse.json({ today, drafts: await listDrafts(db, claims.schoolId, today) });
  });
}
