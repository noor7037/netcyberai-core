import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { askParent, draftRequest, savePrinted } from '@/lib/students/data-check';
import { isDataCheckField } from '@/lib/students/data-check-rules';

// One child of the student data check (C222), for the office:
//   POST { action: 'printed', name, dob, gender }   what Aadhaar prints, typed by the school (never the number)
//   POST { action: 'draft', parentId, fields }       the exact words the guardian would read; nothing is sent or kept
//   POST { action: 'ask', parentId, fields }         the requests are kept and the message goes through the send-gate
export const dynamic = 'force-dynamic';

const VALIDATION = ['aadhaar_number', 'name', 'dob', 'gender', 'empty', 'fields'];

export async function POST(req: NextRequest, { params }: { params: { studentId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.studentId)) return ruleError(400, 'not_sent_properly');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const text = (v: unknown) => (typeof v === 'string' && v.length <= 200 ? v : null);
    const ask = isUuid(b.parentId) && Array.isArray(b.fields) && b.fields.length <= 3 && b.fields.every(isDataCheckField) ? { parentId: b.parentId as string, fields: b.fields } : null;
    let done;
    if (b.action === 'printed') {
      const [name, dob, gender] = [text(b.name), text(b.dob), text(b.gender)];
      if (name === null || dob === null || gender === null) return ruleError(400, 'not_sent_properly');
      done = await savePrinted(db, actor, params.studentId, { name, dob, gender });
    } else if (b.action === 'draft' && ask) {
      done = await draftRequest(db, actor, params.studentId, ask);
    } else if (b.action === 'ask' && ask) {
      done = await askParent(db, jobQueue, actor, params.studentId, ask);
    } else {
      return ruleError(400, 'not_sent_properly');
    }
    if (done.ok) {
      const { ok: _, ...rest } = done;
      return NextResponse.json(rest, { status: b.action === 'ask' ? 201 : 200 });
    }
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (done.reason === 'not_found') return ruleError(404, 'not_found');
    return jsonError(VALIDATION.includes(done.reason) ? 400 : 409, 'that was not done', { code: done.reason });
  });
}
