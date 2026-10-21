import { NextRequest, NextResponse } from 'next/server';
import { asLiveStaff } from '@/lib/control/billing-route';
import { diffVersions } from '@/lib/content/library';
import { isVersionId, NO_STORE, requireContentStaff } from '@/lib/content/route';

// Two versions of the same syllabus compared line by line by stable key (M1-4, docs/family-app/10 §4.2):
//   GET ?from=<older version>&to=<newer version>  → added, removed, renamed and moved lines
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  if (!isVersionId(from) || !isVersionId(to)) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const run = await asLiveStaff(guard.claims, (db) => diffVersions(db, { userId: guard.claims.sub }, from, to));
  if ('refused' in run) return run.refused;
  const r = run.value;
  if (!r.ok) return NextResponse.json({ error: 'not compared', code: r.reason }, { status: r.reason === 'not_found' ? 404 : 400 });
  return NextResponse.json(r, { headers: NO_STORE });
}
