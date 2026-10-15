import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, ruleError } from '@/lib/frameworks/route';
import { deskInPlan, isDeskRole } from '@/lib/compliance/qualifications';
import { removeSqaafEvidence, sqaafFileUrl } from '@/lib/compliance/sqaaf';
import { FileStorageUnavailableError } from '@/lib/storage/file-storage';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// GET: a short-lived link to a piece of SQAAF evidence's file, only after its row was read under row level security.
// DELETE: removes a piece of evidence (audited), and its file. The principal and the school admin (C227).
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { evidenceId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await deskInPlan(db, claims.schoolId)) || !isDeskRole(claims.role)) return ruleError(403, 'not_allowed'); // a part of the plan (C226)
    if (!isUuid(params.evidenceId)) return ruleError(400, 'not_sent_properly');
    try {
      const url = await sqaafFileUrl(db, supabaseFileStorage, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.evidenceId);
      return url ? NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store' } }) : ruleError(404, 'not_found');
    } catch (err) {
      if (err instanceof FileStorageUnavailableError) return jsonError(503, 'files cannot be opened yet', { code: 'storage_unavailable' });
      throw err;
    }
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { evidenceId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await deskInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed'); // a part of the plan (C226)
    if (!isUuid(params.evidenceId)) return ruleError(400, 'not_sent_properly');
    const gone = await removeSqaafEvidence(db, supabaseFileStorage, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.evidenceId);
    if (gone.ok) return NextResponse.json({ evidenceId: gone.evidenceId });
    return gone.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : ruleError(404, 'not_found');
  });
}
