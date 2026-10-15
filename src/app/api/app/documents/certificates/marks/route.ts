import { NextRequest, NextResponse } from 'next/server';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { MARK_MAX_BYTES, removeMark, saveMark } from '@/lib/documents/certificates';
import { certificateRefusal } from '@/lib/documents/refusal';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// The school's seal (the principal keeps it, C228) and this person's own signature (C232 part A: the principal, or a
// school admin the principal named as a signatory; drawn only on the certificates they sign).
//   POST (multipart: "kind" seal | signature, "file" a PNG prepared on this device)   keep it, replacing the old one
//   DELETE ?kind=seal | signature                                                     remove it
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const declared = Number(req.headers.get('content-length'));
    if (!Number.isFinite(declared) || declared <= 0 || declared > MARK_MAX_BYTES + 64 * 1024) return certificateRefusal(413, 'too_large', {}, { field: 'file', maxMb: 1 });
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!form || !file || typeof file === 'string' || file.size === 0) return ruleError(400, 'not_sent_properly');
    const saved = await saveMark(db, supabaseFileStorage, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, form.get('kind'), new Uint8Array(await file.arrayBuffer()));
    if (saved.ok) return NextResponse.json({ ok: true }, { status: 201 });
    if (saved.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return certificateRefusal(saved.reason === 'storage_unavailable' ? 503 : saved.reason === 'too_large' ? 413 : 400, saved.reason, {}, saved.reason === 'too_large' ? { field: 'file', maxMb: 1 } : undefined);
  });
}

export async function DELETE(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const done = await removeMark(db, supabaseFileStorage, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, req.nextUrl.searchParams.get('kind'));
    if (done.ok) return NextResponse.json({ ok: true });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (done.reason === 'not_found') return ruleError(404, 'not_found', { field: 'document' });
    return certificateRefusal(400, done.reason);
  });
}
