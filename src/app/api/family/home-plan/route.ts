import { familyClaims } from '@/lib/family/db';
import { NextRequest, NextResponse } from 'next/server';
import { listChildren } from '@/lib/family/children';
import { consentState } from '@/lib/family/consent';
import { familyModuleOn } from '@/lib/family/flags';
import { noteFollowupAsked, plusOpen, startHomePlan, stopHomePlan } from '@/lib/family/home-plan';
import { familyRead, familyRun, jsonBody, requireParent } from '@/lib/family/request';
import { activeLinks, askSchoolFollowup } from '@/lib/family/school';
import { indiaDate } from '@/lib/time/india';

// The home plan after a parent-teacher meeting (M3-7, C337; R5, Plus). The parent's, in parent mode, for one of the
// account's children. Body: { action, childId, ... }:
//   start     { topics: [topic keys, 1 to 7], note?: string }  a new 14-night plan from tonight; the open one stops
//   stop      the open plan stops (the answers stay)
//   followup  "Ask the teacher to follow up": for a child matched to a connected school, the school's own follow-up
//             queue, as the guardian; the school's consent for messages decides (no_consent otherwise)
// Used only while the module is switched on and Control has opened Family Plus (family.plus_open; no checkout until P3).
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  const action = body.action === 'start' || body.action === 'stop' || body.action === 'followup' ? body.action : null;
  if (!action || typeof body.childId !== 'string' || !UUID.test(body.childId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const childId = body.childId;
  const accountId = g.session.accountId;
  if (action !== 'followup') {
    return familyRun(g.session, async (db) => {
      if (!(await consentState(db, accountId)).study_core) return NextResponse.json({ error: 'consent_required' }, { status: 409 });
      if (!(await familyModuleOn(db, 'home_plan', accountId)) || !(await plusOpen(db))) return NextResponse.json({ error: 'off' }, { status: 403 });
      const child = (await listChildren(db, accountId)).find((c) => c.childId === childId);
      if (!child) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      if (action === 'stop') return (await stopHomePlan(db, accountId, childId)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
      const r = await startHomePlan(db, accountId, child, { topics: body.topics, note: body.note }, indiaDate());
      return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.reason }, { status: r.reason === 'not_found' ? 404 : 400 });
    });
  }
  // The follow-up: the family's own checks first, then the school's door (one connection at a time), then the plan
  // remembers that the school has it.
  const ready = await familyRead(g.session, async (db) => {
    if (!(await familyModuleOn(db, 'home_plan', accountId)) || !(await plusOpen(db))) return 'off' as const;
    const open = (await db.query(`select 1 from family.home_plans where account_id = $1 and child_id = $2 and stopped_at is null`, [accountId, childId])).rows[0];
    return open ? { links: await activeLinks(db, accountId) } : ('not_found' as const);
  });
  if (!ready) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  if (ready === 'off') return NextResponse.json({ error: 'off' }, { status: 403 });
  if (ready === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const result = await askSchoolFollowup(familyClaims(g.session), ready.links, childId);
  if (result === 'recorded' || result === 'already') {
    await familyRead(g.session, (db) => noteFollowupAsked(db, accountId, childId));
    return NextResponse.json({ ok: true, already: result === 'already' });
  }
  return NextResponse.json({ error: result }, { status: result === 'not_found' ? 404 : 409 });
}
