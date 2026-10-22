import { NextRequest, NextResponse } from 'next/server';
import { configuredProvider } from '@/lib/ai/provider';
import { schoolProvider } from '@/lib/ai/school-provider';
import { indiaDate } from '@/lib/time/india';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { PARENT_AI_ROLES, draftAnswer, listAnswers } from '@/lib/parent-ai/answers';

// Parent AI v1 (docs/25 slice 7n, C196): "What can I do at home?".
//   GET   the answers this person may see (a teacher: for children of their own classes)
//   POST  { studentId, parentId }  draft one from what the child's class was taught and the child's own homework. Nothing is sent.
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!PARENT_AI_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    return NextResponse.json({ answers: await listAnswers(db, claims.schoolId) }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(b.studentId) || !isUuid(b.parentId)) return ruleError(400, 'not_sent_properly');
    const made = await draftAnswer(db, configuredProvider() ?? (await schoolProvider(db, claims.schoolId, indiaDate(), 'parent_ai.home_help')), { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { studentId: b.studentId as string, parentId: b.parentId as string });
    if (made.ok) return NextResponse.json({ answerId: made.answerId }, { status: 201 });
    return made.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(400, 'no answer was drafted', { code: made.reason });
  });
}
