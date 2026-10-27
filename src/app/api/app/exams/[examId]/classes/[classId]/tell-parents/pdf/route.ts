import { NextRequest, NextResponse } from 'next/server';
import { appRoute, appRouteAfter, jsonError, ruleError } from '@/lib/frameworks/route';
import { looksLikePdf, PDF_MAX_BYTES } from '@/lib/marking/checked-pdf-shape';
import { checkedPdfData, PDF_ROLES, storeResultPdf, type StoreResult } from '@/lib/marking/checked-pdf-store';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// A child's checked papers as a PDF, at "Tell parents on WhatsApp" (C366). The principal and the school admin only.
//   GET  ?studentId=  what the office's browser draws the child's PDF from: the child's approved scripts of the
//                     publication in force, as the family is shown them, and the family's language
//   POST ?studentId=  the PDF the browser made (the body, application/pdf): checked to be a PDF by its own bytes and
//                     no larger than PDF_MAX_BYTES before a connection is taken, then kept in the school's own folder
//                     until a message with it is sent (seven days at most). A copy already kept is the answer.
// Nothing here sends anything: the send-gate gives the PDF to WhatsApp only for a message that passes every rule.
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const refused = (reason: Exclude<StoreResult, { ok: true }>['reason']) =>
  reason === 'not_allowed'
    ? ruleError(403, 'not_allowed')
    : reason === 'not_found'
      ? ruleError(404, 'not_found')
      : jsonError(reason === 'too_large' ? 413 : reason === 'not_a_pdf' ? 400 : reason === 'storage' ? 503 : 409, 'the PDF was not kept', { code: reason });

export async function GET(req: NextRequest, { params }: { params: { examId: string; classId: string } }) {
  const studentId = req.nextUrl.searchParams.get('studentId') ?? '';
  return appRoute(req, async ({ claims, db }) => {
    const r = await checkedPdfData(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.examId, params.classId, studentId);
    if (typeof r === 'string') return refused(r);
    return NextResponse.json(r, { headers: NO_STORE });
  });
}

export async function POST(req: NextRequest, { params }: { params: { examId: string; classId: string } }) {
  const studentId = req.nextUrl.searchParams.get('studentId') ?? '';
  const read = async (claims: { role: string }): Promise<Uint8Array | NextResponse> => {
    if (!(PDF_ROLES as readonly string[]).includes(claims.role)) return refused('not_allowed');
    // A body larger than a PDF may be is refused from its declared length, unread.
    const declared = Number(req.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > PDF_MAX_BYTES) return refused('too_large');
    const bytes = new Uint8Array(await req.arrayBuffer().catch(() => new ArrayBuffer(0)));
    if (bytes.length > PDF_MAX_BYTES) return refused('too_large');
    if (!looksLikePdf(bytes)) return refused('not_a_pdf');
    return bytes;
  };
  return appRouteAfter(req, read, async ({ claims, db, prepared }) => {
    const r = await storeResultPdf(db, supabaseFileStorage, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.examId, params.classId, studentId, prepared);
    if (!r.ok) return refused(r.reason);
    return NextResponse.json(r, { status: r.existing ? 200 : 201, headers: NO_STORE });
  });
}
