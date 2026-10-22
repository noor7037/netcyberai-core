import { NextRequest, NextResponse } from 'next/server';
import { asLiveStaff } from '@/lib/control/billing-route';
import { NO_STORE, requireContentStaff } from '@/lib/content/route';
import { listVideoReview, removeVideoChannel, reviewVideoPick, setVideoChannel, type VideoChange } from '@/lib/content/video-picks';
import { indiaDate } from '@/lib/time/india';

// Control → Content → Videos (M2-5, C279). NetCyberAI staff with the authenticator, as every Control content route.
//   GET   ?topic=<key or its start>   the video finder's picks, the channel lists and today's searches
//   POST  { action: 'pin' | 'reject', topicKey, language, videoId }
//         { action: 'channel', channelId, title, kind: 'official' | 'approved' | 'blocked' }
//         { action: 'remove_channel', channelId }
export const dynamic = 'force-dynamic';

const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : '');

export async function GET(req: NextRequest) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const topic = req.nextUrl.searchParams.get('topic')?.trim() || undefined;
  const run = await asLiveStaff(guard.claims, (db) => listVideoReview(db, { topic, today: indiaDate() }));
  if ('refused' in run) return run.refused;
  return NextResponse.json(run.value, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  const action = b && typeof b === 'object' ? b.action : undefined;
  if (!['pin', 'reject', 'channel', 'remove_channel'].includes(action)) return NextResponse.json({ error: 'not sent properly', code: 'bad_request' }, { status: 400 });
  const actor = { userId: guard.claims.sub };
  const run = await asLiveStaff(guard.claims, (db): Promise<VideoChange> => {
    if (action === 'pin' || action === 'reject') {
      return reviewVideoPick(db, actor, { topicKey: str(b.topicKey, 120), language: str(b.language, 2), videoId: str(b.videoId, 11), status: action === 'pin' ? 'pinned' : 'rejected' });
    }
    if (action === 'channel') return setVideoChannel(db, actor, { channelId: str(b.channelId, 40), title: str(b.title, 200), kind: str(b.kind, 10) });
    return removeVideoChannel(db, actor, str(b.channelId, 40));
  });
  if ('refused' in run) return run.refused;
  const r = run.value;
  if (r.ok) return NextResponse.json(r, { headers: NO_STORE });
  return NextResponse.json({ error: 'not done', code: r.reason }, { status: r.reason === 'not_found' ? 404 : 400, headers: NO_STORE });
}
