import { NextRequest, NextResponse } from 'next/server';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { addHead } from '@/lib/fees/structures';

// POST: add a fee head (C157).
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    if (typeof body?.name !== 'string' || body.name.length > 200) return ruleError(400, 'not_sent_properly');
    const result = await addHead(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { name: body.name, isMandatory: body.isMandatory !== false });
    if (result.ok) return NextResponse.json({ head: result.head }, { status: 201 });
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(result.reason === 'exists' ? 409 : 400, 'the fee head was not added', { code: result.reason });
  });
}
