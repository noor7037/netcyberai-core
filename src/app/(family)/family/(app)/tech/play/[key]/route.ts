import { NextRequest, NextResponse } from 'next/server';
import { LESSON_KEY, playPayload } from '@/lib/family/tech/catalog';
import { withTech } from '@/lib/family/tech/request';

export const dynamic = 'force-dynamic';

// The lab iframe fetches this. It is the lesson's play.config and goal only — never the questions or the answers.
export async function GET(req: NextRequest, { params }: { params: { key: string } }) {
  const key = params.key.replace(/\.json$/, '');
  if (!LESSON_KEY.test(key)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return withTech(req, async () => {
    const play = playPayload(key);
    if (!play) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(play, { headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  });
}
