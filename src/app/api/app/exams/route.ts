import { NextRequest, NextResponse } from 'next/server';
import { examsScreen, makeExam } from '@/lib/exams/exams';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';

// Exams (docs/27 row 9b, C214).
//   GET   ?session=<id>|none  the exams of a session with their papers and entry progress, the papers this person
//         may enter, and (the office, the coordinator) the classes, subjects and scheme to make one
//   POST  { name, sessionId | null, term | null, papers: [{ classId, subjectId, date | null, unitIds, maxima }] }
//         make an exam with its papers (principal, school admin, academic coordinator)
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const asked = req.nextUrl.searchParams.get('session');
    const data = await examsScreen(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, asked === 'none' || isUuid(asked) ? asked : null);
    if (!data) return ruleError(403, 'not_allowed');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b) return ruleError(400, 'not_sent_properly');
    const r = await makeExam(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, b);
    if (r.ok) return NextResponse.json({ ok: true, examId: r.examId }, { status: 201 });
    if (r.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(r.reason === 'name_taken' ? 409 : 400, 'the exam was not made', { code: r.reason, ...(r.at === undefined ? {} : { at: r.at }) });
  });
}
