import { NextResponse } from 'next/server';
import { withPlatformService } from '@/lib/auth/db';
import { certificateFileName } from '@/lib/documents/certificate-rules';
import { familyCopy, storedReader } from '@/lib/documents/certificates';
import type { Sql } from '@/lib/jobs/types';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// The link in the family's WhatsApp message (C228): the certificate's PDF, while the certificate stands. The key is
// random and is only in that message; the QR token printed on the paper does not open this. A withdrawn or erased
// certificate, or a key that does not exist, answers the same "not found". Nothing is cached or indexed.
export const dynamic = 'force-dynamic';

const platform = withPlatformService as <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
const NOT_FOUND = () => new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' } });

export async function GET(_req: Request, { params }: { params: { key: string } }) {
  const copy = await platform((db) => familyCopy(db, params.key)).catch(() => null);
  if (!copy) return NOT_FOUND();
  const bytes = await storedReader(supabaseFileStorage)(copy.storageKey);
  if (!bytes) return NOT_FOUND();
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${certificateFileName(copy.number)}"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
