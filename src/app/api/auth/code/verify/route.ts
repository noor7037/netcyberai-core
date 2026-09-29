import { NextRequest, NextResponse } from 'next/server';
import { loginWithEmailCode, normalizeCode, normalizeEmail } from '@/lib/auth/account';
import { AuthError } from '@/lib/auth/errors';
import { outcomeResponse, authErrorResponse } from '@/lib/auth/outcome-response';

// Signs in with an emailed code. The outcome goes through the same
// resolution as password login: super_admin still needs the authenticator
// step, people with several schools still choose one (C89).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const code = normalizeCode(body?.code);
  if (!email || !code) {
    return NextResponse.json({ error: 'code_invalid' }, { status: 400 });
  }
  try {
    return outcomeResponse(await loginWithEmailCode(email, code));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }
}
