import { NextRequest, NextResponse } from 'next/server';
import { accountSummary } from '@/lib/family/account';
import { activeChild, isPrePrimary, listChildren } from '@/lib/family/children';
import { consentState } from '@/lib/family/consent';
import { FamilySessionRevokedError, withFamilyContext } from '@/lib/family/db';
import { familyModuleOn } from '@/lib/family/flags';
import { setting } from '@/lib/family/learning';
import { requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { cleanTranscript, countedSeconds, sniffAudio, VOICE_MAX_BYTES, VOICE_MAX_SECONDS, VOICE_SECONDS_SETTING } from '@/lib/family/voice';
import { prepareTranscription, type PreparedSpeech } from '@/lib/ai/platform';
import { indiaDate } from '@/lib/time/india';

// Voice input (M2-7, C281): POST { audio: <base64 of a WebM, Ogg, MP4 or WAV recording>, seconds: <the phone's timer> }.
// Refused cheaply first (a child of Class 1 or above, the parent's study_core AND voice_practice consent, the
// voice_input module, seconds left today); the container is read from the bytes; the seconds are counted against the
// child's day (Control: family.voice_input_seconds_per_day) and given back when the platform refuses or no provider
// hears it; the recording is read once by the family.voice_input profile with no database connection held (F1-3), then
// dropped: never stored, never logged. The answer is only the words (at most 500 characters, an Aadhaar-like number
// taken out) and the seconds left today.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Db = { query: (sql: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
type Pending = { speech: PreparedSpeech; childId: string; day: string; seconds: number; limit: number; used: number };

const giveBack = (db: Db, accountId: string, childId: string, day: string, seconds: number) =>
  db.query(`update family.day_counts set voice_seconds = greatest(voice_seconds - $4::int, 0) where account_id = $1 and child_id = $2 and day = $3`, [accountId, childId, day, seconds]);

async function secondsUsed(db: Db, accountId: string, childId: string, day: string): Promise<number> {
  const { rows } = await db.query(`select voice_seconds from family.day_counts where account_id = $1 and child_id = $2 and day = $3`, [accountId, childId, day]);
  return Number(rows[0]?.voice_seconds ?? 0);
}

// The refusals that need no recording read: the same in the quick look and in the counting transaction.
async function refusal(db: Db, accountId: string, chosen: string | undefined): Promise<NextResponse | { childId: string; language: 'en' | 'hi'; limit: number }> {
  const child = activeChild(await listChildren(db, accountId), chosen);
  if (!child) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (isPrePrimary(child.classLevel)) return NextResponse.json({ error: 'not_for_class' }, { status: 403 });
  const consents = await consentState(db, accountId);
  if (!consents.study_core || !consents.voice_practice) return NextResponse.json({ error: 'consent_required' }, { status: 403 });
  if (!(await familyModuleOn(db, 'voice_input', accountId))) return NextResponse.json({ error: 'off' }, { status: 403 });
  const limit = Math.max(0, Math.round(await setting(db, VOICE_SECONDS_SETTING, 120)));
  return { childId: child.childId, language: child.language === 'hi' ? 'hi' : 'en', limit };
}

export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const session = g.session;
  const claims = { accountId: session.accountId, tokenVersion: session.tokenVersion };
  const body = (await req.json().catch(() => null)) as { audio?: unknown; seconds?: unknown } | null;
  const b64 = typeof body?.audio === 'string' ? body.audio.replace(/^data:audio\/[a-z0-9.+-]+(;[a-z0-9=.+-]+)*;base64,/i, '') : '';
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return NextResponse.json({ error: 'not_audio' }, { status: 400 });
  if (b64.length > Math.ceil((VOICE_MAX_BYTES * 4) / 3) + 4) return NextResponse.json({ error: 'too_big' }, { status: 413 });
  const seconds = countedSeconds(body?.seconds);
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;

  try {
    // 0. The cheap refusals first, in a short read, before the recording is even decoded.
    const early = await withFamilyContext(claims, async (db): Promise<NextResponse | null> => {
      const r = await refusal(db, session.accountId, chosen);
      if (r instanceof NextResponse) return r;
      const used = await secondsUsed(db, session.accountId, r.childId, indiaDate());
      if (used >= r.limit) return NextResponse.json({ error: 'voice_cap', limit: r.limit, left: 0 }, { status: 429 });
      return null;
    });
    if (early) return early;

    const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
    const mediaType = sniffAudio(bytes);
    if (!mediaType) return NextResponse.json({ error: 'not_audio' }, { status: 400 });

    // 1. The checks again, the seconds counted and the AI platform's own checks, in one short transaction.
    const first = await withFamilyContext(claims, async (db): Promise<Pending | NextResponse> => {
      const r = await refusal(db, session.accountId, chosen);
      if (r instanceof NextResponse) return r;
      const day = indiaDate();
      const taken = await db.query(
        `insert into family.day_counts as d (account_id, child_id, day, voice_seconds) select $1, $2, $3, $5::int where $5::int <= $4::int
         on conflict (child_id, day) do update set voice_seconds = d.voice_seconds + $5::int where d.voice_seconds + $5::int <= $4::int
         returning voice_seconds`,
        [session.accountId, r.childId, day, r.limit, seconds]
      );
      if (taken.rows.length === 0) {
        const left = Math.max(0, r.limit - (await secondsUsed(db, session.accountId, r.childId, day)));
        return NextResponse.json({ error: 'voice_cap', limit: r.limit, left }, { status: 429 });
      }
      const children = await listChildren(db, session.accountId);
      const account = await accountSummary(db, session.accountId);
      const prepared = await prepareTranscription(
        db,
        { accountId: session.accountId, childFirstNames: children.map((c) => c.firstName), parentEmail: account?.email ?? '', day },
        'family.voice_input',
        { audio: bytes, mediaType, language: r.language }
      );
      if (!prepared.ok) {
        await giveBack(db, session.accountId, r.childId, day, seconds);
        return NextResponse.json({ error: `ai_${prepared.reason}` }, { status: 503 });
      }
      return { speech: prepared.speech, childId: r.childId, day, seconds, limit: r.limit, used: Number(taken.rows[0].voice_seconds) };
    });
    if (first instanceof NextResponse) return first;

    // 2. The provider hears the recording, with no database connection held.
    const sent = await first.speech.send();

    // 3. The metering, in a second short transaction; then only the words go back.
    return await withFamilyContext(claims, async (db) => {
      await sent.record(db);
      if (!sent.result.ok) {
        await giveBack(db, session.accountId, first.childId, first.day, first.seconds);
        return NextResponse.json({ error: 'ai_failed' }, { status: 503 });
      }
      const text = cleanTranscript(sent.result.text);
      const left = Math.max(0, first.limit - first.used);
      if (!text) return NextResponse.json({ error: 'not_heard', left, maxSeconds: Math.min(VOICE_MAX_SECONDS, left) }, { status: 422 });
      return NextResponse.json({ text, left, maxSeconds: Math.min(VOICE_MAX_SECONDS, left) });
    });
  } catch (err) {
    if (err instanceof FamilySessionRevokedError) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
    throw err;
  }
}
