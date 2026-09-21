import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from './require-session';
import type { SessionClaims } from './types';

// Every /api/control/** route in Prompt E needs the identical guard:
// a real session, and that session must be super_admin. The layout at
// (admin)/control already redirects non-super_admin browsers away from
// these pages (Prompt D's canAccessControl), but PRD §2.2's own rule
// applies here too: "a hidden-but-reachable endpoint is an open
// endpoint" -- UI-level gating is never a substitute for this check at
// the route itself.
export async function requireSuperAdmin(
  req: NextRequest
): Promise<{ claims: SessionClaims } | { error: NextResponse }> {
  const claims = await requireSession(req);
  if (!claims) {
    return { error: NextResponse.json({ error: 'not authenticated' }, { status: 401 }) };
  }
  if (claims.role !== 'super_admin') {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { claims };
}
