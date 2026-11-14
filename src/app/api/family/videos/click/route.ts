import { NextRequest, NextResponse } from 'next/server';
import { activeChild, listChildren } from '@/lib/family/children';
import { consentState } from '@/lib/family/consent';
import { familyModuleOn } from '@/lib/family/flags';
import { familyRun, jsonBody, requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { checkClick, recordClick } from '@/lib/family/video-clicks';
import { indiaDate } from '@/lib/time/india';

// C522: "See video". POST { topicKey, videoId, lang } → { embed } for the child this phone has chosen (never one the body
// names, so only a child of the signed-in account). Counted once per tap per child, video and day, and only for a
// video the cache offered for that topic and language; an unknown id is refused (404) and plays nothing. Needs the
// parent's study_core consent and Control's `videos` module, as the finder does; a child's taps a day are capped (429).
export const dynamic = 'force-dynamic';

const STATUS = { unknown: 404, too_many: 429, not_ready: 503 } as const;
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const click = checkClick(await jsonBody(req));
  if (!click) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const child = activeChild(await listChildren(db, g.session.accountId), chosen);
    if (!child) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!(await consentState(db, g.session.accountId)).study_core) return NextResponse.json({ error: 'consent_required' }, { status: 403 });
    if (!(await familyModuleOn(db, 'videos', g.session.accountId))) return NextResponse.json({ error: 'off' }, { status: 403 });
    const r = await recordClick(db, g.session.accountId, child.childId, click, indiaDate());
    if (!r.ok) return NextResponse.json({ error: r.reason }, { status: STATUS[r.reason], headers: NO_STORE });
    return NextResponse.json({ embed: r.embed }, { headers: NO_STORE });
  });
}
