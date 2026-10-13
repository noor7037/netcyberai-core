import { NextRequest, NextResponse } from 'next/server';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { PARENT_SCREEN_ROLES, listGuardians } from '@/lib/parents/guardians';

// GET ?q=: the guardians this person may see (docs/25 slice 7j, C192): the office, all of them; a teacher, those of
// children in their own classes. The first fifty by name; search by a guardian's or a child's name (the office also
// by four or more digits of the number).
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!PARENT_SCREEN_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 80);
    return NextResponse.json({ guardians: await listGuardians(db, { schoolId: claims.schoolId, role: claims.role }, q) }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
