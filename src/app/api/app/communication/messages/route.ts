import { NextRequest, NextResponse } from 'next/server';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { readRange } from '@/lib/insights/screens';
import { listMessages } from '@/lib/whatsapp/delivery';

// GET ?state=: the school's WhatsApp messages of the last 14 days and where each got to (docs/25 slice 7b, C183).
// With ?from=&to= (India's dates, C203): the messages written on those days, which is how a dashboard number
// opens exactly its rows. Dates that are not a real range are ignored and the last 14 days are answered.
// The office's list: the principal and the school admin. A teacher's own classes come with class notices (7i).
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (claims.role !== 'principal' && claims.role !== 'school_admin') return ruleError(403, 'not_allowed');
    return NextResponse.json(await listMessages(db, claims.schoolId, req.nextUrl.searchParams.get('state'), readRange(req.nextUrl.searchParams) ?? undefined), { headers: { 'Cache-Control': 'no-store' } });
  });
}
