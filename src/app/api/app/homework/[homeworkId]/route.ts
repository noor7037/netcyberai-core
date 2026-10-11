import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { editHomework, parseHomeworkText } from '@/lib/homework/homework';
import { indiaDate } from '@/lib/time/india';

// PATCH: change the original. A copy already given to a section changes
// only if it is named in `applyTo` (C150).
export async function PATCH(req: NextRequest, { params }: { params: { homeworkId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    const text = parseHomeworkText(body, indiaDate());
    if (!text.ok) return jsonError(400, 'the homework needs a title and a due date from today', { code: text.reason });
    const applyTo = Array.isArray(body?.applyTo) ? (body.applyTo as unknown[]) : [];
    if (!isUuid(params.homeworkId) || applyTo.length > 50 || !applyTo.every(isUuid)) return ruleError(400, 'not_sent_properly');
    const result = await editHomework(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.homeworkId, { ...text.value, applyTo: applyTo as string[] });
    if (result.ok) return NextResponse.json(result);
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(result.reason === 'not_found' ? 404 : 400, 'the homework was not changed', { code: result.reason });
  });
}
