import { NextRequest, NextResponse } from 'next/server';
import { activeChild, listChildren } from '@/lib/family/children';
import { consentState } from '@/lib/family/consent';
import { checkDone, drawAllowed, listDone, recordDone } from '@/lib/family/draw-done';
import { DRAW_MODULE } from '@/lib/family/draw-templates';
import { familyModuleOn } from '@/lib/family/flags';
import { familyRun, jsonBody, requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';

// A completed drawing template (C514). POST { templateId }: the child's own tap on Done in the studio, kept once per
// child and template (a second Done changes nothing). Only a template in the registry, for the child's class, and, when it
// needs a parent, once the parent has allowed drawing activities. No image, no score and no text is sent or kept. GET:
// the templates this child completed and whether the parent allowed drawing activities, for the Draw tab's cards. The
// child is the one this phone has chosen, never one the body names; the drawing board's switch and the study consent apply.
export const dynamic = 'force-dynamic';

const STATUS = { unknown: 400, wrong_class: 403, locked: 403 } as const;

export async function GET(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const child = activeChild(await listChildren(db, g.session.accountId), chosen);
    if (!child) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!(await familyModuleOn(db, DRAW_MODULE, g.session.accountId))) return NextResponse.json({ error: 'off' }, { status: 403 });
    return NextResponse.json({ done: await listDone(db, g.session.accountId, child.childId), allowed: await drawAllowed(db, g.session.accountId, child.childId) });
  });
}

export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  if (typeof body.templateId !== 'string' || Object.keys(body).length !== 1) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const templateId = body.templateId;
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const child = activeChild(await listChildren(db, g.session.accountId), chosen);
    if (!child) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!(await familyModuleOn(db, DRAW_MODULE, g.session.accountId))) return NextResponse.json({ error: 'off' }, { status: 403 });
    if (!(await consentState(db, g.session.accountId)).study_core) return NextResponse.json({ error: 'consent_required' }, { status: 403 });
    const check = checkDone(templateId, child.classLevel, await drawAllowed(db, g.session.accountId, child.childId));
    if (check !== 'ok') return NextResponse.json({ error: check }, { status: STATUS[check] });
    const kept = await recordDone(db, g.session.accountId, child.childId, templateId);
    return kept ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_ready' }, { status: 503 });
  });
}
