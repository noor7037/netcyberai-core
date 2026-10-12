import { NextRequest, NextResponse } from 'next/server';
import { FEES_PARTS } from '@/lib/fees/page-data';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { CONCESSION_KINDS, listConcessions, proposeConcession } from '@/lib/fees/concessions';
import { FINANCE } from '@/lib/fees/structures';

// Concessions (docs/23 6b, C159).
//   GET   the school's concessions: proposed first, then approved, then ended
//   POST  propose one; it applies to nothing until the principal or the school admin approves it
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!FINANCE.includes(claims.role)) return ruleError(403, 'not_allowed');
    return NextResponse.json(await FEES_PARTS.concessions(db, { schoolId: claims.schoolId, role: claims.role }));
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    const kind = CONCESSION_KINDS.find((k) => k === body?.kind);
    const num = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'number' && Number.isFinite(v) ? v : NaN);
    const percentOff = num(body?.percentOff);
    const amountOffMinor = num(body?.amountOffMinor);
    if (!kind || !isUuid(body?.studentId) || (body?.headId != null && !isUuid(body.headId)) || Number.isNaN(percentOff) || Number.isNaN(amountOffMinor) || typeof body?.reason !== 'string' || body.reason.length > 1000 || typeof body?.validFrom !== 'string') return ruleError(400, 'not_sent_properly');
    const result = await proposeConcession(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { studentId: body.studentId as string, headId: (body.headId as string | null | undefined) ?? null, kind, percentOff, amountOffMinor, reason: body.reason, validFrom: body.validFrom, validTo: typeof body.validTo === 'string' && body.validTo ? body.validTo : null });
    if (result.ok) return NextResponse.json({ concessionId: result.concessionId }, { status: 201 });
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(400, 'the concession was not proposed', { code: result.reason });
  });
}
