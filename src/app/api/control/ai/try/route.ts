import { NextRequest, NextResponse } from 'next/server';
import { withPlatformService } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { writeAuditLog } from '@/lib/audit/log';
import { prepareTryIt, profileById, type SentTry, type TryResult } from '@/lib/ai/platform';
import { SMOKE_PHOTO_JPEG, SMOKE_SPEECH } from '@/demo-fixture/ai-smoke/inputs';
import { indiaDate } from '@/lib/time/india';

// Control → AI → a feature's "Try it" (W17-B1). POST { profileId }: one live call of that feature's current route with
// made-up inputs (src/lib/ai/try-inputs.ts, the smoke test's fixture photo and WAV recording), never a child's data,
// and the answer shown on the card. The founder (super_admin) only. Not requireAiControl: Try it changes no setting, so
// it does not ask for the authenticator again ("Confirm it is you"), as the key test's reading does not.
// Three steps as every AI call: prepared in one transaction, sent with none held, recorded in the next (counts, ledger
// rows marked 'try_it', and one audit row 'ai.try_it' with the outcome only, never the answer). No key is answered or
// logged, and nothing here logs the request or the answer.
export const dynamic = 'force-dynamic';
// A chain of up to three providers, as a child's call: the family voice routes' own limit.
export const maxDuration = 60;
const NO_STORE = { 'Cache-Control': 'no-store' };

const WAV = SMOKE_SPEECH.find((s) => s.mediaType === 'audio/wav');

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  const profileId = typeof b?.profileId === 'string' && b.profileId.length <= 60 ? b.profileId : null;
  if (!profileId || !profileById(profileId) || !WAV) return NextResponse.json({ error: 'not sent properly', code: 'request' }, { status: 400, headers: NO_STORE });

  const by = guard.claims.sub;
  // Control's own call: the founder's id stands where a family's account would, and no child's name is in it.
  const ctx = { accountId: by, childFirstNames: [], day: indiaDate() };
  const prepared = await withPlatformService((db) => prepareTryIt(db, ctx, profileId, { photoJpegBase64: SMOKE_PHOTO_JPEG, speechWavBase64: WAV.base64 }));
  let sent: SentTry | null = null;
  let result: TryResult;
  if (prepared.ok) {
    sent = await prepared.send();
    result = sent.result;
  } else result = prepared.result;
  await withPlatformService(async (db) => {
    await sent?.record(db);
    await writeAuditLog(db, {
      schoolId: null,
      actorUserId: by,
      actorRole: 'super_admin',
      eventAction: 'ai.try_it',
      targetType: 'ai_profile',
      targetId: profileId,
      afterState: { profileId, provider: result.provider, model: result.model, ok: result.ok, ms: result.ms, backupUsed: result.backupUsed, ...(result.failure ? { failure: result.failure } : {}) },
    });
  });
  return NextResponse.json(result, { headers: NO_STORE });
}
