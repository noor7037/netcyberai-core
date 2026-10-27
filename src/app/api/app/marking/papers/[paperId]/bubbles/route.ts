import { NextRequest, NextResponse } from 'next/server';
import { bubbleRefusal } from '@/lib/bubbles/http';
import { bubbleScreen, markReadsAgain, printSheets, setSitting, setWrongMarks, settleRead } from '@/lib/bubbles/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { actorOf, mayRead } from '@/lib/marking/http';
import { startBubbleUpload } from '@/lib/marking/upload';

// A paper's bubble (OMR) sheets (docs/36 §1.2, C364).
//   GET   how the paper is sat, the questions on the sheet, the sheets printed, the sheets read, and a mixed paper's read
//         sheets that name no child yet
//   POST  { action: 'sitting', sitting: 'written' | 'bubble' }
//         { action: 'wrong_marks', wrongMarks }              0 to 10, one decimal; every read sheet is marked again
//         { action: 'print', blanks }                        numbers the candidates' sheets (and blanks) → { print }
//         { action: 'again' }                                every read sheet marked again by today's key
//         { action: 'upload', mode: 'per_file' | 'combined', files }  starts a bubble upload → 201 { uploadId }
//         { action: 'read', readId, do: 'child' | 'aside' | 'unmatch', studentId? }  settles a mixed paper's read sheet
// Whoever may enter the paper's marks, while its class is not published (the database holds it too). No AI anywhere.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.paperId)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const screen = await bubbleScreen(db, actorOf(claims), params.paperId);
    if (!screen) return ruleError(404, 'not_found');
    return NextResponse.json(screen, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.paperId)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const actor = actorOf(claims);
    switch (b.action) {
      case 'sitting': {
        const r = await setSitting(db, actor, params.paperId, b.sitting);
        return r.ok ? NextResponse.json({ ok: true }) : bubbleRefusal(r.reason);
      }
      case 'wrong_marks': {
        const r = await setWrongMarks(db, actor, params.paperId, b.wrongMarks);
        return r.ok ? NextResponse.json({ ok: true, remarked: r.remarked }) : bubbleRefusal(r.reason);
      }
      case 'print': {
        const r = await printSheets(db, actor, params.paperId, b.blanks);
        return r.ok ? NextResponse.json({ ok: true, print: r.print }, { headers: { 'Cache-Control': 'no-store' } }) : bubbleRefusal(r.reason);
      }
      case 'again':
        return NextResponse.json({ ok: true, remarked: await markReadsAgain(db, actor, params.paperId) });
      case 'upload': {
        const r = await startBubbleUpload(db, actor, params.paperId, { mode: b.mode, files: b.files });
        if (r.ok) return NextResponse.json({ uploadId: r.uploadId }, { status: 201 });
        return r.reason === 'ai_off' || r.reason === 'limit' ? bubbleRefusal('state') : bubbleRefusal(r.reason);
      }
      case 'read': {
        const r = await settleRead(db, actor, b.readId, b.do, b.studentId);
        return r.ok ? NextResponse.json({ ok: true }) : bubbleRefusal(r.reason);
      }
      default:
        return ruleError(400, 'not_sent_properly');
    }
  });
}
