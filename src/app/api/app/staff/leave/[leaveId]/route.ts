import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { planHasFeature } from '@/lib/frameworks/plans';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { decideLeave, withdrawLeave } from '@/lib/staff/leave';

// POST { action: 'approve' | 'refuse' | 'withdraw', note? }: a step on one leave request (C201).
//   approve, refuse   the principal or the school admin, never on their own request; refusing needs a note
//   withdraw          the person, while it waits or before the first day; the office, approved leave, with a note.
//                     Withdrawing approved leave releases its covers from today on, in the same transaction and in
//                     the caller's name (C210): the answer carries `coversReleased`, how many, so the screen can say
//                     that their teachers are told on My Day.
export async function POST(req: NextRequest, { params }: { params: { leaveId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await planHasFeature(db, claims.schoolId, 'staff-leave'))) return ruleError(403, 'not_allowed'); // a part of the plan (C212)
    const b = await readJson(req);
    if (!b || !isUuid(params.leaveId)) return ruleError(400, 'not_sent_properly');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const note = b.note === undefined ? '' : typeof b.note === 'string' && b.note.length <= 2000 ? b.note : null;
    const done =
      note === null ? null
      : b.action === 'approve' || b.action === 'refuse' ? await decideLeave(db, actor, params.leaveId, b.action, note)
      : b.action === 'withdraw' ? await withdrawLeave(db, actor, params.leaveId, note)
      : null;
    if (!done) return ruleError(400, 'not_sent_properly');
    if (done.ok) return NextResponse.json('coversReleased' in done ? { ok: true, coversReleased: done.coversReleased } : { ok: true });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return done.reason === 'not_found' ? ruleError(404, 'not_found') : jsonError(409, 'that was not done', { code: done.reason });
  });
}
