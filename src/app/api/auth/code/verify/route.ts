import { NextRequest, NextResponse } from 'next/server';
import { loginWithEmailCode, normalizeCode, resolveIdentifier } from '@/lib/auth/account';
import { AuthError } from '@/lib/auth/errors';
import { outcomeResponse, authErrorResponse, rememberDevice } from '@/lib/auth/outcome-response';

// Signs in with an emailed code. The outcome goes through the same
// resolution as password login: super_admin still needs the authenticator
// step, people with several schools still choose one (C89, C90).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const code = normalizeCode(body?.code);
  const email = await resolveIdentifier(body?.identifier ?? body?.email, { forEmail: true });
  if (!email || !code) {
    return NextResponse.json({ error: 'code_invalid' }, { status: 400 });
  }
  try {
    const { outcome, userId } = await loginWithEmailCode(email, code);
    const res = outcomeResponse(outcome);
    return body?.rememberDevice === true && res.ok ? rememberDevice(res, userId) : res;
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }
}
