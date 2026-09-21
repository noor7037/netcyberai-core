import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { assertRowsAffected } from '@/lib/db/rows';
import { ACCESS_COOKIE, IMPERSONATION_RETURN_COOKIE, ACCESS_TTL_SECONDS, cookieOptions } from '@/lib/auth/cookies';

// Ends the CURRENT session's own impersonation (there is no
// "end someone else's" path -- an impersonating super_admin ends their
// own view, same as any session ending its own). Writes
// ImpersonationEnded, marks the impersonation_sessions row ended (so a
// stolen/replayed impersonated token stops passing withTenantContext's
// live check immediately, not just at its natural expiry), then restores
// the actor's own pre-impersonation session from the return cookie.
export async function POST(req: NextRequest) {
  const claims = await requireSession(req);
  if (!claims) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
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

  const returnToken = req.cookies.get(IMPERSONATION_RETURN_COOKIE)?.value;
  const res = NextResponse.json({ status: 'ended' });
  if (returnToken) {
    res.cookies.set(ACCESS_COOKIE, returnToken, cookieOptions(ACCESS_TTL_SECONDS));
  } else {
    res.cookies.delete(ACCESS_COOKIE);
  }
  res.cookies.delete(IMPERSONATION_RETURN_COOKIE);
  return res;
}
