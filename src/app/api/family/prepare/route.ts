import { NextRequest, NextResponse } from 'next/server';
import { NO_STORE, isVersionId, requireContentStaff } from '@/lib/content/route';
import { asLiveStaff } from '@/lib/control/billing-route';
import { prepareNext, prepareState, type Run } from '@/lib/family/prepare';

// Explanations prepared before children ask (P1 slice 3, C300), for Control → Content → Responses. NetCyberAI staff
// only, signed in with their authenticator; every transaction runs as the platform role and checks the account live.
//   GET  ?version=<id>         how many of the version's lines × English and Hindi are checked, AI-made or missing
//   POST { versionId }         make the next missing one (one per call), then the same counts
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

class Refused extends Error {
  constructor(readonly res: NextResponse) {
    super('refused');
  }
}

export async function GET(req: NextRequest) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const versionId = req.nextUrl.searchParams.get('version');
  if (!isVersionId(versionId)) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: NO_STORE });
  const run = await asLiveStaff(guard.claims, (db) => prepareState(db, versionId));
  if ('refused' in run) return run.refused;
  return run.value ? NextResponse.json({ state: run.value }, { headers: NO_STORE }) : NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  if (!isVersionId(b?.versionId)) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: NO_STORE });
  const run: Run = async (fn) => {
    const r = await asLiveStaff(guard.claims, fn as never);
    if ('refused' in r) throw new Refused(r.refused);
    return r.value as never;
  };
  try {
    const result = await prepareNext(run, { userId: guard.claims.sub }, b.versionId);
    return result ? NextResponse.json(result, { headers: NO_STORE }) : NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  } catch (err) {
    if (err instanceof Refused) return err.res;
    throw err;
  }
}
