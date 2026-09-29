import { NextRequest, NextResponse } from 'next/server';
import { requestEmailCode, resolveIdentifier, type CodePurpose } from '@/lib/auth/account';
import { AuthError } from '@/lib/auth/errors';
import { authErrorResponse } from '@/lib/auth/outcome-response';

// Sends a one-time code to an account's email: `login` (sign in without a
// password) or `reset` (set or reset the password). Accepts an email or a
// mobile number; the code always goes to the email. Same answer whether or
// not the account exists (C89, C90).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const raw = body?.identifier ?? body?.email;
  const purpose: CodePurpose | null = body?.purpose === 'login' || body?.purpose === 'reset' ? body.purpose : null;
  if (typeof raw !== 'string' || !raw.trim() || !purpose) {
    return NextResponse.json({ error: 'an email or mobile number and a purpose (login or reset) are required' }, { status: 400 });
  }
  try {
    const email = await resolveIdentifier(raw);
    if (email) await requestEmailCode(email, purpose, `${req.nextUrl.origin}/login`);
    return NextResponse.json({ status: 'sent' });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }
}
