import { NextResponse } from 'next/server';
import { DEVICE_COOKIE } from '@/lib/auth/cookies';

// "Forget this device" (C90): the next password sign-in here asks for the
// email code again.
export async function POST() {
  const res = NextResponse.json({ status: 'ok' });
  res.cookies.delete(DEVICE_COOKIE);
  return res;
}
