import { NextRequest, NextResponse } from 'next/server';
import { PAGE_MAX_BYTES, PAGES_PER_REQUEST, REQUEST_MAX_BYTES } from '@/lib/contracts/marking';
import { EXAM_READERS } from '@/lib/exams/exams';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRouteAfter } from '@/lib/frameworks/route';
import { markingRefusal } from '@/lib/marking/http';
import { addPages, checkPage, isFileNo, isPageNo, type CheckedPage } from '@/lib/marking/upload';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// AI marking (C350): page pictures of an open upload, a few at a time.
//   POST multipart: for each page, in order, the fields fileNo, pageNo and page (the JPEG the browser made), and for a
//        by_child upload childId (the child chosen for the page's file while scanning, C230-AJ); at most
//        PAGES_PER_REQUEST pages a request → { pages: [{ fileNo, pageNo, pageId, duplicate }] }
// The form is read and every picture checked (a JPEG by its own bytes, its size, its width and height) before a
// connection is taken; the upload, the person, the class and the month's pages are checked in the transaction
// (src/lib/marking/upload.ts). A page sent again answers with the page already kept.
export const dynamic = 'force-dynamic';

const DIGITS = /^\d{1,4}$/;

export async function POST(req: NextRequest, { params }: { params: { uploadId: string } }) {
  const read = async (claims: { role: string }): Promise<CheckedPage[] | NextResponse> => {
    if (!(EXAM_READERS as readonly string[]).includes(claims.role)) return markingRefusal('not_allowed');
    if (!isUuid(params.uploadId)) return markingRefusal('not_found');
    // A body larger than a request may carry (the host refuses one over 4.5 MB) is refused from its declared length, unread.
    const declared = Number(req.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > REQUEST_MAX_BYTES + 64 * 1024) return markingRefusal('too_large');
    const form = await req.formData().catch(() => null);
    if (!form) return markingRefusal('not_sent_properly');
    const named = form.get('uploadId');
    if (named !== null && named !== params.uploadId) return markingRefusal('not_sent_properly');
    const files = form.getAll('page');
    const fileNos = form.getAll('fileNo');
    const pageNos = form.getAll('pageNo');
    // The children are named for every page or for none; which the upload needs is checked with it (src/lib/marking/upload.ts).
    const childIds = form.getAll('childId');
    if (files.length < 1 || files.length > PAGES_PER_REQUEST || fileNos.length !== files.length || pageNos.length !== files.length) return markingRefusal('not_sent_properly');
    if (childIds.length !== 0 && (childIds.length !== files.length || !childIds.every((c) => typeof c === 'string' && isUuid(c)))) return markingRefusal('not_sent_properly');
    const pages: CheckedPage[] = [];
    const seen = new Set<string>();
    if (files.reduce((n, f) => n + (typeof f === 'string' ? 0 : f.size), 0) > REQUEST_MAX_BYTES) return markingRefusal('too_large');
    for (let at = 0; at < files.length; at++) {
      const file = files[at];
      const fileNo = typeof fileNos[at] === 'string' && DIGITS.test(fileNos[at] as string) ? Number(fileNos[at]) : NaN;
      const pageNo = typeof pageNos[at] === 'string' && DIGITS.test(pageNos[at] as string) ? Number(pageNos[at]) : NaN;
      if (typeof file === 'string' || !isFileNo(fileNo) || !isPageNo(pageNo) || seen.has(`${fileNo}:${pageNo}`)) return markingRefusal('not_sent_properly', { at });
      seen.add(`${fileNo}:${pageNo}`);
      if (file.size > PAGE_MAX_BYTES) return markingRefusal('too_large', { at });
      const checked = checkPage({ fileNo, pageNo, bytes: new Uint8Array(await file.arrayBuffer()), childId: childIds.length ? (childIds[at] as string) : null });
      if (!checked.ok) return markingRefusal(checked.reason, { at });
      pages.push(checked.page);
    }
    return pages;
  };
  return appRouteAfter(req, read, async ({ claims, db, prepared }) => {
    const r = await addPages(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, supabaseFileStorage, params.uploadId, prepared);
    if (!r.ok) return markingRefusal(r.reason, r.why === undefined ? {} : { why: r.why });
    return NextResponse.json({ pages: r.pages });
  });
}
