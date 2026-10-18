import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/academics/syllabus';
import { canWriteMasterData } from '@/lib/auth/require-app-session';
import { appRoute, jsonError, ruleError } from '@/lib/frameworks/route';
import { makeSessionCurrent } from '@/lib/setup/sessions';

// POST: make this session the school's current one (docs/28 slice 10g, C244). The principal and the school admin
// only. In one transaction every session stops being current and this one is, so the school has exactly one; doing it
// to the session that is already current changes nothing. One audit row (ids only) when the current session changed.
export async function POST(req: NextRequest, { params }: { params: { sessionId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!canWriteMasterData(claims.role)) return ruleError(403, 'not_allowed');
    if (!isUuid(params.sessionId)) return ruleError(400, 'not_sent_properly');
    const done = await makeSessionCurrent(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.sessionId);
    if (!done.ok) return jsonError(404, 'this session is not one of the school’s', { code: 'session_not_found' });
    return NextResponse.json({ sessionId: params.sessionId, changed: done.changed });
  });
}
