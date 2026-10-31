import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { assertRowsAffected } from '@/lib/db/rows';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { refreshSession } from '@/lib/auth/refresh';
import { ACCESS_COOKIE, IMPERSONATION_RETURN_COOKIE, REFRESH_COOKIE, ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS, cookieOptions, sessionCookieOptions } from '@/lib/auth/cookies';

// Ends the CURRENT session's own impersonation (there is no
// "end someone else's" path -- an impersonating super_admin ends their
// own view, same as any session ending its own). Writes
// ImpersonationEnded, marks the impersonation_sessions row ended (so a
// stolen/replayed impersonated token stops passing withTenantContext's
// live check immediately, not just at its natural expiry), then restores
// the actor's own session (restoreFounder below).
export async function POST(req: NextRequest) {
  const claims = await requireSession(req);
  if (!claims) {
    // The view ran out before End was pressed (the banner ends it at zero): nothing is left to end, but the founder's
    // own session is still put back, so Control opens without a new sign-in (W11-B).
    const back = await restoreFounder(req, null, NextResponse.json({ status: 'ended' }));
    return back ?? NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  }
  if (!claims.impersonation) {
    return NextResponse.json({ error: 'current session is not an impersonation session' }, { status: 400 });
  }

  try {
    await withTenantContext(claims, async (client) => {
      // No "and ended_at is null" here: withTenantContext's own live
      // check just above already verified (in this same transaction)
      // that this row exists, is unended, and unexpired -- the only
      // way this UPDATE can still affect zero rows is a missing or
      // narrowed RLS policy, exactly Decision Log C40's bug class, not
      // a legitimate "already ended" race this route should tolerate.
      const result = await client.query(
        `update impersonation_sessions set ended_at = now() where impersonation_id = $1`,
        [claims.impersonation!.impersonationId]
      );
      assertRowsAffected(result, 'impersonation_sessions update affected 0 rows -- RLS policy missing or narrowed');
      await writeAuditLog(client, {
        schoolId: claims.schoolId,
        actorUserId: claims.impersonation!.actorUserId,
        actorRole: 'super_admin',
        eventAction: 'ImpersonationEnded',
        targetType: 'users',
        targetId: claims.sub,
        afterState: { impersonationId: claims.impersonation!.impersonationId },
      });
    });
  } catch (err) {
    // Already expired/ended by the time /end was called -- nothing left
    // to tear down through the normal tenant-context path, and that's
    // fine: an already-inert session needs no further rejection.
    const resp = sessionErrorResponse(err);
    if (!resp) throw err;
  }

  const res = NextResponse.json({ status: 'ended' });
  const back = await restoreFounder(req, claims.impersonation.actorUserId, res);
  if (back) return back;
  // Nothing of the founder's to put back: the view's own token goes, so the next page asks for a sign-in rather than
  // answering "forbidden" with the person's session.
  res.cookies.delete(ACCESS_COOKIE);
  res.cookies.delete(IMPERSONATION_RETURN_COOKIE);
  return res;
}

// The founder's own session, put back (W11-B). The return cookie holds the founder's access token from the moment the
// view started, and that token lasts 15 minutes from ITS issue, not from the view's start: put back as it was, it had
// often run out already, and the next page bounced to sign-in. So the browser's own session is renewed from its
// refresh cookie, which a view never touches (the same checks as /api/auth/refresh: live account, token version, role;
// and once renewed, the new pair must be kept, or the rotated refresh token is lost). Only when that cannot be done is
// the returned token used, and only while it is still valid and is a super_admin's (this view's actor, when known).
async function restoreFounder(req: NextRequest, actorUserId: string | null, res: NextResponse): Promise<NextResponse | null> {
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (refresh) {
    const renewed = await refreshSession(refresh).catch(() => null);
    if (renewed?.ok) {
      res.cookies.set(ACCESS_COOKIE, renewed.accessToken, sessionCookieOptions(ACCESS_TTL_SECONDS, renewed.persistent));
      res.cookies.set(REFRESH_COOKIE, renewed.refreshToken, sessionCookieOptions(REFRESH_TTL_SECONDS, renewed.persistent));
      res.cookies.delete(IMPERSONATION_RETURN_COOKIE);
      return res;
    }
  }
  const returnToken = req.cookies.get(IMPERSONATION_RETURN_COOKIE)?.value;
  const back = returnToken ? await verifyAccessToken(returnToken) : null;
  if (returnToken && back && back.role === 'super_admin' && (actorUserId === null || back.sub === actorUserId)) {
    res.cookies.set(ACCESS_COOKIE, returnToken, cookieOptions(ACCESS_TTL_SECONDS));
    res.cookies.delete(IMPERSONATION_RETURN_COOKIE);
    return res;
  }
  return null;
}
