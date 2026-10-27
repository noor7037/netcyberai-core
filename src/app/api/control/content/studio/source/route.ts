import { NextRequest, NextResponse } from 'next/server';
import { asLiveStaff } from '@/lib/control/billing-route';
import { requestUpload } from '@/lib/content/chapter-studio';
import { NO_STORE, requireContentStaff } from '@/lib/content/route';
import { FileStorageUnavailableError } from '@/lib/storage/file-storage';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// Control → Content → Studio: the PDF a parent attached to a request (S3, C376), as a short-lived signed link, for the
// reviewer only. The file is private; the link is made after the request is read under the platform role, lasts five
// minutes and is not stored. GET ?requestId=<uuid>  ->  { url }
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const run = await asLiveStaff(guard.claims, (db) => requestUpload(db, req.nextUrl.searchParams.get('requestId')));
  if ('refused' in run) return run.refused;
  if (!run.value) return NextResponse.json({ error: 'not done', code: 'not_found' }, { status: 404, headers: NO_STORE });
  try {
    return NextResponse.json({ url: await supabaseFileStorage.signedUrl(run.value, 300) }, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof FileStorageUnavailableError) return NextResponse.json({ error: 'not done', code: 'storage_unavailable' }, { status: 503, headers: NO_STORE });
    throw err;
  }
}
