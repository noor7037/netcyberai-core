import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { assertRowsAffected } from '@/lib/db/rows';
import { IMPERSONATION_RETURN_COOKIE } from '@/lib/auth/cookies';
import { accessCookieOf, refreshCookieFor, sessionOf, type Surface } from '@/lib/auth/surfaces';
import type { SessionClaims } from '@/lib/auth/types';

// Ends the CURRENT browser's own view (there is no "end someone else's" path). Writes ImpersonationEnded, marks the
// impersonation_sessions row ended (so a stolen/replayed impersonated token stops passing withTenantContext's live
// check immediately, not just at its natural expiry), and removes the view's token.
//
// C556: a view lives in the School app's own sign-in (or the parent home's), and the founder's Control sign-in is never
// touched by it, so ending a view needs nothing put back: Control is simply still signed in.
export async function POST(req: NextRequest) {
  const get = (name: string) => req.cookies.get(name)?.value;
  let claims: SessionClaims | null = null;
  let surface: Surface | null = null;
  for (const s of ['app', 'parent'] as const) {
    const found = await sessionOf(get, s);
    if (found?.impersonation) {
      claims = found;
      surface = s;
      break;
    }
  }
  if (!claims || !claims.impersonation || !surface) {
    // The view ran out before End was pressed, or was already ended: nothing is left to end. The founder's Control
    // sign-in is still there, so the screen goes back to Control rather than to the sign-in page (W11-B, W14-A).
    const founder = (await sessionOf(get, 'control')) ?? ((await refreshCookieFor(get, 'control')) ? { role: 'super_admin' } : null);
    if (!founder) return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
    const res = NextResponse.json({ status: 'ended' });
    res.cookies.delete(IMPERSONATION_RETURN_COOKIE);
    return res;
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
  res.cookies.delete(accessCookieOf(surface));
  res.cookies.delete(IMPERSONATION_RETURN_COOKIE);
  return res;
}
