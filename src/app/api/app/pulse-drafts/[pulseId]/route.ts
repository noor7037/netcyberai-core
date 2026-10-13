import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { changeDraft } from '@/lib/pulse/drafts';
import { sendPulse } from '@/lib/pulse/send';

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

// POST { action: 'send' }: a person sends a message that was marked ready, to the class's guardians (C189). Each
// goes through the send-gate; the answer says how many were queued, how many held, and how many have no number.
export async function POST(req: NextRequest, { params }: { params: { pulseId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    if (!isUuid(params.pulseId) || body?.action !== 'send') return ruleError(400, 'not_sent_properly');
    const result = await sendPulse(db, jobQueue, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.pulseId);
    if (result.ok) return NextResponse.json({ queued: result.queued, held: result.held, withoutNumber: result.withoutNumber });
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return result.reason === 'not_found' ? ruleError(404, 'not_found') : jsonError(409, 'the message was not sent', { code: result.reason });
  });
}
