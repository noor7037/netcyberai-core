import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, ruleError } from '@/lib/frameworks/route';
import { homeworkFileUrl } from '@/lib/homework/homework';
import { FileStorageUnavailableError } from '@/lib/storage/file-storage';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// GET: a short-lived link to one file of a homework, only after its row was
// read under row level security (C150).
export async function GET(req: NextRequest, { params }: { params: { homeworkId: string; attachmentId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.homeworkId) || !isUuid(params.attachmentId)) return ruleError(400, 'not_sent_properly');
    try {
      const url = await homeworkFileUrl(db, supabaseFileStorage, claims.schoolId, params.homeworkId, params.attachmentId);
      return url ? NextResponse.json({ url }) : jsonError(404, 'not found', { code: 'not_found' });
    } catch (err) {
      if (err instanceof FileStorageUnavailableError) return jsonError(503, 'files cannot be opened yet', { code: 'storage_unavailable' });
      throw err;
    }
  });
}
