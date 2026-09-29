import { NextRequest, NextResponse } from 'next/server';
import { normalizeEmail, requestEmailCode, type CodePurpose } from '@/lib/auth/account';
import { AuthError } from '@/lib/auth/errors';
import { authErrorResponse } from '@/lib/auth/outcome-response';

// Sends a one-time code to an account's email: `login` (sign in without a
// password) or `reset` (set or reset the password). Same answer whether or
// not the email has an account (C89).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const purpose: CodePurpose | null = body?.purpose === 'login' || body?.purpose === 'reset' ? body.purpose : null;
  if (!email || !purpose) {
    return NextResponse.json({ error: 'a valid email and purpose (login or reset) are required' }, { status: 400 });
  }
  try {
    await requestEmailCode(email, purpose);
    return NextResponse.json({ status: 'sent' });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }
}
