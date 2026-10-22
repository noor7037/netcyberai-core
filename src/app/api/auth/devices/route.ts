import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { DEVICE_COOKIE } from '@/lib/auth/cookies';
import { forgetDevice, listDevices } from '@/lib/auth/devices';

// The account page's trusted browsers (F1-1, C257): GET lists the signed-in person's own, each marked if it is this
// one; POST {deviceId} forgets one of them, which then asks for its sign-in steps again. A support session (viewing
// as someone) can do neither.
export async function GET(req: NextRequest) {
  const claims = await requireSession(req);
  if (!claims) return NextResponse.json({ error: 'session_expired' }, { status: 401 });
  if (claims.impersonation) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ devices: await listDevices(claims.sub, req.cookies.get(DEVICE_COOKIE)?.value) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const claims = await requireSession(req);
  if (!claims) return NextResponse.json({ error: 'session_expired' }, { status: 401 });
  if (claims.impersonation) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId : '';
  if (!(await forgetDevice(claims.sub, deviceId))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ status: 'forgotten' });
}
