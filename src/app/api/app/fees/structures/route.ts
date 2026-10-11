import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { FREQUENCIES, type Frequency } from '@/lib/fees/money';
import { addStructureVersion } from '@/lib/fees/structures';
import { isIsoDate } from '@/lib/time/india';

// POST: a new version of a class's fee structure from a date. Earlier
// versions are never changed (C157). Amounts arrive as whole paise.
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    const raw = Array.isArray(body?.items) ? (body.items as { headId?: unknown; amountMinor?: unknown; frequency?: unknown }[]) : null;
    if (!isUuid(body?.classId) || !isUuid(body?.sessionId) || !isIsoDate(body?.effectiveFrom) || !raw || raw.length > 60) return ruleError(400, 'not_sent_properly');
    const items: { headId: string; amountMinor: number; frequency: Frequency }[] = [];
    for (const i of raw) {
      const frequency = FREQUENCIES.find((f) => f === i?.frequency);
      if (!isUuid(i?.headId) || typeof i?.amountMinor !== 'number' || !Number.isInteger(i.amountMinor) || i.amountMinor < 0 || !frequency) return ruleError(400, 'not_sent_properly');
      items.push({ headId: i.headId as string, amountMinor: i.amountMinor, frequency });
    }
    const result = await addStructureVersion(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { classId: body.classId as string, sessionId: body.sessionId as string, effectiveFrom: body.effectiveFrom as string, items });
    if (result.ok) return NextResponse.json({ structureId: result.structureId }, { status: 201 });
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(result.reason === 'version_exists' ? 409 : 400, 'the fee structure was not saved', { code: result.reason });
  });
}
