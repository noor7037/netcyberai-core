import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { COPY_MAX_BYTES } from '@/lib/documents/certificates';
import { deliverRequest } from '@/lib/documents/certificate-requests';
import { certificateRefusal } from '@/lib/documents/refusal';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// POST (multipart, field "file": the certificate's PDF drawn on this device): kept as the family's copy, the request
// becomes ready and the family is told in its feed and by email (W21-M7). A body larger than one PDF plus its form
// wrapping is refused from its declared length, before any of it is read.
export async function POST(req: NextRequest, { params }: { params: { requestId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.requestId)) return ruleError(400, 'not_sent_properly');
    const declared = Number(req.headers.get('content-length'));
    if (!Number.isFinite(declared) || declared <= 0 || declared > COPY_MAX_BYTES + 64 * 1024) return certificateRefusal(413, 'too_large');
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!file || typeof file === 'string' || file.size === 0) return ruleError(400, 'not_sent_properly');
    const done = await deliverRequest(db, jobQueue, supabaseFileStorage, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.requestId, new Uint8Array(await file.arrayBuffer()));
    if (done.ok) return NextResponse.json({ ok: true }, { status: 201 });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (done.reason === 'not_found') return ruleError(404, 'not_found', { field: 'document' });
    return certificateRefusal(done.reason === 'too_large' ? 413 : done.reason === 'storage_unavailable' ? 503 : 400, done.reason);
  });
}
