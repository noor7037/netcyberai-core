import { NextRequest, NextResponse } from 'next/server';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { deskInPlan } from '@/lib/compliance/qualifications';
import { addSqaafNote } from '@/lib/compliance/sqaaf';

// POST { standardCode, note }: a typed note as evidence for one SQAAF standard. Never an Aadhaar number. The principal
// and the school admin (C227). A photo or a PDF goes to /api/app/compliance/sqaaf/file.
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await deskInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed'); // a part of the plan (C226)
    const b = await readJson(req);
    if (!b || typeof b.standardCode !== 'string' || typeof b.note !== 'string' || b.note.length > 4000) return ruleError(400, 'not_sent_properly');
    const made = await addSqaafNote(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { standardCode: b.standardCode, note: b.note });
    if (made.ok) return NextResponse.json({ evidenceId: made.evidenceId }, { status: 201 });
    if (made.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(400, 'the evidence was not added', { code: made.reason });
  });
}
