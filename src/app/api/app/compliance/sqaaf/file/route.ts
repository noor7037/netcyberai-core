import { NextRequest, NextResponse } from 'next/server';
import { appRouteAfter, jsonError, ruleError } from '@/lib/frameworks/route';
import { deskInPlan } from '@/lib/compliance/qualifications';
import { addSqaafFile, FILE_MAX_BYTES, sniffEvidenceFile } from '@/lib/compliance/sqaaf';
import { checkUpload, type UploadCheck } from '@/lib/privacy/upload-check';
import { isUploadProblem } from '@/lib/privacy/upload-problems';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// POST (multipart: "file", "standardCode", "note"): a photo or a PDF as evidence for one SQAAF standard, with a note
// or none. A body larger than one file plus its form wrapping is refused from its declared length, before any of it is
// read. The principal and the school admin (C227). The file is read, and checked for an Aadhaar number or card (C232
// part A: its OCR takes seconds), after the session is checked and before the transaction opens.
type Read = { name: string; bytes: Uint8Array; standardCode: string; note: string | null; checked?: UploadCheck };
export async function POST(req: NextRequest) {
  const read = async (): Promise<Read | NextResponse> => {
    const declared = Number(req.headers.get('content-length'));
    if (!Number.isFinite(declared) || declared <= 0 || declared > FILE_MAX_BYTES + 64 * 1024) return jsonError(413, 'the file is too large', { code: 'too_large' });
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    const standardCode = form?.get('standardCode');
    const note = form?.get('note') ?? null;
    if (!file || typeof file === 'string' || file.size === 0 || typeof standardCode !== 'string' || (note !== null && typeof note !== 'string')) return ruleError(400, 'not_sent_properly');
    if (file.size > FILE_MAX_BYTES) return jsonError(413, 'the file is too large', { code: 'too_large' });
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Only a photo or a PDF is read; anything else is refused in the transaction, as before, without reading it.
    return { name: file.name, bytes, standardCode, note, checked: sniffEvidenceFile(bytes) ? await checkUpload({ bytes, name: file.name }) : undefined };
  };
  return appRouteAfter(req, read, async ({ claims, db, prepared: file }) => {
    if (!(await deskInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed'); // a part of the plan (C226)
    const made = await addSqaafFile(db, supabaseFileStorage, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { standardCode: file.standardCode, note: file.note, name: file.name, bytes: file.bytes }, undefined, file.checked);
    if (made.ok) return NextResponse.json({ evidenceId: made.evidenceId }, { status: 201 });
    if (made.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    // An Aadhaar number or card, or words that could not be read (C232 part A): the catalogue's own sentence.
    if (isUploadProblem(made.reason)) return ruleError(400, made.reason, { field: 'file' });
    const status = made.reason === 'too_large' ? 413 : made.reason === 'storage_unavailable' ? 503 : 400;
    return jsonError(status, 'the evidence was not added', { code: made.reason });
  });
}
