import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { setRteTag } from '@/lib/fees/concessions';

// POST: set or remove a student's RTE tag (D4, tagging only; C159). The principal or the school admin.
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    if (!isUuid(body?.studentId) || typeof body?.rte !== 'boolean') return ruleError(400, 'not_sent_properly');
    const result = await setRteTag(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { studentId: body.studentId as string, rte: body.rte, entryClass: typeof body.entryClass === 'string' ? body.entryClass : null, admittedOn: typeof body.admittedOn === 'string' ? body.admittedOn : null });
    if (result.ok) return NextResponse.json({ ok: true });
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(result.reason === 'unknown_student' ? 404 : 400, 'the RTE tag was not saved', { code: result.reason });
  });
}
