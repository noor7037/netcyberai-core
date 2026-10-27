import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { actorOf, mayRead, refusal } from '@/lib/marking/http';
import { changeSheet, chooseChild, setAside, sheetDetail } from '@/lib/marking/review';

// One script (C347): its pages, its questions with the AI's marks and the teacher's, its totals per part.
//   GET   the script
//   POST  { action: 'change', questions?: [{ questionId, marks?, note?, errorType? }], strengths?, improve?, practice? }
//         the teacher's changes (marks to a tenth within the question; null gives the AI's mark back)
//   POST  { action: 'child', studentId | null }   whose script it is, chosen by the teacher
//   POST  { action: 'aside' }                     a script that is not one (kept, never deleted)
//   POST  { action: 'restore' }                   a script set aside, put back
// Approving is the paper's route (.../papers/[paperId]/approve); marking again is .../sheets/[sheetId]/mark-again.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { sheetId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.sheetId)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const data = await sheetDetail(db, actorOf(claims), params.sheetId);
    if (!data) return ruleError(404, 'not_found');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  });
}

const ACTIONS = ['change', 'child', 'aside', 'restore'];

export async function POST(req: NextRequest, { params }: { params: { sheetId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.sheetId) || typeof b.action !== 'string' || !ACTIONS.includes(b.action)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    if (b.action === 'child' && b.studentId !== null && typeof b.studentId !== 'string') return ruleError(400, 'not_sent_properly');
    const actor = actorOf(claims);
    const r =
      b.action === 'change'
        ? await changeSheet(db, actor, params.sheetId, b)
        : b.action === 'child'
          ? await chooseChild(db, actor, params.sheetId, b.studentId)
          : await setAside(db, actor, params.sheetId, b.action === 'aside');
    if (r.ok) return NextResponse.json({ ok: true });
    return refusal(r.reason, 'questionId' in r && r.questionId ? { questionId: r.questionId } : {});
  });
}
