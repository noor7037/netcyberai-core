import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { normalizePhone } from '@/lib/auth/account';
import { ownPhone, setOwnPhone } from '@/lib/auth/db';

// The signed-in user's own mobile number, used to sign in instead of the
// email (C90). Codes still go to the email.
export async function GET(req: NextRequest) {
  const claims = await requireSession(req);
  if (!claims) return NextResponse.json({ error: 'session_expired' }, { status: 401 });
  return NextResponse.json({ phone: await ownPhone(claims.sub) });
}

export async function POST(req: NextRequest) {
  const claims = await requireSession(req);
  if (!claims) return NextResponse.json({ error: 'session_expired' }, { status: 401 });
  if (claims.impersonation) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const raw = typeof body?.phone === 'string' ? body.phone.trim() : '';
  const phone = raw ? normalizePhone(raw) : null;
  if (raw && !phone) return NextResponse.json({ error: 'phone_invalid' }, { status: 400 });
  const ok = await setOwnPhone(claims.sub, phone ? `+91${phone}` : null);
  if (!ok) return NextResponse.json({ error: 'phone_taken' }, { status: 409 });
  return NextResponse.json({ status: 'saved', phone: phone ? `+91${phone}` : null });
}
