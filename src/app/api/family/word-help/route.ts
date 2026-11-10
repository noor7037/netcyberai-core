import { NextRequest, NextResponse } from 'next/server';
import { accountSummary } from '@/lib/family/account';
import { listChildren } from '@/lib/family/children';
import { loadChildSettings } from '@/lib/family/child-settings';
import { familyRun, jsonBody, requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { tutorChild } from '@/lib/family/tutor';
import { askWordHelp, checkWordHelpBody } from '@/lib/family/word-help';
import { indiaDate } from '@/lib/time/india';

// W23-B (C494): word help. POST { text (1 to 200 characters), context? (the sentence it came from, at most 400), to } gives
// { meaning, translation, lang }: what the tapped word or sentence means here, and the text itself, both written in the
// language `to` (the child's meaning language; the phone sends it, so `meaning` is in `to` as well, never in a third
// language). The child is the one this phone chose; the child's `wordHelp` setting off answers 403 'off'. The same text
// in the same language is answered from the shared cache; a fresh one takes a place from the family's own word-help
// allowance (not the tutor's) and goes through the gateway (src/lib/family/word-help.ts).
export const dynamic = 'force-dynamic';

const STATUS = { bad_request: 400, daily_limit: 429, failed: 502 } as const;

export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const input = checkWordHelpBody(await jsonBody(req));
  if (!input) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const who = await tutorChild(db, g.session.accountId, chosen);
    if (!who.ok) return NextResponse.json({ error: 'off' }, { status: 403 });
    if (!(await loadChildSettings(db, g.session.accountId, who.child.childId)).wordHelp) return NextResponse.json({ error: 'off' }, { status: 403 });
    const children = await listChildren(db, g.session.accountId);
    const ai = { accountId: g.session.accountId, childFirstNames: children.map((c) => c.firstName), parentEmail: (await accountSummary(db, g.session.accountId))?.email ?? '', day: indiaDate() };
    const done = await askWordHelp(db, ai, who.child.classLevel, input);
    if (!done.ok) return NextResponse.json({ error: done.error }, { status: STATUS[done.error] });
    return NextResponse.json({ meaning: done.answer.meaning, translation: done.answer.translation, lang: input.to }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
