import { NextRequest, NextResponse } from 'next/server';
import { ADMISSIONS_OFFICE, loadPipeline, recordEnquiry } from '@/lib/admissions/admissions';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';

// The admissions pipeline (docs/28 slice 10a, C221). The office only.
//   GET   the school's enquiries, "follow up today", "gone quiet" (the school's number of days), the classes and the
//         office staff an enquiry can be given to
//   POST  { childName, guardianName, phone, classId, source, ownerId, followUp | null, nextStep | null, note | null }
//         record an enquiry
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!ADMISSIONS_OFFICE.includes(claims.role)) return ruleError(403, 'not_allowed');
    return NextResponse.json({ ...(await loadPipeline(db, claims.schoolId)), me: claims.sub }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b) return ruleError(400, 'not_sent_properly');
    const made = await recordEnquiry(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, {
      childName: b.childName,
      guardianName: b.guardianName,
      phone: b.phone,
      classId: b.classId,
      source: b.source,
      ownerId: b.ownerId,
      followUp: b.followUp,
      nextStep: b.nextStep,
      note: b.note,
    });
    if (made.ok) return NextResponse.json({ enquiryId: made.enquiryId }, { status: 201 });
    return made.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(400, 'the enquiry was not recorded', { code: made.reason });
  });
}
