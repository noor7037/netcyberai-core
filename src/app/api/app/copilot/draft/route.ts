import { NextRequest, NextResponse } from 'next/server';
import { DRAFT_KINDS, configuredProvider } from '@/lib/ai/provider';
import { schoolProvider } from '@/lib/ai/school-provider';
import { indiaDate } from '@/lib/time/india';
import { copilotState, draft } from '@/lib/copilot/copilot';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { accessDenied, appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';

// Teacher Copilot v1 (docs/20 5h, C154).
//   GET   whether Copilot is on for this school, and this month's use against the limit
//   POST  a draft from one topic of the syllabus map. The draft is returned, not stored.
// The provider is the AI platform's copilot.draft profile, chosen in Control → AI (M2-10, C284); the stand-in only
// outside production, when asked for.
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, 'teacher-copilot');
    if (!access.ok) return access.error === 'module_not_enabled' ? NextResponse.json({ on: false, why: 'module_off' }) : accessDenied(access);
    return NextResponse.json(await copilotState(db, claims.schoolId, configuredProvider() ?? (await schoolProvider(db, claims.schoolId, indiaDate(), 'copilot.draft'))));
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    // The module's own switch, with the read-only rule (the access guard leaves this route to it).
    const access = await checkModuleAccess(db, claims, 'teacher-copilot', { write: true });
    if (!access.ok) return accessDenied(access);
    const body = await readJson(req);
    const kind = DRAFT_KINDS.find((k) => k === body?.kind);
    if (!kind || !isUuid(body?.classId) || !isUuid(body?.subjectId) || !isUuid(body?.unitId)) return ruleError(400, 'not_sent_properly');
    const result = await draft(db, configuredProvider() ?? (await schoolProvider(db, claims.schoolId, indiaDate(), 'copilot.draft')), { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { kind, classId: body.classId as string, subjectId: body.subjectId as string, unitId: body.unitId as string, minutes: typeof body.minutes === 'number' ? body.minutes : undefined, questions: typeof body.questions === 'number' ? body.questions : undefined });
    if (result.ok) return NextResponse.json({ text: result.text, used: result.used, limit: result.limit });
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (result.reason === 'off') return jsonError(409, 'Copilot is not switched on for this school', { code: 'off', why: result.why });
    if (result.reason === 'over_limit') return jsonError(429, 'this month’s Copilot limit for the school is used up', { code: 'over_limit' });
    return jsonError(404, 'that topic is not on a syllabus map you can use', { code: result.reason });
  });
}
