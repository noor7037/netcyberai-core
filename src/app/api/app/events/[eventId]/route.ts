import { NextRequest, NextResponse } from 'next/server';
import { cancelEvent, inviteEvent } from '@/lib/events/events';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { jobQueue } from '@/lib/jobs/pg-queue';

// POST { action: 'invite' } | { action: 'cancel' }: the office invites the event's classes, or cancels it and tells
// those invited (C194).
export async function POST(req: NextRequest, { params }: { params: { eventId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.eventId) || (b.action !== 'invite' && b.action !== 'cancel')) return ruleError(400, 'not_sent_properly');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const done = b.action === 'invite' ? await inviteEvent(db, jobQueue, actor, params.eventId) : await cancelEvent(db, jobQueue, actor, params.eventId);
    if (done.ok) return NextResponse.json('told' in done ? { told: done.told } : { queued: done.queued, held: done.held, withoutNumber: done.withoutNumber });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return done.reason === 'not_found' ? ruleError(404, 'not_found') : jsonError(409, 'that was not done', { code: done.reason });
  });
}
