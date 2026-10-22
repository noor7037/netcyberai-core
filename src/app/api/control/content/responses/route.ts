import { NextRequest, NextResponse } from 'next/server';
import { asLiveStaff } from '@/lib/control/billing-route';
import { NO_STORE, requireContentStaff } from '@/lib/content/route';
import { listResponses, oldestQueueAgeDays } from '@/lib/content/response-queue';

// Control → Content → Responses to review (M2-12, C286): the Concept Resolver's AI-made responses, most asked first
// (?status=checked: those already checked). NetCyberAI staff only, signed in with their authenticator; run as the
// platform role.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const status = req.nextUrl.searchParams.get('status') === 'checked' ? 'checked' : 'ai_made';
  const run = await asLiveStaff(guard.claims, async (db) => ({
    responses: await listResponses(db, { userId: guard.claims.sub }, status),
    age: await oldestQueueAgeDays(db),
  }));
  if ('refused' in run) return run.refused;
  return NextResponse.json({ status, ...run.value }, { headers: NO_STORE });
}
