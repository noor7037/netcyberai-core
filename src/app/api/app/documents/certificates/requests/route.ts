import { NextRequest, NextResponse } from 'next/server';
import { withPlatformService } from '@/lib/auth/db';
import { CERT_OFFICE } from '@/lib/documents/certificates';
import { officeRequests, refreshHolds, requestAsOffice } from '@/lib/documents/certificate-requests';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, appRouteAfter, readJson, ruleError } from '@/lib/frameworks/route';
import { certificateRefusal } from '@/lib/documents/refusal';

// Certificate requests (W21-M7, docs/42 Documents). The principal and the school admin only.
//   GET    the open requests (and those collected in the last 60 days) with each one's timeline; the fee holds are
//          re-read first, as the platform role, so a payment since releases its request
//   POST { studentId, kind, reason }   the office asks for a certificate on a family's behalf
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return appRouteAfter(
    req,
    async (claims) => {
      if (CERT_OFFICE.includes(claims.role)) await withPlatformService((p) => refreshHolds(p, claims.schoolId));
      return true;
    },
    async ({ claims, db }) => {
      const rows = await officeRequests(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role });
      return rows ? NextResponse.json({ requests: rows }, { headers: { 'Cache-Control': 'no-store' } }) : ruleError(403, 'not_allowed');
    }
  );
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(b.studentId)) return ruleError(400, 'not_sent_properly');
    const made = await requestAsOffice(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { studentId: b.studentId as string, kind: b.kind, reason: b.reason });
    // The hold is read when the list is next opened (the request is not committed yet, so the platform role cannot see it).
    if (made.ok) return NextResponse.json({ ok: true, requestId: made.requestId }, { status: 201 });
    if (made.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (made.reason === 'not_found') return ruleError(404, 'not_found', { field: 'document' });
    return certificateRefusal(made.reason === 'duplicate' ? 409 : 400, made.reason);
  });
}
