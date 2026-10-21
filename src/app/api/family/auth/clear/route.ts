import { NextRequest, NextResponse } from 'next/server';
import { clearFamilyCookies } from '@/lib/family/request';

// A session whose account is gone (deleted, or signed out everywhere): its cookies go, and the phone shows sign-in.
export async function GET(req: NextRequest) {
  return clearFamilyCookies(NextResponse.redirect(new URL('/family/sign-in', req.url)));
}
