import { NextRequest, NextResponse } from 'next/server';
import { FamilySessionRevokedError, withFamilyContext, withFamilyGate, familyClaims } from '@/lib/family/db';
import { liveAiContext } from '@/lib/family/english/live';
import { jsonBody, requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { VOICE_PROFILE, speakAsk, speakLine } from '@/lib/family/voice-out';
import { prepareSpeak, type PreparedVoice } from '@/lib/ai/platform';

// The server voice (C386): POST one of
//   { kind: 'chapter', chapterKey, blockId, sentence }   a sentence of the chapter reader's narration;
//   { kind: 'live_line', token }                          a live English reply's checked sentence, sealed by the live route;
//   { kind: 'live_turn', sessionId, position }            a kept live English reply of the child's own session;
//   { kind: 'tutor_answer', messageId }                   W17-B2: the teaching text of a kept tutor answer of the child's own.
//   { kind: 'draw', templateId, step, lang }              C519: one step of a Draw template's guide; the words are the
//                                                          template manifest's, never the phone's.
//   { kind: 'call_line', token }                        W16-A4: a sentence of a call's answer, sealed by the understand
//                                                          route, behind the voice input's gate (call-gate.ts).
// It speaks only text the server holds (src/lib/family/voice-out.ts), for the child this phone has chosen, behind the
// gate of the screen it belongs to. The answer is the audio itself (mp3), never cached and never stored. A voice that
// is not set up answers 503 "not_set_up" and a family whose voice allowance for the day is used up (C388: characters,
// Control's setting, not the AI requests) 429 "voice_allowance_reached": the phone then reads the line with its own
// voice and says so. No database connection is held while the vendor speaks (F1-3).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const session = g.session;
  const ask = speakAsk(await jsonBody(req));
  if (!ask) return fail('bad_request', 400);
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  const claims = familyClaims(session);
  try {
    // 1. The gate, the line the server holds, and the platform's own checks (the line's characters taken from the
    //    family's voice allowance) in one transaction.
    const plan = await withFamilyContext(claims, async (db): Promise<PreparedVoice | NextResponse> => {
      const line = await speakLine(db, session.accountId, chosen, ask);
      if (!line.ok) return fail(line.error, line.status);
      const ctx = await liveAiContext(db, session.accountId, line.children.map((c) => c.firstName));
      const prepared = await prepareSpeak(db, ctx, VOICE_PROFILE, { text: line.text, language: line.language });
      if (prepared.ok) return prepared.voice;
      if (prepared.reason === 'cap_reached') return fail('voice_allowance_reached', 429);
      return fail(prepared.reason === 'failed' ? 'failed' : 'not_set_up', 503);
    });
    if (plan instanceof NextResponse) return plan;
    // 2. The vendor speaks, with no database connection held. v21: how long it took is sent back (Server-Timing, the
    //    read-aloud's gap measurement) and logged once per request in development or with FAMILY_VOICE_TIMING=1; never the words.
    const began = Date.now();
    const sent = await plan.send();
    const genMs = Date.now() - began;
    if (process.env.NODE_ENV === 'development' || process.env.FAMILY_VOICE_TIMING === '1') {
      console.info('[voice] tts', { kind: ask.kind, from: ask.kind === 'tutor_answer' ? ask.from ?? 0 : null, max: ask.kind === 'tutor_answer' ? ask.max ?? null : null, genMs, ok: sent.result.ok });
    }
    // 3. The metering (counts, characters and the ledger), in a second transaction; still once if signed out between.
    try {
      await withFamilyContext(claims, (db) => sent.record(db));
    } catch (err) {
      if (!(err instanceof FamilySessionRevokedError)) throw err;
      await withFamilyGate((db) => sent.record(db as never)).catch(() => {});
      return fail('not_signed_in', 401);
    }
    if (!sent.result.ok) return fail('failed', 503);
    return new Response(Buffer.from(sent.result.audio), {
      status: 200,
      headers: { 'Content-Type': sent.result.mediaType, 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', 'Content-Length': String(sent.result.audio.length), 'Server-Timing': `tts;dur=${genMs}` },
    });
  } catch (err) {
    if (err instanceof FamilySessionRevokedError) return fail('not_signed_in', 401);
    return fail('failed', 503);
  }
}
