import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { actorOf, mayRead, refusal } from '@/lib/marking/http';
import { approveSheets } from '@/lib/marking/review';

// Approval writes the paper's marks (C347), through the same code as typed marks, in the teacher's own name.
//   POST { sheetIds: [uuid, ...] }       the named scripts, each looked at by the teacher (a flagged one only on its own)
//   POST { all: 'unflagged' }            every marked script of a child with no flag
// Answers { ok, approved, skipped }. A published class refuses (409); so does a script still flagged, and a paper whose
// questions do not add up.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.paperId)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    let which: readonly string[] | 'unflagged';
    if (b.all === 'unflagged') which = 'unflagged';
    else if (Array.isArray(b.sheetIds) && b.sheetIds.every((id) => typeof id === 'string' && isUuid(id))) which = b.sheetIds as string[];
    else return ruleError(400, 'not_sent_properly');
    const r = await approveSheets(db, actorOf(claims), params.paperId, which);
    if (r.ok) return NextResponse.json(r);
    return refusal(r.reason, r.sheetId ? { sheetId: r.sheetId } : {});
  });
}
