import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import type { SessionClaims } from '@/lib/auth/types';

// Who may use Control → Content (M1-4): NetCyberAI staff (super_admin), signed in with their authenticator (aal2), as
// every super_admin must be (C93, C95). A session without it is refused here, before any database work; the database
// work itself then runs through asLiveStaff, which checks the account live again in the same transaction.
export async function requireContentStaff(req: NextRequest): Promise<{ claims: SessionClaims & { role: 'super_admin' } } | { error: NextResponse }> {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard;
  if (guard.claims.aal !== 'aal2') return { error: NextResponse.json({ error: 'forbidden', code: 'authenticator_needed' }, { status: 403 }) };
  return guard;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isVersionId = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

export const NO_STORE = { 'Cache-Control': 'no-store' };
