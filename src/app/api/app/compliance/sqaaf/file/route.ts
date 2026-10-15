import { NextRequest, NextResponse } from 'next/server';
import { appRoute, jsonError, ruleError } from '@/lib/frameworks/route';
import { deskInPlan } from '@/lib/compliance/qualifications';
import { addSqaafFile, FILE_MAX_BYTES } from '@/lib/compliance/sqaaf';
import { isUploadProblem } from '@/lib/privacy/upload-problems';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// POST (multipart: "file", "standardCode", "note"): a photo or a PDF as evidence for one SQAAF standard, with a note
// or none. A body larger than one file plus its form wrapping is refused from its declared length, before any of it is
// read. The principal and the school admin (C227).
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await deskInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed'); // a part of the plan (C226)
    const declared = Number(req.headers.get('content-length'));
    if (!Number.isFinite(declared) || declared <= 0 || declared > FILE_MAX_BYTES + 64 * 1024) return jsonError(413, 'the file is too large', { code: 'too_large' });
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    const standardCode = form?.get('standardCode');
    const note = form?.get('note') ?? null;
    if (!file || typeof file === 'string' || file.size === 0 || typeof standardCode !== 'string' || (note !== null && typeof note !== 'string')) return ruleError(400, 'not_sent_properly');
    if (file.size > FILE_MAX_BYTES) return jsonError(413, 'the file is too large', { code: 'too_large' });
    const made = await addSqaafFile(db, supabaseFileStorage, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { standardCode, note, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    if (made.ok) return NextResponse.json({ evidenceId: made.evidenceId }, { status: 201 });
    if (made.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    // An Aadhaar number or card, or words that could not be read (C232 part A): the catalogue's own sentence.
    if (isUploadProblem(made.reason)) return ruleError(400, made.reason, { field: 'file' });
    const status = made.reason === 'too_large' ? 413 : made.reason === 'storage_unavailable' ? 503 : 400;
    return jsonError(status, 'the evidence was not added', { code: made.reason });
  });
}
