import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { typeRate } from '@/lib/rte/desk';

// POST { sessionId, rate: "12345.50", source }: the state's per-child rate for a school year, typed from its
// notification with where it comes from (C223). It replaces the year's rate; claims already raised keep theirs.
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(b.sessionId) || typeof b.rate !== 'string' || b.rate.length > 20 || typeof b.source !== 'string' || b.source.length > 1000) return ruleError(400, 'not_sent_properly');
    const made = await typeRate(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { sessionId: b.sessionId as string, rate: b.rate, source: b.source });
    if (made.ok) return NextResponse.json({ rateId: made.rateId }, { status: 201 });
    if (made.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(made.reason === 'unknown_session' ? 404 : 400, 'the rate was not saved', { code: made.reason });
  });
}
