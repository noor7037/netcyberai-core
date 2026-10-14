import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { closeRequest, correctRecord, noteAnswer } from '@/lib/students/data-check';

// One request of the student data check (C222), for the office:
//   POST { action: 'note', text }      the guardian's answer, when it came another way (kept once)
//   POST { action: 'correct', value }  the school record is corrected (audited) and the request says to what
//   POST { action: 'close', text }     closed without a change, with why
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { requestId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.requestId)) return ruleError(400, 'not_sent_properly');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const text = typeof b.text === 'string' && b.text.length <= 2000 ? b.text : null;
    const value = typeof b.value === 'string' && b.value.length <= 200 ? b.value : null;
    const done =
      b.action === 'note' && text !== null ? await noteAnswer(db, actor, params.requestId, text)
      : b.action === 'correct' && value !== null ? await correctRecord(db, actor, params.requestId, value)
      : b.action === 'close' && text !== null ? await closeRequest(db, actor, params.requestId, text)
      : null;
    if (!done) return ruleError(400, 'not_sent_properly');
    if (done.ok) return NextResponse.json({ done: true });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (done.reason === 'not_found') return ruleError(404, 'not_found');
    return jsonError(done.reason === 'aadhaar_number' || done.reason === 'value' ? 400 : 409, 'that was not done', { code: done.reason });
  });
}
