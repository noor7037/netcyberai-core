import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { decideConcession } from '@/lib/fees/concessions';
import { indiaDate } from '@/lib/time/india';

// POST: approve or reject a proposed concession, or end an approved one (C159).
export async function POST(req: NextRequest, { params }: { params: { concessionId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    const action = (['approve', 'reject', 'end'] as const).find((a) => a === body?.action);
    if (!isUuid(params.concessionId) || !action) return ruleError(400, 'not_sent_properly');
    const result = await decideConcession(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.concessionId, action, indiaDate());
    if (result.ok) return NextResponse.json({ ok: true });
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(result.reason === 'not_found' ? 404 : 409, 'the concession was not changed', { code: result.reason });
  });
}
