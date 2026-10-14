import { NextRequest, NextResponse } from 'next/server';
import { ADMISSIONS_OFFICE, admit, correctDetails, enquirySteps, giveEnquiry, recordOutcome } from '@/lib/admissions/admissions';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';

// One enquiry (docs/28 slice 10a, C221). The office only.
//   GET   its steps, in order
//   POST  { action: 'outcome', note, stage, nextStep, followUp, reason }   what happened (the tool's "Record what happened")
//         { action: 'give', ownerId }                                      give it to someone else in the office
//         { action: 'details', childName, guardianName, phone, classId, source }   correct what was written down
//         { action: 'admit', admissionNo | null, dob | null }              make the child's student record
export async function GET(req: NextRequest, { params }: { params: { enquiryId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!ADMISSIONS_OFFICE.includes(claims.role)) return ruleError(403, 'not_allowed');
    if (!isUuid(params.enquiryId)) return ruleError(400, 'not_sent_properly');
    const steps = await enquirySteps(db, claims.schoolId, params.enquiryId);
    if (!steps) return ruleError(404, 'not_found');
    return NextResponse.json({ steps }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest, { params }: { params: { enquiryId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.enquiryId)) return ruleError(400, 'not_sent_properly');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const id = params.enquiryId;
    if (b.action === 'admit') {
      const done = await admit(db, actor, id, { admissionNo: b.admissionNo, dob: b.dob });
      if (done.ok) return NextResponse.json({ studentId: done.studentId, className: done.className, fees: done.fees, monthRaised: done.monthRaised });
      return refused(done.reason);
    }
    const done =
      b.action === 'outcome' ? await recordOutcome(db, actor, id, { note: b.note, stage: b.stage, nextStep: b.nextStep, followUp: b.followUp, reason: b.reason })
      : b.action === 'give' ? await giveEnquiry(db, actor, id, b.ownerId)
      : b.action === 'details' ? await correctDetails(db, actor, id, { childName: b.childName, guardianName: b.guardianName, phone: b.phone, classId: b.classId, source: b.source })
      : null;
    if (!done) return ruleError(400, 'not_sent_properly');
    return done.ok ? NextResponse.json({ enquiryId: done.enquiryId }) : refused(done.reason);
  });
}

function refused(reason: string): NextResponse {
  if (reason === 'not_allowed') return ruleError(403, 'not_allowed');
  if (reason === 'not_found') return ruleError(404, 'not_found');
  return jsonError(reason === 'admitted' || reason === 'closed' ? 409 : 400, 'that was not done', { code: reason });
}
