import { NextRequest, NextResponse } from 'next/server';
import { cleanMarks } from '@/lib/family/call';
import { jsonBody, requireFamily } from '@/lib/family/request';
import { log } from '@/lib/observability/log';

// A call turn's latency marks (W16-A4): POST { turn, textMs, audioMs, voice } from the phone, in milliseconds from the
// moment the child stopped speaking to the first words of the answer arriving (textMs) and the first sound played
// (audioMs; null when nothing was played), and which voice spoke ('server', 'phone' or 'none').
// The understand request has no telemetry path of its own and a phone's own clock is no honest ledger entry (the AI
// ledger, control.ai_usage_ledger, holds what the server measured of each attempt and is written by the gateway's record
// step, never by a phone). So the marks are logged as ONE structured line and nothing else is stored: no account, no
// child, no words, no audio, nothing that names anyone. Numbers are checked for range; anything else is a 400.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const marks = cleanMarks(await jsonBody(req));
  if (!marks) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  log('info', 'family.call.marks', { turn: marks.turn, text_ms: marks.textMs, audio_ms: marks.audioMs, voice: marks.voice });
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
