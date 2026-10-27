import { NextRequest, NextResponse } from 'next/server';
import { cancelRequest, createRequest, isPdf, listRequests, REQUEST_PDF_MAX_BYTES } from '@/lib/family/chapter-requests';
import { checkSyllabusRequest, isUuid, PROBLEM_STATUS } from '@/lib/family/child-syllabus';
import { hasPersonalInfo } from '@/lib/family/homework';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';
import { pdfPages } from '@/lib/content/pdf-import';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// Ask for a chapter the catalog does not have (S3, C376), in parent mode only, with the study_core consent.
//   GET                                    the account's requests, newest first
//   POST   { childId, subject, title, pdf? } a request for the child's subject: the chapter's name, and optionally the
//          book's chapter as a PDF (base64, at most 3 MB). The PDF is kept in the private store for the NetCyberAI
//          reviewer only, is removed when the request is ready or declined, and its words are screened for an Aadhaar
//          number or card first (a scan with no text layer cannot be screened and is accepted: the reviewer deletes it
//          from the queue by declining). The request starts as Received. No AI reads it.
//   DELETE { requestId }                   withdraws a request that is still Received (and its file)
// Every query names the session's account; the family row level security holds it too.
export const dynamic = 'force-dynamic';

const REFUSAL: Record<string, number> = { bad_request: 400, not_found: 404, duplicate: 409, too_many: 429, not_ready: 503, storage_unavailable: 503, not_a_pdf: 400, too_big: 413, encrypted: 422, too_long: 422, personal_info: 422 };
const refuse = (reason: string) => NextResponse.json({ error: reason }, { status: REFUSAL[reason] ?? PROBLEM_STATUS[reason as keyof typeof PROBLEM_STATUS] ?? 400 });

export async function GET(req: NextRequest) {
  const p = await requireParent(req);
  if (p.error) return p.error;
  return familyRun(p.session, async (db) => NextResponse.json({ requests: await listRequests(db, p.session.accountId) }));
}

export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const p = await requireParent(req);
  if (p.error) return p.error;
  if (!isUuid(body.childId) || typeof body.subject !== 'string') return refuse('bad_request');
  const childId = body.childId;
  const subject = body.subject;
  let pdf: Uint8Array | null = null;
  if (body.pdf !== undefined && body.pdf !== null) {
    if (typeof body.pdf !== 'string') return refuse('bad_request');
    const b64 = body.pdf.replace(/^data:application\/pdf;base64,/, '');
    if (b64.length > Math.ceil((REQUEST_PDF_MAX_BYTES * 4) / 3) + 4) return refuse('too_big');
    pdf = new Uint8Array(Buffer.from(b64, 'base64'));
    if (!isPdf(pdf)) return refuse('not_a_pdf');
    const pages = pdfPages(pdf);
    if (pages.ok) {
      if (hasPersonalInfo(pages.pages.join('\n'))) return refuse('personal_info');
    } else if (pages.reason !== 'no_text') {
      return refuse(pages.reason === 'too_big' || pages.reason === 'encrypted' || pages.reason === 'too_long' ? pages.reason : 'not_a_pdf');
    }
  }
  const accountId = p.session.accountId;
  return familyRun(p.session, async (db) => {
    const checked = await checkSyllabusRequest(db, accountId, { childId, subject });
    if (!checked.ok) return refuse(checked.reason);
    const made = await createRequest(db, supabaseFileStorage, accountId, { childId, subject, title: body.title, pdf });
    return made.ok ? NextResponse.json({ request: made.request }) : refuse(made.reason);
  });
}

export async function DELETE(req: NextRequest) {
  const body = await jsonBody(req);
  const p = await requireParent(req);
  if (p.error) return p.error;
  if (!isUuid(body.requestId)) return refuse('bad_request');
  const requestId = body.requestId;
  return familyRun(p.session, async (db) => ((await cancelRequest(db, supabaseFileStorage, p.session.accountId, requestId)) ? NextResponse.json({ ok: true }) : refuse('not_found')));
}
