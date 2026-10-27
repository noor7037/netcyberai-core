import { NextRequest, NextResponse } from 'next/server';
import { familyRun, requireFamily } from '@/lib/family/request';
import { familyRenewAfterSeconds, setFamilySessionCookie } from '@/lib/family/session';

// "Keep me signed in" (F1-1, C257): the app calls this while it is used, and a session older than a day (an hour when
// not kept) gets a new token for the same session, so it ends only after 180 days without use (12 hours when not kept). The account's
// token_version is checked live first (familyRun): a signed-out, PIN-changed or deleted session is never renewed.
export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const session = g.session;
  return familyRun(session, async () => {
    const age = Math.floor(Date.now() / 1000) - (session.issuedAt ?? 0);
    if (age < familyRenewAfterSeconds(session.keep)) return NextResponse.json({ status: 'fresh' });
    const res = NextResponse.json({ status: 'renewed' });
    await setFamilySessionCookie(res, { accountId: session.accountId, tokenVersion: session.tokenVersion, sessionId: session.sessionId, keep: session.keep, device: session.device });
    return res;
  });
}
