import { NextRequest, NextResponse } from 'next/server';
import { asLiveStaff } from '@/lib/control/billing-route';
import { MAX_CATALOG_CHARS } from '@/lib/content/catalog-csv';
import { importCatalog } from '@/lib/content/library';
import { NO_STORE, requireContentStaff } from '@/lib/content/route';

// Control → Content → import a catalog CSV (M1-4, docs/family-app/10 §4.2).
//   POST { csv, preview: true }   "Check file": every problem by line number; nothing is written
//   POST { csv, preview: false }  "Import as a draft": all or nothing, one version per syllabus in the file, in review,
//                                 imported by this account (who can then never approve it)
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  if (typeof b !== 'object' || b === null || typeof b.csv !== 'string' || typeof b.preview !== 'boolean' || b.csv.length > MAX_CATALOG_CHARS + 1) {
    return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  }
  const run = await asLiveStaff(guard.claims, (db) => importCatalog(db, { userId: guard.claims.sub }, b.csv, { preview: b.preview }));
  if ('refused' in run) return run.refused;
  const r = run.value;
  return NextResponse.json(r, { status: r.committed ? 201 : r.problems.length > 0 && !r.preview ? 422 : 200, headers: NO_STORE });
}
