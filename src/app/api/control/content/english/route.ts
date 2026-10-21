import { NextRequest, NextResponse } from 'next/server';
import { asLiveStaff } from '@/lib/control/billing-route';
import { listEnglishVersions } from '@/lib/content/english-library';
import { NO_STORE, requireContentStaff } from '@/lib/content/route';

// Control → Content: the English course's versions, one track each (docs/family-app/12 §11, C274).
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const run = await asLiveStaff(guard.claims, (db) => listEnglishVersions(db));
  if ('refused' in run) return run.refused;
  return NextResponse.json({ versions: run.value }, { headers: NO_STORE });
}
