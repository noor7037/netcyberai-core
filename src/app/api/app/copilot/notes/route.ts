import { NextRequest, NextResponse } from 'next/server';
import { MAX_NOTE_BODY, approveNote, listNotes } from '@/lib/copilot/copilot';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';

// Lesson plans and worksheets a teacher approved (C154).
//   GET   the saved ones the caller may see
//   POST  approve and save the words as the teacher left them
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => NextResponse.json({ notes: await listNotes(db, claims.schoolId) }));
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    const kind = body?.kind === 'lesson_plan' || body?.kind === 'worksheet' ? body.kind : null;
    if (!kind || !isUuid(body?.classId) || !isUuid(body?.subjectId) || !isUuid(body?.unitId) || typeof body?.body !== 'string' || body.body.length > MAX_NOTE_BODY * 2) return ruleError(400, 'not_sent_properly');
    const result = await approveNote(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { kind, classId: body.classId as string, subjectId: body.subjectId as string, unitId: body.unitId as string, body: body.body });
    if (result.ok) return NextResponse.json({ noteId: result.noteId }, { status: 201 });
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(result.reason === 'unknown_topic' ? 404 : 400, 'the draft was not saved', { code: result.reason });
  });
}
