import { NextRequest, NextResponse } from 'next/server';
import { callGate } from '@/lib/family/call-gate';
import { FamilySessionRevokedError, withFamilyContext, withFamilyGate, familyClaims } from '@/lib/family/db';
import { familyModuleOn } from '@/lib/family/flags';
import { liveAiContext } from '@/lib/family/english/live';
import { requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { voiceDay } from '@/lib/family/voice';
import { prepareRealtimeToken, type PreparedRealtime } from '@/lib/ai/platform';
import { indiaDate } from '@/lib/time/india';

// The call's realtime leg (W16-A4): POST → a short-lived client token for the provider Control chose for
// `family.voice_call`, with the provider's connect details, so the phone opens a live two-way voice straight to the
// provider. The audio never goes through this server (or Vercel); only this token does, and it expires in about a
// minute. Behind the call's gate (call-gate.ts: Class 1 up, the parent's study and voice consents, the voice module) and
// the child's speaking time for the day (the same seconds cap as the microphone). With no provider set up, or none with a
// realtime voice, the answer is 503 `{ error: 'not_switched_on' }` and the phone uses the chain (listen, answer, speak).
// A refusal reads the same on every path, so the screen never says why a provider is missing. No database connection is
// held while the provider mints (F1-3). The token is never cached, stored or logged.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const session = g.session;
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  const claims = familyClaims(session);
  try {
    const plan = await withFamilyContext(claims, async (db): Promise<Extract<PreparedRealtime, { ok: true }> | NextResponse> => {
      if (!(await familyModuleOn(db, 'tutor_call', session.accountId))) return fail('off', 403);
      const call = await callGate(db, session.accountId, chosen);
      if (!call.ok) return fail(call.error, call.status);
      const day = await voiceDay(db, session.accountId, call.child.childId, indiaDate());
      if (day.left < 1) return fail('voice_cap', 429, { limit: day.limit, left: 0, maxSeconds: 0 });
      const ctx = await liveAiContext(db, session.accountId, call.children.map((c) => c.firstName));
      const prepared = await prepareRealtimeToken(db, ctx, 'family.voice_call', { language: call.language, maxSeconds: day.left });
      if (prepared.ok) return prepared;
      if (prepared.reason === 'cap_reached') return fail('ai_cap_reached', 429);
      // Not set up, not cleared, not capable: all one answer, and the phone uses the chain.
      return fail(prepared.reason === 'failed' ? 'failed' : 'not_switched_on', 503);
    });
    if (plan instanceof NextResponse) return plan;
    const sent = await plan.session.send();
    try {
      await withFamilyContext(claims, (db) => sent.record(db));
    } catch (err) {
      if (!(err instanceof FamilySessionRevokedError)) throw err;
      await withFamilyGate((db) => sent.record(db as never)).catch(() => {});
      return fail('not_signed_in', 401);
    }
    if (!sent.result.ok) return fail('failed', 503);
    const { provider, token, expiresAt, url, model } = sent.result.grant;
    return NextResponse.json({ provider, token, expiresAt, url, model }, { status: 200, headers: { 'Cache-Control': 'no-store, private' } });
  } catch (err) {
    if (err instanceof FamilySessionRevokedError) return fail('not_signed_in', 401);
    return fail('failed', 503);
  }
}
