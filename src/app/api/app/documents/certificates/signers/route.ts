import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { nameSignatory } from '@/lib/documents/certificates';
import { certificateRefusal } from '@/lib/documents/refusal';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// Who signs certificates besides the principal (C232 part A, C230-A): the principal names a school admin, who then
// signs the certificates they issue with their own signature; un-named, their signature is removed. The principal only.
//   POST { userId, named: true | false }
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(b.userId) || typeof b.named !== 'boolean') return ruleError(400, 'not_sent_properly');
    const done = await nameSignatory(db, supabaseFileStorage, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, b.userId as string, b.named);
    if (done.ok) return NextResponse.json({ ok: true });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (done.reason === 'not_found') return ruleError(404, 'not_found', { field: 'document' });
    return certificateRefusal(400, done.reason);
  });
}
