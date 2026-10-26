import { NextRequest, NextResponse } from 'next/server';
import { EXAM_READERS } from '@/lib/exams/exams';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, readJson } from '@/lib/frameworks/route';
import { markingRefusal } from '@/lib/marking/http';
import { startUpload } from '@/lib/marking/upload';

// AI marking (C347, C350): start an upload of a paper's answer sheets.
//   POST { mode: 'per_file' | 'combined', files }  → 201 { uploadId }
// Whoever may enter the paper's marks, while its class is not published, once its questions make up the paper, with
// AI marking on for the school (the plan's monthly pages, the school's switch, Control's two tasks) and pages left
// this month. A refusal says which, as a code (src/lib/marking/http.ts).
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!EXAM_READERS.includes(claims.role)) return markingRefusal('not_allowed');
    const body = await readJson(req);
    if (!body || !isUuid(params.paperId)) return markingRefusal('not_sent_properly');
    const r = await startUpload(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.paperId, body);
    if (!r.ok) return markingRefusal(r.reason, r.why === undefined ? {} : { why: r.why });
    return NextResponse.json({ uploadId: r.uploadId }, { status: 201 });
  });
}
