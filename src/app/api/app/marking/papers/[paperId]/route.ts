import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { actorOf, mayRead } from '@/lib/marking/http';
import { markingOverview } from '@/lib/marking/review';

// A paper's AI marking at a glance (C347): whether AI marking is on and why not, the questions' structure, the
// uploads, the pages read, the scripts in roll order with their flags and totals, and the candidates with no script.
//   GET   everyone who reads the paper's exam (the office, the coordinator, the teacher of the class)
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.paperId)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const data = await markingOverview(db, actorOf(claims), params.paperId);
    if (!data) return ruleError(404, 'not_found');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  });
}
