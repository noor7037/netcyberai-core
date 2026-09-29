import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { finishAccountSetup } from '@/lib/auth/authenticator';
import { canManageOwnAuthenticator, normalizeTotpCode } from '@/lib/auth/authenticator-rules';
import { AuthError } from '@/lib/auth/errors';
import { AUTHENTICATOR_COOKIE } from '@/lib/auth/cookies';
import { withTenantContext } from '@/lib/auth/db';
import { writeAuditLog } from '@/lib/audit/log';
import { authErrorResponse } from '@/lib/auth/outcome-response';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';

// Confirms the authenticator started on the account page with its first
// code (C95). When it replaces one, the old one is removed only now, after
// the new one has worked, and other devices are signed out. Audited: the
// event only, never the secret or the code.
export async function POST(req: NextRequest) {
  const claims = await requireSession(req);
  if (!claims) return NextResponse.json({ error: 'session_expired' }, { status: 401 });
  if (claims.impersonation || !canManageOwnAuthenticator(claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const code = normalizeTotpCode(body?.code);
  if (!code) return NextResponse.json({ error: 'mfa_invalid_code' }, { status: 400 });
  try {
    const { removedOld } = await finishAccountSetup(claims.sub, claims.sessionId, req.cookies.get(AUTHENTICATOR_COOKIE)?.value, body?.factorId, code);
    const replaced = removedOld > 0;
    await withTenantContext(claims, (client) =>
      writeAuditLog(client, {
        schoolId: claims.schoolId,
        actorUserId: claims.sub,
        actorRole: claims.role,
        eventAction: replaced ? 'user.authenticator.replaced' : 'user.authenticator.enrolled',
        targetType: 'users',
        targetId: claims.sub,
        afterState: { via: 'account_page', removedOld },
      })
    );
    const res = NextResponse.json({ status: replaced ? 'replaced' : 'enrolled' });
    res.cookies.delete(AUTHENTICATOR_COOKIE);
    return res;
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    const res = sessionErrorResponse(err);
    if (res) return res;
    throw err;
  }
}
