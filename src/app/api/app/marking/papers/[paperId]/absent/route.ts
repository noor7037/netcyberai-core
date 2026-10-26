import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { actorOf, mayRead, refusal } from '@/lib/marking/http';
import { markAbsent } from '@/lib/marking/review';

// Candidates with no script, marked absent for every part the script marks (C347). Absent is not zero.
//   POST { studentIds: [uuid, ...] }   answers { ok, approved } (the number marked absent)
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.paperId) || !Array.isArray(b.studentIds)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const r = await markAbsent(db, actorOf(claims), params.paperId, b.studentIds);
    if (r.ok) return NextResponse.json({ ok: true, absent: r.approved });
    return refusal(r.reason);
  });
}
