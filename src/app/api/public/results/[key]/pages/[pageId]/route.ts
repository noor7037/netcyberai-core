import { NextResponse } from 'next/server';
import { withPlatformService } from '@/lib/auth/db';
import type { Sql } from '@/lib/jobs/types';
import { reportPageKey } from '@/lib/marking/report-links';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// A page picture of the private report link (C351): only a page that marking_report_pages names for this key (the
// child's approved script of a publication in force, within 30 days, while the school lets families see the checked
// sheets). Any other key or page answers the same "not found". Never cached by a shared cache, never indexed, and the
// address is not passed on.
export const dynamic = 'force-dynamic';

const platform = withPlatformService as <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
const PRIVATE = { 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const NOT_FOUND = () => new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store', ...PRIVATE } });
const UNAVAILABLE = () => new NextResponse('Try again in a few minutes', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60', ...PRIVATE } });

export async function GET(_req: Request, { params }: { params: { key: string; pageId: string } }) {
  let key: string | null;
  try {
    key = await platform((db) => reportPageKey(db, params.key, params.pageId));
  } catch {
    return UNAVAILABLE();
  }
  if (!key) return NOT_FOUND();
  let bytes: Uint8Array | null;
  try {
    bytes = await supabaseFileStorage.get(key);
  } catch {
    return UNAVAILABLE();
  }
  if (!bytes) return NOT_FOUND();
  return new NextResponse(Buffer.from(bytes), { status: 200, headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', ...PRIVATE } });
}
