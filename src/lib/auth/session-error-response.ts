import { NextResponse } from 'next/server';
import { SessionRevokedError } from './db';

// withTenantContext throws SessionRevokedError for every live-check
// failure (token_version mismatch, deactivated account, super_admin
// authority revoked, and now -- Prompt E Task 5 -- an expired/ended
// impersonation session). Nothing caught it before this prompt: every
// route calling withTenantContext so far was itself a login-time flow
// (selectSchool/switchSchool) that never reaches this check with a
// stale session, so an ordinary request-handling route hitting it was
// never actually exercised. Left uncaught, it becomes a raw 500 --
// still a rejection, but not the clean 401 every other auth failure in
// this app returns. Every route in this prompt that calls
// withTenantContext wraps it with this.
export function sessionErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof SessionRevokedError) {
    return NextResponse.json({ error: 'session_revoked', reason: err.message }, { status: 401 });
  }
  return null;
}
