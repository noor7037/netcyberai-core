import { NextRequest, NextResponse } from 'next/server';
import { login } from '@/lib/auth/resolve';
import { AuthError } from '@/lib/auth/errors';
import { outcomeResponse, authErrorResponse } from '@/lib/auth/outcome-response';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
  }

  try {
    return outcomeResponse(await login(body.email, body.password));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }
}
