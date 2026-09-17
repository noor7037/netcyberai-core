import { NextRequest } from 'next/server';
import { verifyAccessToken } from './jwt';
import { ACCESS_COOKIE } from './cookies';
import type { SessionClaims } from './types';

export async function requireSession(req: NextRequest): Promise<SessionClaims | null> {
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}
