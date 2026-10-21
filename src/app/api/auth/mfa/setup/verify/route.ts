import { NextRequest, NextResponse } from 'next/server';
import { finishSignInSetup } from '@/lib/auth/authenticator';
import { normalizeTotpCode } from '@/lib/auth/authenticator-rules';
import { AuthError } from '@/lib/auth/errors';
import { PENDING_COOKIE } from '@/lib/auth/cookies';
import { withTenantContext } from '@/lib/auth/db';
import { writeAuditLog } from '@/lib/audit/log';
import { authErrorResponse, keepSignedIn, noStore, signInResponse } from '@/lib/auth/outcome-response';

// Confirms the authenticator started by /api/auth/mfa/setup/start with its
// first code, then finishes sign-in at aal2 (C95). Audited: the event only,
// never the secret or the code.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const code = normalizeTotpCode(body?.code);
  if (!code) return noStore(NextResponse.json({ error: 'mfa_invalid_code' }, { status: 400 }));
  try {
    const { outcome, userId } = await finishSignInSetup(req.cookies.get(PENDING_COOKIE)?.value, body?.factorId, code);
    if (outcome.status === 'ok') {
      await withTenantContext(outcome.claims, (client) =>
        writeAuditLog(client, {
          schoolId: outcome.claims.schoolId,
          actorUserId: userId,
          actorRole: outcome.claims.role,
          eventAction: 'user.authenticator.enrolled',
          targetType: 'users',
          targetId: userId,
          afterState: { via: 'sign_in' },
        })
      );
    }
    return noStore(await signInResponse(outcome, keepSignedIn(req, body)));
  } catch (err) {
    if (err instanceof AuthError) return noStore(authErrorResponse(err));
    throw err;
  }
}
