import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, ruleError } from '@/lib/frameworks/route';
import { HOMEWORK_FILE_MAX_BYTES, addHomeworkFile } from '@/lib/homework/homework';
import { isUploadProblem } from '@/lib/privacy/upload-problems';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// POST: add a photo or a PDF to a homework (multipart, field "file"; C150).
// A body larger than one file plus its form wrapping is refused from its
// declared length, before any of it is read.
export async function POST(req: NextRequest, { params }: { params: { homeworkId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.homeworkId)) return ruleError(400, 'not_sent_properly');
    const declared = Number(req.headers.get('content-length'));
    if (!Number.isFinite(declared) || declared <= 0 || declared > HOMEWORK_FILE_MAX_BYTES + 64 * 1024) return jsonError(413, 'the file is too large', { code: 'too_large' });
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!file || typeof file === 'string' || file.size === 0) return ruleError(400, 'not_sent_properly');
    if (file.size > HOMEWORK_FILE_MAX_BYTES) return jsonError(413, 'the file is too large', { code: 'too_large' });
    const result = await addHomeworkFile(db, supabaseFileStorage, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.homeworkId, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    if (result.ok) return NextResponse.json({ attachmentId: result.attachmentId }, { status: 201 });
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    // An Aadhaar number or card, or words that could not be read (C232 part A): the catalogue's own sentence.
    if (isUploadProblem(result.reason)) return ruleError(400, result.reason, { field: 'file' });
    const status = result.reason === 'not_found' ? 404 : result.reason === 'too_large' ? 413 : result.reason === 'storage_unavailable' ? 503 : 400;
    return jsonError(status, 'the file was not added', { code: result.reason });
  });
}
