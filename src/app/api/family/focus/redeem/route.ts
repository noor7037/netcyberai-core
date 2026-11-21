import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FOCUS_DEVICE_HEADER, deviceHash, deviceId, focusOn, verifyFocusPass } from '@/lib/family/focus';
import { familyRun, jsonBody } from '@/lib/family/request';
import { focusAppSession, signFamilySession } from '@/lib/family/session';

// The Focus app trades its pass (C538) for its own family session, on the phone the pass was made for (X-Focus-Device).
// The session is the family's, as on a shared phone in child mode: never parent mode (the Focus app checks the parent
// PIN itself, offline). It is returned in the body, for the Focus app's own encrypted store, never as a cookie. A pass
// made before a sign-out everywhere is refused (its token_version, checked by familyRun), and so is one for a phone
// removed since.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const raw = req.headers.get(FOCUS_DEVICE_HEADER);
  const pass = await verifyFocusPass(body.pass, raw);
  if (!pass) return NextResponse.json({ error: 'bad_pass' }, { status: 400 });
  const session = focusAppSession(pass, randomUUID());
  const res = await familyRun(session, async (db) => {
    if (!(await focusOn(db, pass.accountId))) return NextResponse.json({ error: 'off' }, { status: 403 });
    const hash = deviceHash(pass.accountId, raw);
    if (!hash || !(await deviceId(db, pass.accountId, hash))) return NextResponse.json({ error: 'unknown_device' }, { status: 404 });
    return NextResponse.json({ session: await signFamilySession(session) }, { headers: { 'cache-control': 'no-store' } });
  });
  // A revoked pass: familyRun answers 401 and clears cookies the Focus app never had; say so plainly.
  return res.status === 401 ? NextResponse.json({ error: 'bad_pass' }, { status: 400 }) : res;
}
