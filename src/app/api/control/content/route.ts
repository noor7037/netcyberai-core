import { NextRequest, NextResponse } from 'next/server';
import { asLiveStaff } from '@/lib/control/billing-route';
import { approveAllWaiting, listVersions } from '@/lib/content/library';
import { NO_STORE, requireContentStaff } from '@/lib/content/route';

// Control → Content (M1-4): every version of every syllabus in the library, with its status and line counts.
// NetCyberAI staff only, signed in with their authenticator; run as the platform role.
//   POST { action: 'approve-all', confirm: 'approve-waiting' }   every waiting version approved and released (C530)
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const run = await asLiveStaff(guard.claims, (db) => listVersions(db, { userId: guard.claims.sub }));
  if ('refused' in run) return run.refused;
  return NextResponse.json({ versions: run.value }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  if (typeof b !== 'object' || b === null || b.action !== 'approve-all' || b.confirm !== 'approve-waiting') {
    return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  }
  const run = await asLiveStaff(guard.claims, (db) => approveAllWaiting(db, { userId: guard.claims.sub }));
  if ('refused' in run) return run.refused;
  return NextResponse.json(run.value, { headers: NO_STORE });
}
