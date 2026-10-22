import { NextRequest, NextResponse } from 'next/server';
import { openSubjects } from '@/lib/family/learning';
import { activeChild, listChildren } from '@/lib/family/children';
import { consentState } from '@/lib/family/consent';
import { familyModuleOn } from '@/lib/family/flags';
import { isSubject } from '@/lib/family/subjects';
import { chapterPacks } from '@/lib/family/pack';
import { familyRun, requireFamily } from '@/lib/family/request';
import { syllabusLine } from '@/lib/family/resolver';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';

// An offline chapter pack (M2-9, C283): GET ?chapter=<key> for the active child. Needs the parent's study_core consent,
// the `offline` and `understand` modules switched on, and the chapter's subject already the child's free subject (a
// download never claims one: the first subject a child studies in Understand becomes the free one). The pack is the library's responses only (no AI call), with its items
// sealed for the pack's life, and says its size in bytes. Never cached on the way: it carries this child's tokens.
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const key = req.nextUrl.searchParams.get('chapter') ?? '';
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const child = activeChild(await listChildren(db, g.session.accountId), chosen);
    if (!child) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
    if (!(await consentState(db, g.session.accountId)).study_core) return NextResponse.json({ error: 'consent_required' }, { status: 403, headers: NO_STORE });
    // A pack is Understand's responses, so it needs Understand switched on too.
    if (!(await familyModuleOn(db, 'offline', g.session.accountId)) || !(await familyModuleOn(db, 'understand', g.session.accountId))) return NextResponse.json({ error: 'not_switched_on' }, { status: 403, headers: NO_STORE });
    const line = await syllabusLine(db, child, { kind: 'chapter', key });
    if (!line || !isSubject(line.subject)) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
    // The child's free subject, or one Control opens to every child (C298); a pack never claims a subject.
    if (child.freeSubject !== line.subject && !(await openSubjects(db)).includes(line.subject)) return NextResponse.json({ error: 'not_open' }, { status: 403, headers: NO_STORE });
    const [pack] = await chapterPacks(db, { accountId: g.session.accountId, child }, line.subject, { chapterKeys: [line.key] });
    if (!pack) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
    return NextResponse.json(pack, { headers: NO_STORE });
  });
}
