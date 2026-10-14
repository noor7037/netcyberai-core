import { NextRequest, NextResponse } from 'next/server';
import { EXAM_READERS } from '@/lib/exams/exams';
import { paperEntry, saveMarks } from '@/lib/exams/marks';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';

// One paper's marks (docs/27 row 9b, C214).
//   GET   the paper, its class's roll in roll order with each child's marks, and the syllabus map for its chapters
//   POST  { marks: [{ studentId, component, kind: 'score' | 'absent' | 'exempt' | 'clear', score | null }] }
//         save: whoever may enter this paper's marks (the database's may_enter_marks)
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.paperId)) return ruleError(400, 'not_sent_properly');
    if (!EXAM_READERS.includes(claims.role)) return ruleError(403, 'not_allowed');
    const data = await paperEntry(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.paperId);
    if (!data) return ruleError(404, 'not_found');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.paperId) || !Array.isArray(b.marks)) return ruleError(400, 'not_sent_properly');
    const r = await saveMarks(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.paperId, b.marks);
    if (r.ok) return NextResponse.json(r);
    if (r.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (r.reason === 'not_found') return ruleError(404, 'not_found');
    return jsonError(r.reason === 'closed' ? 409 : 400, 'the marks were not saved', { code: r.reason, ...(r.at === undefined ? {} : { at: r.at }) });
  });
}
