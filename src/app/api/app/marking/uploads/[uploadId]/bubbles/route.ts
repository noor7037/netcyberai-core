import { NextRequest, NextResponse } from 'next/server';
import { bubbleRefusal } from '@/lib/bubbles/http';
import { readingShape } from '@/lib/bubbles/reading';
import { addBubblePages, type BubblePage } from '@/lib/bubbles/server';
import { PAGE_MAX_BYTES, PAGES_PER_REQUEST, REQUEST_MAX_BYTES } from '@/lib/contracts/marking';
import { EXAM_READERS } from '@/lib/exams/exams';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRouteAfter } from '@/lib/frameworks/route';
import { checkPage, isFileNo, isPageNo } from '@/lib/marking/upload';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// Bubble sheets (C364): the pages of an open bubble upload, each with what the teacher's browser read on it.
//   POST multipart: for each page, in order, the fields fileNo, pageNo, reading (the reading as JSON) and page (the
//        straightened sheet as a JPEG); at most PAGES_PER_REQUEST pages → { pages: [{ fileNo, pageNo, pageId, outcome,
//        sheetNo, child, flagged }] }
// Every picture and every reading's shape is checked before a connection is taken; each reading is checked against the
// paper's sheet, and the child resolved, in the transaction (src/lib/bubbles/server.ts). A page sent again answers as it
// did. No AI reads anything here, and no page counts against the month's AI pages.
export const dynamic = 'force-dynamic';

const DIGITS = /^\d{1,4}$/;

export async function POST(req: NextRequest, { params }: { params: { uploadId: string } }) {
  const read = async (claims: { role: string }): Promise<BubblePage[] | NextResponse> => {
    if (!(EXAM_READERS as readonly string[]).includes(claims.role)) return bubbleRefusal('not_allowed');
    if (!isUuid(params.uploadId)) return bubbleRefusal('not_found');
    const declared = Number(req.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > REQUEST_MAX_BYTES + 64 * 1024) return bubbleRefusal('too_large');
    const form = await req.formData().catch(() => null);
    if (!form) return bubbleRefusal('not_sent_properly');
    const files = form.getAll('page');
    const fileNos = form.getAll('fileNo');
    const pageNos = form.getAll('pageNo');
    const readings = form.getAll('reading');
    if (files.length < 1 || files.length > PAGES_PER_REQUEST || fileNos.length !== files.length || pageNos.length !== files.length || readings.length !== files.length) return bubbleRefusal('not_sent_properly');
    if (files.reduce((n, f) => n + (typeof f === 'string' ? 0 : f.size), 0) > REQUEST_MAX_BYTES) return bubbleRefusal('too_large');
    const pages: BubblePage[] = [];
    const seen = new Set<string>();
    for (let at = 0; at < files.length; at++) {
      const file = files[at];
      const fileNo = typeof fileNos[at] === 'string' && DIGITS.test(fileNos[at] as string) ? Number(fileNos[at]) : NaN;
      const pageNo = typeof pageNos[at] === 'string' && DIGITS.test(pageNos[at] as string) ? Number(pageNos[at]) : NaN;
      if (typeof file === 'string' || !isFileNo(fileNo) || !isPageNo(pageNo) || seen.has(`${fileNo}:${pageNo}`)) return bubbleRefusal('not_sent_properly', { at });
      seen.add(`${fileNo}:${pageNo}`);
      const shape = readingShape(readings[at]);
      if (!shape.ok) return bubbleRefusal('reading', { at, field: shape.field });
      if (file.size > PAGE_MAX_BYTES) return bubbleRefusal('too_large', { at });
      const checked = checkPage({ fileNo, pageNo, bytes: new Uint8Array(await file.arrayBuffer()) });
      if (!checked.ok) return bubbleRefusal(checked.reason, { at });
      pages.push({ ...checked.page, reading: shape.raw });
    }
    return pages;
  };
  return appRouteAfter(req, read, async ({ claims, db, prepared }) => {
    const r = await addBubblePages(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, supabaseFileStorage, params.uploadId, prepared);
    if (!r.ok) return bubbleRefusal(r.reason, { ...(r.at === undefined ? {} : { at: r.at }), ...(r.field === undefined ? {} : { field: r.field }) });
    return NextResponse.json({ pages: r.pages });
  });
}
