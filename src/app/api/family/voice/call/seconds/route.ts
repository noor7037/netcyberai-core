import { NextRequest, NextResponse } from 'next/server';
import { callGate } from '@/lib/family/call-gate';
import { withFamilyContext, familyClaims, FamilySessionRevokedError } from '@/lib/family/db';
import { familyModuleOn } from '@/lib/family/flags';
import { jsonBody, requireFamily } from '@/lib/family/request';
import { LIVE_SECONDS_PIECE } from '@/lib/family/realtime-frames';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { takeVoiceSeconds, voiceDay } from '@/lib/family/voice';
import { indiaDate } from '@/lib/time/india';

// The live call's speaking seconds (W19-B, B2): POST { seconds } from the phone while its live voice is open, at most 30
// at a time, so the live leg spends the child's day exactly like the chain does (family.day_counts.voice_seconds, the
// voice route's own cap). The audio goes to the provider, never here; only the count does. Behind the call's gate. The
// answer is the seconds left; 429 voice_cap when they would not fit, and the phone then closes the live voice. A piece
// that does not fit whole takes what is left, so the last seconds of the day are spent, not lost.
export const dynamic = 'force-dynamic';

const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const session = g.session;
  const raw = (await jsonBody(req)).seconds;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > LIVE_SECONDS_PIECE) return reply({ error: 'bad_request' }, 400);
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  try {
    return await withFamilyContext(familyClaims(session), async (db) => {
      if (!(await familyModuleOn(db, 'tutor_call', session.accountId))) return reply({ error: 'off' }, 403);
      const call = await callGate(db, session.accountId, chosen);
      if (!call.ok) return reply({ error: call.error }, call.status);
      const day = indiaDate();
      const d = await voiceDay(db, session.accountId, call.child.childId, day);
      const seconds = Math.min(raw, d.left);
      if (seconds < 1) return reply({ error: 'voice_cap', left: 0 }, 429);
      const used = await takeVoiceSeconds(db, session.accountId, call.child.childId, day, seconds, d.limit);
      if (used === null) return reply({ error: 'voice_cap', left: 0 }, 429);
      return reply({ left: Math.max(0, d.limit - used) });
    });
  } catch (err) {
    if (err instanceof FamilySessionRevokedError) return reply({ error: 'not_signed_in' }, 401);
    return reply({ error: 'failed' }, 503);
  }
}
