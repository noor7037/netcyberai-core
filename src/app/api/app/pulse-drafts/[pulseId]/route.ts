import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { changeDraft } from '@/lib/pulse/drafts';

// PATCH: change a Pulse message's words, mark it ready, or take it back to
// draft (C151). Nothing is sent from here: sending starts with WhatsApp.
export async function PATCH(req: NextRequest, { params }: { params: { pulseId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    const bodies = (body?.bodies ?? {}) as Record<string, unknown>;
    const status = body?.status === 'ready' || body?.status === 'draft' ? body.status : undefined;
    if (!isUuid(params.pulseId) || typeof bodies !== 'object' || ['en', 'hi', 'hinglish'].some((l) => bodies[l] !== undefined && typeof bodies[l] !== 'string')) return ruleError(400, 'not_sent_properly');
    const result = await changeDraft(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.pulseId, { bodies: bodies as { en?: string; hi?: string; hinglish?: string }, status });
    if (result.ok) return NextResponse.json({ draft: result.draft });
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(result.reason === 'not_found' ? 404 : result.reason === 'already_sent' ? 409 : 400, 'the message was not changed', { code: result.reason });
  });
}
