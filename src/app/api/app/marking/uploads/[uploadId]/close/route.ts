import { NextRequest, NextResponse } from 'next/server';
import { EXAM_READERS } from '@/lib/exams/exams';
import { appRoute } from '@/lib/frameworks/route';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { markingRefusal } from '@/lib/marking/http';
import { closeUpload } from '@/lib/marking/upload';

// AI marking (C347): no more pages for this upload.
//   POST → { closed: true, runs }  the upload is closed and its pages queued for reading, PAGES_PER_READ a job
// (src/lib/marking/queue.ts); closing again queues nothing new. While AI marking is off for the school the upload stays
// open (code 'ai_off'), to be closed once it is on.
// The reading jobs are not kicked from here: each waits up to a minute and a half for the AI, which no request should
// hold, so the job sweeper starts them within the minute, one a run (src/lib/jobs/runner.ts, LONG_JOB_TYPES).
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { uploadId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!EXAM_READERS.includes(claims.role)) return markingRefusal('not_allowed');
    const r = await closeUpload(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, jobQueue, params.uploadId);
    if (!r.ok) return markingRefusal(r.reason, r.why === undefined ? {} : { why: r.why });
    return NextResponse.json({ closed: true, runs: r.runs });
  });
}
