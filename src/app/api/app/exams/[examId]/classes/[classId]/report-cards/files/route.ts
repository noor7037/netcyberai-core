import { NextRequest, NextResponse } from 'next/server';
import { makeReportCardFiles, reportCardFiles, type FilesProblem } from '@/lib/exams/report-card-files';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { kickJobs } from '@/lib/jobs/handlers';
import { jobQueue } from '@/lib/jobs/pg-queue';

// Each child's report card made as a file when the class is published (W14-F).
//   GET                    how far it got: ready, still being made, failed, not queued, of the children on the roll
//   POST { action: 'make' }   queues every child not queued for this version and runs the failed ones again (the
//                             office); they start at once after the commit
// The office and the class teacher read it; the office makes them. Only while the result is published.
export const dynamic = 'force-dynamic';

type Params = { params: { examId: string; classId: string } };

const refused = (reason: FilesProblem) =>
  reason === 'not_allowed' ? ruleError(403, 'not_allowed') : reason === 'not_found' ? ruleError(404, 'not_found') : NextResponse.json({ error: 'not_published', code: 'not_published' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: NextRequest, { params }: Params) {
  return appRoute(req, async ({ claims, db }) => {
    const r = await reportCardFiles(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.examId, params.classId);
    if (typeof r === 'string') return refused(r);
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  let kick: string[] = [];
  const res = await appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || b.action !== 'make') return ruleError(400, 'not_sent_properly');
    const r = await makeReportCardFiles(db, jobQueue, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.examId, params.classId);
    if (!r.ok) return refused(r.reason);
    kick = r.jobKeys;
    return NextResponse.json({ ok: true, retried: r.retried }, { headers: { 'Cache-Control': 'no-store' } });
  });
  if (kick.length) await kickJobs(kick);
  return res;
}
