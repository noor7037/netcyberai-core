import { NextRequest, NextResponse } from 'next/server';
import { FEES_PARTS } from '@/lib/fees/page-data';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { closeFollowUp, followUpList, recordFollowUp, recordRefund, refundList } from '@/lib/fees/recovery';
import { FINANCE } from '@/lib/fees/structures';

// Fee recovery (docs/23 6g, C178).
//   GET   the follow-up list and the refund list
//   POST  { action: 'call' | 'promise' | 'hardship', studentId, note, promiseDate?, percentOff? }
//         { action: 'close', followupId, note }
//         { action: 'refunded', evidenceId, how, refundedOn }
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!FINANCE.includes(claims.role)) return ruleError(403, 'not_allowed');
    return NextResponse.json(await FEES_PARTS.recovery(db, { schoolId: claims.schoolId, role: claims.role }));
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const text = (v: unknown) => (typeof v === 'string' && v.length <= 400 ? v : '');
    const answer = (r: { ok: true } | { ok: false; reason: string }, extra: Record<string, unknown> = {}) =>
      r.ok ? NextResponse.json({ ok: true, ...extra }) : r.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(r.reason === 'not_found' || r.reason === 'unknown_student' ? 404 : r.reason === 'already_open' || r.reason === 'already_recorded' ? 409 : 400, 'not recorded', { code: r.reason });
    if (body?.action === 'close') {
      if (!isUuid(body.followupId)) return ruleError(400, 'not_sent_properly');
      return answer(await closeFollowUp(db, actor, body.followupId as string, text(body.note)));
    }
    if (body?.action === 'refunded') {
      if (!isUuid(body.evidenceId)) return ruleError(400, 'not_sent_properly');
      return answer(await recordRefund(db, actor, body.evidenceId as string, text(body.how), text(body.refundedOn)));
    }
    if (!isUuid(body?.studentId)) return ruleError(400, 'not_sent_properly');
    const studentId = body.studentId as string;
    if (body.action === 'call') return answer(await recordFollowUp(db, actor, { kind: 'call', studentId, note: text(body.note) }));
    if (body.action === 'promise') return answer(await recordFollowUp(db, actor, { kind: 'promise', studentId, note: text(body.note), promiseDate: text(body.promiseDate) }));
    if (body.action === 'hardship') {
      const made = await recordFollowUp(db, actor, { kind: 'hardship', studentId, note: text(body.note), percentOff: typeof body.percentOff === 'number' ? body.percentOff : NaN });
      return answer(made, { proposed: made.ok ? made.proposed : 0 });
    }
    return ruleError(400, 'not_sent_properly');
  });
}
