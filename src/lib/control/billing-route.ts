import { NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import type { SessionClaims } from '@/lib/auth/types';
import type { Sql } from '@/lib/jobs/types';

// How a Control billing route reaches the database (C204). The route has already checked that the token says
// "NetCyberAI staff" (requireSuperAdmin). This runs the work as the platform role through withTenantContext, which
// checks again, on this very request and in the same transaction, that the account is still active, still staff,
// and has not been signed out everywhere (C35). Plans, payments and a school's access are not changed on the word
// of a token alone. A session that fails the check gets the same plain refusal as everywhere else.
export async function asLiveStaff<T>(claims: SessionClaims, fn: (db: Sql) => Promise<T>): Promise<{ value: T } | { refused: NextResponse }> {
  try {
    return { value: await withTenantContext(claims, fn) };
  } catch (err) {
    const refused = sessionErrorResponse(err);
    if (refused) return { refused };
    throw err;
  }
}
