import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { actorOf, markingRefusal, mayRead, refusal } from '@/lib/marking/http';
import { settlePage } from '@/lib/marking/review';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// One page picture of an answer sheet (C350), where the review screen and the harness fetch it (pageUrl,
// src/lib/marking/review.ts). The page's row is read under the viewer's own row rules every time: a teacher of the
// class, the office, or a guardian of the child once the script is published to families (the migration's policies),
// and no one else; any other page answers 404, the same as a page that does not exist. The picture is then fetched
// from the store with the connection already given back, and sent as the JPEG it was checked to be, kept by the
// browser only (private) for five minutes. No storage link ever leaves the server. 503 when the store does not answer.
// A page taken out of its script, or whose picture was deleted after the school's days, answers 404 (C230-AG).
//
// POST { action: 'keep' | 'take_out' }: the teacher settles a page that may not be an answer page (settlePage).
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { pageId: string } }) {
  let key: string | null = null;
  const res = await appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.pageId)) return markingRefusal('not_found');
    const row = (
      await db.query(`select storage_key from marking_pages where school_id = $1 and page_id = $2 and state <> 'removed' and picture_gone_at is null`, [claims.schoolId, params.pageId])
    ).rows[0];
    if (!row) return markingRefusal('not_found');
    key = row.storage_key as string;
    return NextResponse.json({ found: true });
  });
  if (key === null) return res;
  let bytes: Uint8Array | null = null;
  try {
    bytes = await supabaseFileStorage.get(key);
  } catch {
    bytes = null;
  }
  if (!bytes || bytes.length === 0) return markingRefusal('storage');
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: { pageId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.pageId) || (b.action !== 'keep' && b.action !== 'take_out')) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const r = await settlePage(db, actorOf(claims), params.pageId, b.action);
    if (r.ok) return NextResponse.json(r);
    return refusal(r.reason);
  });
}
