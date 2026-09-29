import { NextRequest, NextResponse } from 'next/server';
import { changePassword, normalizeCode, passwordProblem } from '@/lib/auth/account';
import { requireSession } from '@/lib/auth/require-session';
import { AuthError } from '@/lib/auth/errors';
import { authErrorResponse } from '@/lib/auth/outcome-response';

// Signed-in password change for every staff role and super_admin (C89).
// Needs the current password (and the authenticator code when the account
// has one). Other devices are signed out; this one stays signed in.
export async function POST(req: NextRequest) {
  const claims = await requireSession(req);
  if (!claims) return NextResponse.json({ error: 'session_expired' }, { status: 401 });
  // An impersonation session acts as someone else: it must never change
  // that person's password.
  if (claims.impersonation) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (typeof body?.currentPassword !== 'string' || !body.currentPassword) {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 400 });
  }
  if (passwordProblem(body?.newPassword)) {
    return NextResponse.json({ error: 'password_invalid', detail: passwordProblem(body?.newPassword) }, { status: 400 });
  }
  try {
    await changePassword(claims.sub, claims.sessionId, body.currentPassword, body.newPassword, normalizeCode(body?.mfaCode) ?? undefined);
    return NextResponse.json({ status: 'password_updated' });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }
}
