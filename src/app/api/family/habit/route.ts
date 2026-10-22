import { NextRequest, NextResponse } from 'next/server';
import { activeChild, listChildren } from '@/lib/family/children';
import { consentState } from '@/lib/family/consent';
import { familyModuleOn } from '@/lib/family/flags';
import { childHabit, createJar, giveJar, removeJar, setGoal, type HabitProblem } from '@/lib/family/habit';
import { familyRun, jsonBody, requireFamily, requireParent } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { indiaDate } from '@/lib/time/india';

// The habit pieces (M2-3, C277). GET is the child's view: this week's plan days against the goal, the mastered-topic
// badges and the open jar. The changes are the parent's, in parent mode: the weekly goal, and the jar (set, given,
// removed). The jar fills only here and in the pages, from plan days; nothing a phone sends fills it.
export const dynamic = 'force-dynamic';

const STATUS: Record<HabitProblem, number> = { goal_bad: 400, reward_bad: 400, target_bad: 400, jar_exists: 409, jar_not_full: 409, jar_full: 409, not_found: 404 };
const answer = (r: 'ok' | HabitProblem) => (r === 'ok' ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r }, { status: STATUS[r] }));

export async function GET(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const child = activeChild(await listChildren(db, g.session.accountId), chosen);
    if (!child) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!(await consentState(db, g.session.accountId)).study_core) return NextResponse.json({ error: 'consent_required' }, { status: 403 });
    if (!(await familyModuleOn(db, 'habit', g.session.accountId))) return NextResponse.json({ error: 'off' }, { status: 403 });
    return NextResponse.json(await childHabit(db, g.session.accountId, child, indiaDate(), child.language));
  });
}

// Runs a parent's change on one of this account's children (an unknown child answers 404).
async function parentChange(req: NextRequest, run: (db: Parameters<Parameters<typeof familyRun>[1]>[0], accountId: string, childId: string, body: Record<string, unknown>) => Promise<'ok' | HabitProblem>) {
  const body = await jsonBody(req);
  const g = await requireParent(req);
  if (g.error) return g.error;
  if (typeof body.childId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.childId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const childId = body.childId;
  return familyRun(g.session, async (db) => {
    if (!(await consentState(db, g.session.accountId)).study_core) return NextResponse.json({ error: 'consent_required' }, { status: 409 });
    if (!(await familyModuleOn(db, 'habit', g.session.accountId))) return NextResponse.json({ error: 'off' }, { status: 403 });
    return answer(await run(db, g.session.accountId, childId, body));
  });
}

// Set the reward jar: { childId, reward, targetDays }.
export const POST = (req: NextRequest) => parentChange(req, (db, a, c, b) => createJar(db, a, c, b.reward, b.targetDays, indiaDate()));

// Change the weekly goal { childId, goal } or mark the reward given { childId, given: true }.
export const PATCH = (req: NextRequest) =>
  parentChange(req, (db, a, c, b) => (b.given === true ? giveJar(db, a, c, indiaDate()) : setGoal(db, a, c, b.goal)));

// Remove an unfilled jar: { childId }.
export const DELETE = (req: NextRequest) => parentChange(req, (db, a, c) => removeJar(db, a, c, indiaDate()));
