import { NextRequest, NextResponse } from 'next/server';
import { asLiveStaff } from '@/lib/control/billing-route';
import { NO_STORE, requireContentStaff } from '@/lib/content/route';
import { clearVideoReview } from '@/lib/content/video-picks';
import { reviewVideoNow } from '@/lib/ai/platform';

// Control → Content → Videos → Re-review (the video finder's AI judge, family.video_review). NetCyberAI staff with the
// authenticator, as the sibling videos route. POST { videoId }: the old review is removed and audited in the staff's
// own transaction, then Gemini watches the video again (no connection held while it does) and the new scores are kept.
export const dynamic = 'force-dynamic';

const STATUS: Record<string, number> = { bad_request: 400, not_switched_on: 409, no_key: 409, cap_reached: 429, failed: 502, already: 409 };

export async function POST(req: NextRequest) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  const videoId = b && typeof b === 'object' && typeof b.videoId === 'string' && b.videoId.length <= 11 ? b.videoId : '';
  const run = await asLiveStaff(guard.claims, (db) => clearVideoReview(db, { userId: guard.claims.sub }, videoId));
  if ('refused' in run) return run.refused;
  if (!run.value.ok) return NextResponse.json({ error: 'not done', code: run.value.reason }, { status: 400, headers: NO_STORE });
  const r = await reviewVideoNow(videoId).catch(() => ({ ok: false as const, reason: 'failed' as const }));
  if (r.ok) return NextResponse.json(r, { headers: NO_STORE });
  return NextResponse.json({ error: 'not done', code: r.reason }, { status: STATUS[r.reason] ?? 400, headers: NO_STORE });
}
