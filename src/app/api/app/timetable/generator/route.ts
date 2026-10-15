import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { MAX_PERIODS } from '@/lib/timetable/plan';
import { discardDraft, draftView, generatorInPlan, generatorNames, PLANNERS, propose, publishDraft, readConstraints, swapInDraft } from '@/lib/timetable/generator-store';

// The timetable generator (docs/28 slice 10f, C229), for the office (principal, school admin, academic coordinator).
// A part of the plan ('timetable-generator'): a school whose plan does not have it is refused here.
//   GET                                               the constraints, the names, and the draft beside the timetable in force
//   POST { action: 'propose' }                        run the generator; its week becomes the school's draft (refused,
//                                                     'no_consecutive_limit', until the school sets that limit: C231)
//   POST { action: 'swap', proposalId, classId, a, b } swap two periods of a class in the draft (a, b: { weekday, period })
//   POST { action: 'publish', proposalId, withMissing } publish the draft into the timetable, in one transaction
//   POST { action: 'discard', proposalId }            discard the draft

const at = (v: unknown) => {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  const weekday = o.weekday;
  const period = o.period;
  return Number.isInteger(weekday) && (weekday as number) >= 1 && (weekday as number) <= 7 && Number.isInteger(period) && (period as number) >= 1 && (period as number) <= MAX_PERIODS ? { weekday: weekday as number, period: period as number } : null;
};

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await generatorInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed'); // a part of the plan (C226)
    if (!PLANNERS.includes(claims.role)) return ruleError(403, 'not_allowed');
    const [constraints, names, draft] = [await readConstraints(db, claims.schoolId), await generatorNames(db, claims.schoolId), await draftView(db, claims.schoolId)];
    return NextResponse.json(
      { ...constraints, names, draft, mayEditSettings: claims.role === 'principal' || claims.role === 'school_admin' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await generatorInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed');
    if (!PLANNERS.includes(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    if (body?.action === 'propose') {
      const made = await propose(db, actor);
      // no_consecutive_limit (C231): the school has not set the most periods in a row for one teacher; the screen links to it.
      if (!made.ok) return jsonError(400, made.reason === 'no_consecutive_limit' ? 'set the most periods in a row for one teacher in Settings first' : 'there is nothing to plan yet', { code: made.reason });
      return NextResponse.json(made, { status: 201 });
    }
    if (!isUuid(body?.proposalId)) return ruleError(400, 'not_sent_properly');
    const proposalId = body!.proposalId as string;
    if (body!.action === 'swap') {
      const a = at(body!.a);
      const b = at(body!.b);
      if (!isUuid(body!.classId) || !a || !b) return ruleError(400, 'not_sent_properly');
      const swapped = await swapInDraft(db, actor, proposalId, body!.classId as string, a, b);
      if (swapped.ok) return NextResponse.json({ swapped: true });
      if (swapped.reason === 'not_found') return ruleError(404, 'not_found');
      return jsonError(409, 'these two periods cannot be swapped', { code: swapped.reason, with: swapped.with ?? null });
    }
    if (body!.action === 'publish') {
      if (body!.withMissing !== undefined && typeof body!.withMissing !== 'boolean') return ruleError(400, 'not_sent_properly');
      const published = await publishDraft(db, actor, proposalId, { withMissing: body!.withMissing === true });
      if (published.ok) return NextResponse.json(published);
      if (published.reason === 'not_found') return ruleError(404, 'not_found');
      return jsonError(409, 'the proposal was not published; the timetable is as it was', { code: published.reason, problems: 'problems' in published ? published.problems ?? [] : [], clash: 'clash' in published ? published.clash ?? null : null });
    }
    if (body!.action === 'discard') {
      if (!(await discardDraft(db, actor, proposalId))) return ruleError(404, 'not_found');
      return NextResponse.json({ discarded: true });
    }
    return ruleError(400, 'not_sent_properly');
  });
}
