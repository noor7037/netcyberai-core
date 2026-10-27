import { NextRequest, NextResponse } from 'next/server';
import { bubbleRefusal } from '@/lib/bubbles/http';
import { putReadOn, sheetBubbles } from '@/lib/bubbles/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { actorOf, mayRead } from '@/lib/marking/http';

// One script's bubble sheet (C364), for the review screen.
//   GET   { source, view, pending }: the read sheet (its picture, each choice question's shaded options, the key, and where
//         its bubbles are on the picture), or none; `pending`: the child's sheet is read but not yet on this script
//   POST  { action: 'put_on' }  puts the child's read sheet on this answer-book script now
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { sheetId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.sheetId)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const detail = await sheetBubbles(db, actorOf(claims), params.sheetId);
    if (!detail) return ruleError(404, 'not_found');
    return NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest, { params }: { params: { sheetId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.sheetId) || b.action !== 'put_on') return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const r = await putReadOn(db, actorOf(claims), params.sheetId);
    return r.ok ? NextResponse.json({ ok: true }) : bubbleRefusal(r.reason);
  });
}
