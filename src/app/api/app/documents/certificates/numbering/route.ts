import { NextRequest, NextResponse } from 'next/server';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { setNumbering } from '@/lib/documents/certificates';
import { certificateRefusal } from '@/lib/documents/refusal';

// The school's certificate numbering (C232 part A, C230-A): a prefix and a starting number, set once. The principal
// and the school admin. Changeable until the first certificate is issued under it; then refused, here and by the
// database.
//   PUT { prefix: string | null, startAt: number }   set it; answers the numbering and the next number of each type
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || (b.prefix !== null && b.prefix !== undefined && typeof b.prefix !== 'string') || (typeof b.startAt !== 'number' && typeof b.startAt !== 'string')) return ruleError(400, 'not_sent_properly');
    const done = await setNumbering(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { prefix: b.prefix, startAt: b.startAt });
    if (done.ok) return NextResponse.json({ numbering: done.numbering }, { headers: { 'Cache-Control': 'no-store' } });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return certificateRefusal(done.reason === 'fixed' ? 409 : 400, done.reason);
  });
}
