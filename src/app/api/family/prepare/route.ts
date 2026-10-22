import { NextRequest, NextResponse } from 'next/server';
import { NO_STORE, isVersionId, requireContentStaff } from '@/lib/content/route';
import { asLiveStaff } from '@/lib/control/billing-route';
import { prepareChapters, prepareNext, prepareState, type Run } from '@/lib/family/prepare';

// Explanations prepared before children ask (P1 slice 3, C300), for Control → Content → Responses. NetCyberAI staff
// only, signed in with their authenticator; every transaction runs as the platform role and checks the account live.
//   GET  ?version=<id>         how many of the version's lines × English and Hindi are checked, AI-made or missing
//   POST { versionId }         make the next missing one (one per call), then the same counts
// Both take the chapters to work on (C316: ?chapters=a,b / chapterKeys: [...]); none means the whole version. GET also
// lists the version's chapters to choose from.
export const dynamic = 'force-dynamic';
// One explanation, answered whole (C322), can take over a minute (C323).
export const maxDuration = 300;

class Refused extends Error {
  constructor(readonly res: NextResponse) {
    super('refused');
  }
}

// Chapter keys as the catalog writes them; at most 40.
const CHAPTER_KEY = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const chapterKeys = (v: unknown): string[] | null => (Array.isArray(v) && v.length <= 40 && v.every((k) => typeof k === 'string' && CHAPTER_KEY.test(k)) ? (v as string[]) : null);

export async function GET(req: NextRequest) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const versionId = req.nextUrl.searchParams.get('version');
  if (!isVersionId(versionId)) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: NO_STORE });
  const chapters = chapterKeys((req.nextUrl.searchParams.get('chapters') ?? '').split(',').filter(Boolean));
  if (!chapters) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: NO_STORE });
  const run = await asLiveStaff(guard.claims, async (db) => ({ state: await prepareState(db, versionId, { chapterKeys: chapters }), chapters: await prepareChapters(db, versionId) }));
  if ('refused' in run) return run.refused;
  return run.value.state ? NextResponse.json(run.value, { headers: NO_STORE }) : NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  const chapters = chapterKeys(b?.chapterKeys ?? []);
  if (!isVersionId(b?.versionId) || !chapters) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: NO_STORE });
  const run: Run = async (fn) => {
    const r = await asLiveStaff(guard.claims, fn as never);
    if ('refused' in r) throw new Refused(r.refused);
    return r.value as never;
  };
  try {
    const result = await prepareNext(run, { userId: guard.claims.sub }, b.versionId, { chapterKeys: chapters });
    return result ? NextResponse.json(result, { headers: NO_STORE }) : NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  } catch (err) {
    if (err instanceof Refused) return err.res;
    throw err;
  }
}
