import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { saveDisclosure } from '@/lib/compliance/disclosure';
import { deskInPlan } from '@/lib/compliance/qualifications';

// POST { itemId: null | <id>, heading, value, source }: a new disclosure item, or a new version of one in force (the
// earlier version is kept). The principal and the school admin (C227).
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await deskInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed'); // a part of the plan (C226)
    const b = await readJson(req);
    const itemId = b?.itemId ?? null;
    if (!b || (itemId !== null && !isUuid(itemId))) return ruleError(400, 'not_sent_properly');
    const saved = await saveDisclosure(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { itemId: itemId as string | null, heading: b.heading, value: b.value, source: b.source });
    if (saved.ok) return NextResponse.json({ itemId: saved.itemId }, { status: itemId ? 200 : 201 });
    if (saved.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (saved.reason === 'not_found') return ruleError(404, 'not_found');
    return jsonError(400, 'the item was not saved', { code: saved.reason, field: saved.field ?? null });
  });
}
