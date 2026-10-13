import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { PTM_ROLES, bookSlot, cancelPtm, invitePtm, markAttendance, ptmDetail } from '@/lib/ptm/ptm';

// One parent-teacher meeting (C193).
//   GET   its teachers, slots and bookings (a teacher: their own)
//   POST  { action: 'invite' } | { action: 'cancel' }                      the office
//         { action: 'book', slotId, parentId }                             a parent who phoned or came by
//         { action: 'attend', bookingId, attended, note }                  after the meeting has begun
export async function GET(req: NextRequest, { params }: { params: { ptmId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!PTM_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    const detail = isUuid(params.ptmId) ? await ptmDetail(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.ptmId) : null;
    return detail ? NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } }) : ruleError(404, 'not_found');
  });
}

export async function POST(req: NextRequest, { params }: { params: { ptmId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.ptmId)) return ruleError(400, 'not_sent_properly');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    let done: { ok: true } | { ok: false; reason: string };
    let said: Record<string, unknown> = {};
    if (b.action === 'invite') {
      const r = await invitePtm(db, jobQueue, actor, params.ptmId);
      if (r.ok) said = { queued: r.queued, held: r.held, withoutNumber: r.withoutNumber };
      done = r;
    } else if (b.action === 'cancel') {
      const r = await cancelPtm(db, jobQueue, actor, params.ptmId);
      if (r.ok) said = { told: r.told };
      done = r;
    } else if (b.action === 'book' && isUuid(b.slotId) && isUuid(b.parentId)) {
      const r = await bookSlot(db, actor, { slotId: b.slotId as string, parentId: b.parentId as string });
      if (r.ok) said = { moved: r.moved };
      done = r;
    } else if (b.action === 'attend' && isUuid(b.bookingId) && typeof b.attended === 'boolean' && typeof b.note === 'string' && b.note.length <= 600) {
      done = await markAttendance(db, actor, { bookingId: b.bookingId as string, attended: b.attended, note: b.note });
    } else return ruleError(400, 'not_sent_properly');
    if (done.ok) return NextResponse.json(said);
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return done.reason === 'not_found' ? ruleError(404, 'not_found') : jsonError(409, 'that was not done', { code: done.reason });
  });
}
