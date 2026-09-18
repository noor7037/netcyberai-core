import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { withBackendConnection } from '@/lib/auth/db';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/cookies';

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session) {
    await withBackendConnection((client) =>
      client.query(`update sessions set revoked_at = now() where session_id = $1`, [session.sessionId])
    );
  }
  const res = NextResponse.json({ status: 'ok' });
  res.cookies.delete(ACCESS_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);
  return res;
}
