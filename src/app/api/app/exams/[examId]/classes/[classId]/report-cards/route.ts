import { NextRequest, NextResponse } from 'next/server';
import { saveCoScholastic } from '@/lib/exams/co-scholastic';
import { publishClass, reopenClass, reportCardsScreen, saveRemarks } from '@/lib/exams/publish';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';

// Publishing an exam for a class, and its report cards (docs/27 row 9c, C215).
//   GET   the class's papers and whether each is entered, the publication in force and every earlier one, the
//         children in roll order with their remarks, and what this person may do here
//   POST  { action: 'publish' }                         the principal, the school admin, the academic coordinator
//         { action: 'reopen', reason }                  the principal only
//         { action: 'remarks', remarks: [{ studentId, remark }] }   the class teacher only, while not published
//         { action: 'co_scholastic', grades: [{ studentId, area, grade }] }   the class teacher or the office, while not
//                                                                           published (C219; an empty grade clears it)
export const dynamic = 'force-dynamic';

type Params = { params: { examId: string; classId: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.examId) || !isUuid(params.classId)) return ruleError(400, 'not_sent_properly');
    if (claims.role === 'accountant') return ruleError(403, 'not_allowed');
    const data = await reportCardsScreen(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.examId, params.classId);
    if (!data) return ruleError(404, 'not_found');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  });
}

const STATUS: Partial<Record<string, number>> = { not_found: 404, published: 409, not_published: 409, not_entered: 409, no_scheme: 409, scripts_changed: 409, no_co_scholastic: 409 };

export async function POST(req: NextRequest, { params }: Params) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.examId) || !isUuid(params.classId)) return ruleError(400, 'not_sent_properly');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const r =
      b.action === 'publish' ? await publishClass(db, actor, params.examId, params.classId)
      : b.action === 'reopen' ? await reopenClass(db, actor, params.examId, params.classId, b.reason)
      : b.action === 'remarks' ? await saveRemarks(db, actor, params.examId, params.classId, b.remarks)
      : b.action === 'co_scholastic' ? await saveCoScholastic(db, actor, params.examId, params.classId, b.grades)
      : null;
    if (!r) return ruleError(400, 'not_sent_properly');
    if (r.ok) return NextResponse.json(r);
    if (r.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(STATUS[r.reason] ?? 400, 'it was not saved', { code: r.reason, ...(r.at === undefined ? {} : { at: r.at }) });
  });
}
