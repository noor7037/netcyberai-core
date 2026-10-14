import { NextRequest, NextResponse } from 'next/server';
import { addAction } from '@/lib/early-warning/early-warning';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';

// POST { kind, note, outcome }: what a person did about one flag, and what came of it when that is known
// (docs/26 slice 8j, C209). Added to the flag's log in the person's own name; nothing already written changes.
// The flag must be one this person may read: the office and the coordinator, any; a teacher, their own classes'.
export async function POST(req: NextRequest, { params }: { params: { flagId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    const words = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.length <= 2000);
    if (!b || !isUuid(params.flagId) || typeof b.kind !== 'string' || !words(b.note) || !words(b.outcome)) return ruleError(400, 'not_sent_properly');
    const done = await addAction(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { flagId: params.flagId, kind: b.kind, note: b.note, outcome: b.outcome });
    if (done.ok) return NextResponse.json({ actionId: done.actionId }, { status: 201 });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return done.reason === 'not_found' ? ruleError(404, 'not_found') : jsonError(done.reason === 'elsewhere' ? 409 : 400, 'what was done was not saved', { code: done.reason });
  });
}
