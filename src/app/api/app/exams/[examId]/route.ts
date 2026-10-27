import { NextRequest, NextResponse } from 'next/server';
import { changeExam } from '@/lib/exams/exams';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';

// One exam (docs/27 row 9b, C214), changed by the principal, the school admin or the academic coordinator:
//   POST { action: 'type', examType }                          the exam's type (C230-AJ part 2), until a class is published
//   POST { action: 'add_paper', paper: { classId, subjectId, date | null, unitIds, maxima } }
//   POST { action: 'paper', paperId, date | null, unitIds }   a paper's date and chapters
//   POST { action: 'remove_paper', paperId }                   only while it has no marks
//   POST { action: 'remove' }                                  the exam, only while it has no marks
export const dynamic = 'force-dynamic';

const ACTIONS = ['type', 'add_paper', 'paper', 'remove_paper', 'remove'];

export async function POST(req: NextRequest, { params }: { params: { examId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.examId) || !ACTIONS.includes(b.action as string)) return ruleError(400, 'not_sent_properly');
    const r = await changeExam(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.examId, b);
    if (r.ok) return NextResponse.json({ ok: true, ...(r.paperId ? { paperId: r.paperId } : {}) });
    if (r.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (r.reason === 'not_found') return ruleError(404, 'not_found');
    return jsonError(r.reason === 'has_marks' || r.reason === 'paper_twice' ? 409 : 400, 'the exam was not changed', { code: r.reason });
  });
}
