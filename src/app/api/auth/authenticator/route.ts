import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { hasConfirmedAuthenticator } from '@/lib/auth/admin-actions';
import { authenticatorRequired, canManageOwnAuthenticator } from '@/lib/auth/authenticator-rules';

// The signed-in person's own authenticator status, for the account page
// (C95). Yes/no only; nothing about the secret.
export async function GET(req: NextRequest) {
  const claims = await requireSession(req);
  if (!claims) return NextResponse.json({ error: 'session_expired' }, { status: 401 });
  // A support (impersonation) session acts as someone else.
  if (claims.impersonation) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const canManage = canManageOwnAuthenticator(claims.role);
  const res = NextResponse.json({
    canManage,
    required: authenticatorRequired(claims.role),
    enrolled: canManage ? await hasConfirmedAuthenticator(claims.sub) : null,
  });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
