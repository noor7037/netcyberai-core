import { NextRequest, NextResponse } from 'next/server';
import { accountSummary } from '@/lib/family/account';
import { consentState } from '@/lib/family/consent';
import { pinProblem, setPin } from '@/lib/family/pin';
import { familyRun, jsonBody, requireFamily } from '@/lib/family/request';
import { FAMILY_PARENT_COOKIE, FAMILY_PARENT_TTL_SECONDS, familyCookieOptions, signParentMode } from '@/lib/family/session';

// Set the parent PIN at sign-up (docs/34 §9.1 rule 1). Only once: a PIN that exists is changed only through the reset
// by email code. Setting it opens parent mode for the rest of sign-up (adding the first child).
export async function POST(req: NextRequest) {
  const pin = (await jsonBody(req)).pin;
  const problem = pinProblem(pin);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const g = await requireFamily(req);
  if (g.error) return g.error;
  // The parent's PIN is never used on a child's own phone (C342): the parent area is on the parent's phone.
  if (g.session.device) return NextResponse.json({ error: 'child_phone' }, { status: 403 });
  return familyRun(g.session, async (db) => {
    if (!(await consentState(db, g.session.accountId)).study_core) return NextResponse.json({ error: 'consent_required' }, { status: 409 });
    if ((await accountSummary(db, g.session.accountId))?.hasPin) return NextResponse.json({ error: 'pin_exists' }, { status: 409 });
    await setPin(db, g.session.accountId, String(pin));
    const res = NextResponse.json({ status: 'set' });
    res.cookies.set(FAMILY_PARENT_COOKIE, await signParentMode(g.session), familyCookieOptions(FAMILY_PARENT_TTL_SECONDS));
    return res;
  });
}
