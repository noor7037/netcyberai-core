import { NextRequest, NextResponse } from 'next/server';
import { accountSummary } from '@/lib/family/account';
import type { FamilyChild } from '@/lib/family/children';
import { FamilySessionRevokedError, withFamilyContext, familyClaims } from '@/lib/family/db';
import { requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { cleanTranscript, countedSeconds, giveBackVoiceSeconds, leastSeconds, sniffAudio, takeVoiceSeconds, voiceDay, VOICE_MAX_BYTES, VOICE_MAX_SECONDS } from '@/lib/family/voice';
import { prepareTranscription, type PreparedSpeech } from '@/lib/ai/platform';
import { indiaDate } from '@/lib/time/india';

// A spoken recording turned into words (M2-7, C281), shared by Study's voice input (/api/family/voice) and the live
// English tutor (/api/family/english/live/hear, E1, C382). Each caller gives its own refusals (`gate`: the child, the
// consents, the switch); everything after is one path: the container read from the bytes, the seconds counted against
// the child's day and given back when nothing is heard, the recording read once by the family.voice_input profile with
// no database connection held (F1-3) and then dropped, never stored, never logged. Only the words go back.

// The JSON body can be no bigger than the recording's base64 and a few words around it.
const MAX_BODY = Math.ceil((VOICE_MAX_BYTES * 4) / 3) + 1024;

type Db = { query: (sql: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
type Pending = { speech: PreparedSpeech; childId: string; day: string; seconds: number; left: number };
export type VoiceAllowed = { child: FamilyChild; children: FamilyChild[]; language: 'en' | 'hi' };
export type VoiceGate = (db: Db, accountId: string, chosen: string | undefined) => Promise<NextResponse | VoiceAllowed>;

const capped = (limit: number, left: number) => NextResponse.json({ error: 'voice_cap', limit, left, maxSeconds: Math.min(VOICE_MAX_SECONDS, left) }, { status: 429 });

export async function hearVoice(req: NextRequest, refusal: VoiceGate): Promise<NextResponse> {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const session = g.session;
  const claims = familyClaims(session);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return NextResponse.json({ error: 'too_big' }, { status: 413 });
  const raw = await req.text().catch(() => '');
  if (raw.length > MAX_BODY) return NextResponse.json({ error: 'too_big' }, { status: 413 });
  let body: { audio?: unknown; seconds?: unknown } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  const b64 = typeof body?.audio === 'string' ? body.audio.replace(/^data:audio\/[a-z0-9.+-]+(;[a-z0-9=.+-]+)*;base64,/i, '') : '';
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return NextResponse.json({ error: 'not_audio' }, { status: 400 });
  if (b64.length > Math.ceil((VOICE_MAX_BYTES * 4) / 3) + 4) return NextResponse.json({ error: 'too_big' }, { status: 413 });
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;

  try {
    // 0. The cheap refusals first, in a short read, before the recording is even decoded.
    const early = await withFamilyContext(claims, async (db): Promise<NextResponse | null> => {
      const r = await refusal(db, session.accountId, chosen);
      if (r instanceof NextResponse) return r;
      const d = await voiceDay(db, session.accountId, r.child.childId, indiaDate());
      return d.left < 1 ? capped(d.limit, 0) : null;
    });
    if (early) return early;

    const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
    const mediaType = sniffAudio(bytes);
    if (!mediaType) return NextResponse.json({ error: 'not_audio' }, { status: 400 });
    const seconds = Math.max(countedSeconds(body?.seconds), leastSeconds(bytes, mediaType));

    // 1. The checks again, the seconds counted and the AI platform's own checks, in one short transaction.
    const first = await withFamilyContext(claims, async (db): Promise<Pending | NextResponse> => {
      const r = await refusal(db, session.accountId, chosen);
      if (r instanceof NextResponse) return r;
      const day = indiaDate();
      const d = await voiceDay(db, session.accountId, r.child.childId, day);
      const used = await takeVoiceSeconds(db, session.accountId, r.child.childId, day, seconds, d.limit);
      if (used === null) return capped(d.limit, d.left);
      const account = await accountSummary(db, session.accountId);
      const prepared = await prepareTranscription(
        db,
        { accountId: session.accountId, childFirstNames: r.children.map((c) => c.firstName), parentEmail: account?.email ?? '', day },
        'family.voice_input',
        { audio: bytes, mediaType, language: r.language }
      );
      if (!prepared.ok) {
        await giveBackVoiceSeconds(db, session.accountId, r.child.childId, day, seconds);
        return NextResponse.json({ error: `ai_${prepared.reason}` }, { status: 503 });
      }
      return { speech: prepared.speech, childId: r.child.childId, day, seconds, left: Math.max(0, d.limit - used) };
    });
    if (first instanceof NextResponse) return first;

    // 2. The provider hears the recording, with no database connection held.
    const sent = await first.speech.send();

    // 3. The metering, in a second short transaction; then only the words go back.
    return await withFamilyContext(claims, async (db) => {
      await sent.record(db);
      const text = sent.result.ok ? cleanTranscript(sent.result.text) : '';
      if (!text) {
        // Nothing usable heard: the seconds are given back (the AI request stays counted).
        await giveBackVoiceSeconds(db, session.accountId, first.childId, first.day, first.seconds);
        const left = first.left + first.seconds;
        return NextResponse.json({ error: sent.result.ok ? 'not_heard' : 'ai_failed', left, maxSeconds: Math.min(VOICE_MAX_SECONDS, left) }, { status: sent.result.ok ? 422 : 503 });
      }
      return NextResponse.json({ text, left: first.left, maxSeconds: Math.min(VOICE_MAX_SECONDS, first.left) });
    });
  } catch (err) {
    if (err instanceof FamilySessionRevokedError) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
    throw err;
  }
}
