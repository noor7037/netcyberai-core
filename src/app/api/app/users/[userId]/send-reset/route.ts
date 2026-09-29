import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { AuthError } from '@/lib/auth/errors';
import { authErrorResponse } from '@/lib/auth/outcome-response';
import { findSchoolAccount, isUserId, sendResetFor, SCHOOL_ACCOUNT_ADMINS } from '@/lib/auth/staff-accounts';

// A principal or school admin emails a password-reset code to someone in
// their own school, optionally signing them out everywhere (C89).
export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!SCHOOL_ACCOUNT_ADMINS.includes(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!isUserId(params.userId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const signOutEverywhere = body?.signOutEverywhere === true;
  try {
    const result = await withTenantContext(guard.claims, async (client) => {
      const target = await findSchoolAccount(client, guard.claims.schoolId, params.userId);
      if (!target) return { notFound: true as const };
      if (!target.email) return { noEmail: true as const };
      return sendResetFor(client, guard.claims, { userId: target.userId, email: target.email, schoolId: guard.claims.schoolId }, signOutEverywhere, `${req.nextUrl.origin}/login`);
    });
    if ('notFound' in result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if ('noEmail' in result) return NextResponse.json({ error: 'no_email' }, { status: 409 });
    return NextResponse.json({ status: 'sent', ...result });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    const res = sessionErrorResponse(err);
    if (res) return res;
    throw err;
  }
}
