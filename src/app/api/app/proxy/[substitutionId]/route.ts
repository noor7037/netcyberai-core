import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { undoCover } from '@/lib/proxy/proxy';

// POST { action: 'undo' }: one person takes a cover back (C202). The principal, the school admin or the academic
// coordinator, in their own name. The row stays, marked undone, and the period can be assigned again.
export async function POST(req: NextRequest, { params }: { params: { substitutionId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || b.action !== 'undo' || !isUuid(params.substitutionId)) return ruleError(400, 'not_sent_properly');
    const done = await undoCover(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.substitutionId);
    if (done.ok) return NextResponse.json({ ok: true });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return done.reason === 'not_found' ? ruleError(404, 'not_found') : jsonError(409, 'the cover was not undone', { code: done.reason });
  });
}
