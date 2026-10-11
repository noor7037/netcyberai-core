import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { assignmentRoster, setCompletion } from '@/lib/homework/homework';

// One assignment (a homework as given to one section; C150).
//   GET  its students with done / not done, and the homework's files
//   PUT  save done / not done for the students sent
export async function GET(req: NextRequest, { params }: { params: { targetId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.targetId)) return ruleError(400, 'not_sent_properly');
    const found = await assignmentRoster(db, claims.schoolId, params.targetId);
    return found ? NextResponse.json(found) : jsonError(404, 'not found', { code: 'not_found' });
  });
}

export async function PUT(req: NextRequest, { params }: { params: { targetId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    const entries = Array.isArray(body?.entries) ? (body.entries as { studentId?: unknown; done?: unknown }[]) : null;
    if (!isUuid(params.targetId) || !entries || entries.length > 500 || !entries.every((e) => isUuid(e?.studentId) && typeof e?.done === 'boolean')) return ruleError(400, 'not_sent_properly');
    const result = await setCompletion(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.targetId, entries as { studentId: string; done: boolean }[]);
    if (result.ok) return NextResponse.json(result);
    return result.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(404, 'not found', { code: 'not_found' });
  });
}
