import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import type { SessionClaims } from '@/lib/auth/types';

// Control → AI's routes (C249): NetCyberAI's founder, signed in with the authenticator (aal2), and nobody else. A
// school's staff, a parent, or a founder session without the authenticator's step is refused at the route itself.
export async function requireAiControl(req: NextRequest): Promise<{ claims: SessionClaims } | { error: NextResponse }> {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard;
  if (guard.claims.aal !== 'aal2') return { error: NextResponse.json({ error: 'sign in again with your authenticator app', code: 'aal2' }, { status: 403 }) };
  return { claims: guard.claims };
}
