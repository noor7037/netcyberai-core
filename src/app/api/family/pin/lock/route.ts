import { NextResponse } from 'next/server';
import { FAMILY_PARENT_COOKIE, familyCookieOptions } from '@/lib/family/session';

// Back to child mode: parent mode ends now.
export async function POST() {
  const res = NextResponse.json({ status: 'child_mode' });
  res.cookies.set(FAMILY_PARENT_COOKIE, '', familyCookieOptions(0));
  return res;
}
