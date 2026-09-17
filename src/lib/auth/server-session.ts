import { cookies } from 'next/headers';
import { verifyAccessToken } from './jwt';
import { ACCESS_COOKIE } from './cookies';
import type { SessionClaims } from './types';

// For Server Components/layouts (which read cookies() rather than a
// NextRequest). Same verification as require-session.ts's route-handler
// version, just adapted to the RSC cookie API.
export async function getServerSession(): Promise<SessionClaims | null> {
  const token = cookies().get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}
