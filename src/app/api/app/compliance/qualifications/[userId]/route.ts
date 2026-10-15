import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { deskInPlan, eraseQualification, saveQualification } from '@/lib/compliance/qualifications';

// POST { stage, subjects, degree, postgraduate_degree, professional_qualification, tet_type, tet_paper,
//        tet_certificate_date, tet_valid_until, other_approval, other_valid_until }: a teaching staff member's
// qualifications and TET as a whole, each field a string ('' for nothing). The principal and the school admin (C227).
export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await deskInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed'); // a part of the plan (C226)
    if (!isUuid(params.userId)) return ruleError(400, 'not_sent_properly');
    const b = await readJson(req);
    if (!b) return ruleError(400, 'not_sent_properly');
    const saved = await saveQualification(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.userId, b);
    if (saved.ok) return NextResponse.json({ changed: saved.changed });
    if (saved.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (saved.reason === 'not_staff') return ruleError(404, 'not_found');
    return jsonError(400, 'the qualifications were not saved', { code: saved.reason, field: saved.field ?? null });
  });
}

// DELETE: erase the qualification row of a person who is no longer on the register (their account is inactive, or no
// longer a teaching role), through the database's own function (C230-A, C232 part B). The principal and the school
// admin; a member of the teaching staff keeps their row (409); audited with the person's id and a count.
export async function DELETE(req: NextRequest, { params }: { params: { userId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await deskInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed'); // a part of the plan (C226)
    if (!isUuid(params.userId)) return ruleError(400, 'not_sent_properly');
    const erased = await eraseQualification(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.userId);
    if (erased.ok) return NextResponse.json({ erased: erased.erased });
    if (erased.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (erased.reason === 'not_found') return ruleError(404, 'not_found');
    return jsonError(409, 'a member of the teaching staff keeps their qualification row', { code: 'on_register' });
  });
}
