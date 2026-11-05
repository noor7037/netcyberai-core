import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { addSections, eligibleSections, sectionCompletion } from '@/lib/homework/homework';

// One homework, section by section (W20-D, H4).
//   GET   each section's done / total and the first names of those who have not; the sections it can still be sent to
//   POST  { classIds }: send the same homework (text, due date, files) to more sections of the class level
// A teacher sees their own classes (row level security) and sends only to a section they teach this subject in.
const STAFF = ['principal', 'school_admin', 'academic_coordinator', 'teacher'];

export async function GET(req: NextRequest, { params }: { params: { homeworkId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!STAFF.includes(claims.role)) return ruleError(403, 'not_allowed');
    if (!isUuid(params.homeworkId)) return ruleError(400, 'not_sent_properly');
    const sections = await sectionCompletion(db, claims.schoolId, params.homeworkId);
    if (sections.length === 0) return jsonError(404, 'not found', { code: 'not_found' });
    const more = await eligibleSections(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.homeworkId);
    return NextResponse.json({ sections, more });
  });
}

export async function POST(req: NextRequest, { params }: { params: { homeworkId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    const classIds = Array.isArray(body?.classIds) ? (body.classIds as unknown[]) : [];
    if (!isUuid(params.homeworkId) || classIds.length > 50 || !classIds.every(isUuid)) return ruleError(400, 'not_sent_properly');
    const result = await addSections(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.homeworkId, classIds as string[]);
    if (result.ok) return NextResponse.json({ targetIds: result.targetIds }, { status: 201 });
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (result.reason === 'not_eligible') return jsonError(403, 'homework can be sent only to a section you teach, of the same class', { code: result.reason });
    return jsonError(result.reason === 'not_found' ? 404 : 400, 'the homework was not sent', { code: result.reason });
  });
}
