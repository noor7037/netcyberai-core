import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { actorOf, mayRead, refusal } from '@/lib/marking/http';
import { closeTest, onlineTestScreen, openTest, saveTest, setSitting, voidAttempt } from '@/lib/online/tests';

// A paper's online test (AQ-4, C365), on its marking hub.
//   GET   the test, how the paper is sat, and the class's attempts in roll order (no score, no rank): everyone who
//         reads the paper's exam (the office, the coordinator, the class's teacher)
//   POST  { action: 'sitting', sitting: 'online' | 'written' }
//         { action: 'save', opensAt, closesAt, minutes, shuffle }   India's date and time, "2026-10-28T10:00"
//         { action: 'open' } | { action: 'close' } | { action: 'void', studentId }
//         by whoever may mark the paper; answers the screen again, or the refusal's code
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.paperId)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const screen = await onlineTestScreen(db, actorOf(claims), params.paperId);
    if (!screen) return ruleError(404, 'not_found');
    return NextResponse.json(screen, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.paperId) || typeof b.action !== 'string') return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const actor = actorOf(claims);
    const r =
      b.action === 'sitting'
        ? await setSitting(db, actor, params.paperId, b.sitting)
        : b.action === 'save'
          ? await saveTest(db, actor, params.paperId, b)
          : b.action === 'open'
            ? await openTest(db, actor, params.paperId)
            : b.action === 'close'
              ? await closeTest(db, actor, params.paperId)
              : b.action === 'void'
                ? await voidAttempt(db, actor, params.paperId, b.studentId)
                : null;
    if (!r) return ruleError(400, 'not_sent_properly');
    if (!r.ok) return refusal(r.reason);
    const screen = await onlineTestScreen(db, actor, params.paperId);
    return NextResponse.json(screen, { headers: { 'Cache-Control': 'no-store' } });
  });
}
