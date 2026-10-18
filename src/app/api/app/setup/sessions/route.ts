import { NextRequest, NextResponse } from 'next/server';
import { canWriteMasterData } from '@/lib/auth/require-app-session';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { addSession, listSessions, parseSessionInput } from '@/lib/setup/sessions';

// The school's academic sessions, kept by the office in Setup (docs/28 slice 10g, C244). The principal and the school
// admin only: the route says so and so does the database. src/lib/setup/sessions.ts does the work.
//   GET   the sessions, the latest first, and which one is current
//   POST  { label, startDate, endDate }  add a session (not current: making it current is its own step)
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!canWriteMasterData(claims.role)) return ruleError(403, 'not_allowed');
    return NextResponse.json({ sessions: await listSessions(db, claims.schoolId) }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!canWriteMasterData(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    if (!body) return ruleError(400, 'not_sent_properly');
    const parsed = parseSessionInput(body);
    if (!parsed.ok) return jsonError(400, 'the session is not complete', { code: parsed.code });
    const added = await addSession(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, parsed.value);
    if (!added.ok) return jsonError(409, 'a session with this label already exists', { code: 'session_exists' });
    return NextResponse.json({ session: added.session }, { status: 201 });
  });
}
