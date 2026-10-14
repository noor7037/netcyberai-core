import { NextRequest, NextResponse } from 'next/server';
import { isModuleEnabled } from '@/lib/contracts/entitlements';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { coversLeftFor } from '@/lib/proxy/proxy';
import { decideLeave, withdrawLeave } from '@/lib/staff/leave';

// POST { action: 'approve' | 'refuse' | 'withdraw', note? }: a step on one leave request (C201).
//   approve, refuse   the principal or the school admin, never on their own request; refusing needs a note
//   withdraw          the person, while it waits or before the first day; the office, approved leave, with a note.
//                     Withdrawing leave undoes no cover (a person undoes a cover, on Proxy Auto, C202): the answer
//                     carries `coversLeft`, how many covers still stand for those days from today on, so the
//                     office's screen can say so. Counted in the caller's own session, while Proxy Auto is on.
export async function POST(req: NextRequest, { params }: { params: { leaveId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
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
    if (done.ok && b.action === 'withdraw') {
      const proxyOn = isModuleEnabled(await loadEntitlements(db, claims.schoolId), 'proxy');
      return NextResponse.json({ ok: true, coversLeft: proxyOn ? await coversLeftFor(db, claims.schoolId, params.leaveId) : 0 });
    }
    if (done.ok) return NextResponse.json({ ok: true });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return done.reason === 'not_found' ? ruleError(404, 'not_found') : jsonError(409, 'that was not done', { code: done.reason });
  });
}
