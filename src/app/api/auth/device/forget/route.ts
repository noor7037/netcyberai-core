import { NextRequest, NextResponse } from 'next/server';
import { DEVICE_COOKIE } from '@/lib/auth/cookies';
import { forgetThisDevice } from '@/lib/auth/devices';

// "Forget this device" (C90, F1-1 C257): this browser's trusted row ends on the server too, so a copy of its token is
// worth nothing; the next sign-in here asks for its steps again.
export async function POST(req: NextRequest) {
  await forgetThisDevice(req.cookies.get(DEVICE_COOKIE)?.value);
  const res = NextResponse.json({ status: 'ok' });
  res.cookies.delete(DEVICE_COOKIE);
  return res;
}
