import { NextRequest, NextResponse } from 'next/server';
import { deleteFamilyEnquiries, familyEnquiries } from '@/lib/admissions/admissions';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';

// A parent's erasure request about a family that never joined (C223-A answer 3, C224). The office only. The phone
// travels in the body, never in the address.
//   POST { action: 'find', phone }                      the family's enquiries that would be deleted (not admitted),
//                                                        and how many admitted ones stay (a child's record each)
//   POST { action: 'delete', phone, enquiryIds }         delete exactly those, with their steps; refused when the
//                                                        family's list has changed since it was read
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || (b.action !== 'find' && b.action !== 'delete')) return ruleError(400, 'not_sent_properly');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    if (b.action === 'find') {
      const found = await familyEnquiries(db, actor, b.phone);
      if (found.ok) return NextResponse.json(found.family, { headers: { 'Cache-Control': 'no-store' } });
      return found.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(400, 'that was not done', { code: found.reason });
    }
    const done = await deleteFamilyEnquiries(db, actor, b.phone, b.enquiryIds);
    if (done.ok) return NextResponse.json({ deleted: done.enquiryIds.length, steps: done.steps });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(done.reason === 'changed' || done.reason === 'nothing' ? 409 : 400, 'that was not done', { code: done.reason });
  });
}
