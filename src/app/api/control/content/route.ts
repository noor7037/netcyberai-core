import { NextRequest, NextResponse } from 'next/server';
import { asLiveStaff } from '@/lib/control/billing-route';
import { listVersions } from '@/lib/content/library';
import { NO_STORE, requireContentStaff } from '@/lib/content/route';

// Control → Content (M1-4): every version of every syllabus in the library, with its status and line counts.
// NetCyberAI staff only, signed in with their authenticator; run as the platform role.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const run = await asLiveStaff(guard.claims, (db) => listVersions(db, { userId: guard.claims.sub }));
  if ('refused' in run) return run.refused;
  return NextResponse.json({ versions: run.value }, { headers: NO_STORE });
}
