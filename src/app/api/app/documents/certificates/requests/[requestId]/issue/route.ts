import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { issueRequest } from '@/lib/documents/certificate-requests';
import { certificateRefusal } from '@/lib/documents/refusal';
import { indiaDate } from '@/lib/time/india';

// POST { typed }: issue the certificate for a request (W21-M7), with the words the kind needs beyond the family's reason.
// A request held for fees is refused (409 held) until the dues are paid or the principal waives the hold.
export async function POST(req: NextRequest, { params }: { params: { requestId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = (await readJson(req)) ?? {};
    const typed = typeof b.typed === 'object' && b.typed !== null && !Array.isArray(b.typed) ? (b.typed as Record<string, unknown>) : {};
    if (!isUuid(params.requestId)) return ruleError(400, 'not_sent_properly');
    const made = await issueRequest(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.requestId, typed, indiaDate());
    if (made.ok) return NextResponse.json(made, { status: 201 });
    if (made.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (made.reason === 'not_found') return ruleError(404, 'not_found', { field: 'document' });
    const status = made.reason === 'held' || made.reason === 'duplicate' || made.reason === 'not_open' ? 409 : 400;
    return certificateRefusal(status, made.reason, { number: made.number ?? null, fields: made.fields ?? null, field: made.field ?? null });
  });
}
