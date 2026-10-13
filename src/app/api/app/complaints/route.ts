import { NextRequest, NextResponse } from 'next/server';
import { COMPLAINT_ROLES, complaintStaff, listComplaints, openComplaint } from '@/lib/complaints/complaints';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { jobQueue } from '@/lib/jobs/pg-queue';

// Complaints from parents (docs/25 slice 7m, C195).
//   GET   the complaints this person may see; for the office, the staff one can be given to or be about
//   POST  { parentId, studentId | null, aboutUserId | null, ownerId, summary, dueHours, source }  record one; the parent is told
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!COMPLAINT_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    const office = claims.role === 'principal' || claims.role === 'school_admin';
    const complaints = await listComplaints(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role });
    return NextResponse.json({ complaints, staff: office ? await complaintStaff(db, claims.schoolId) : [], me: claims.sub, office }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    const idOrNull = (v: unknown) => v === null || isUuid(v);
    if (!b || !isUuid(b.parentId) || !idOrNull(b.studentId) || !idOrNull(b.aboutUserId) || !isUuid(b.ownerId) || typeof b.summary !== 'string' || b.summary.length > 2000 || typeof b.dueHours !== 'number' || (b.source !== 'thread' && b.source !== 'office')) return ruleError(400, 'not_sent_properly');
    const made = await openComplaint(db, jobQueue, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { parentId: b.parentId as string, studentId: b.studentId as string | null, aboutUserId: b.aboutUserId as string | null, ownerId: b.ownerId as string, summary: b.summary, dueHours: b.dueHours, source: b.source });
    if (made.ok) return NextResponse.json({ complaintId: made.complaintId, parentTold: made.parentTold }, { status: 201 });
    return made.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(400, 'the complaint was not recorded', { code: made.reason });
  });
}
