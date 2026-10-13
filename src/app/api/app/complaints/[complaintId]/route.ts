import { NextRequest, NextResponse } from 'next/server';
import { addNote, assignComplaint, closeComplaint } from '@/lib/complaints/complaints';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { jobQueue } from '@/lib/jobs/pg-queue';

// POST { action: 'note', text } | { action: 'assign', ownerId } | { action: 'close', text }: a step on one complaint
// (C195). Closing needs a note, and the note is what the parent is told.
export async function POST(req: NextRequest, { params }: { params: { complaintId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.complaintId)) return ruleError(400, 'not_sent_properly');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const text = typeof b.text === 'string' && b.text.length <= 2000 ? b.text : null;
    const done =
      b.action === 'note' && text !== null ? await addNote(db, actor, params.complaintId, text)
      : b.action === 'close' && text !== null ? await closeComplaint(db, jobQueue, actor, params.complaintId, text)
      : b.action === 'assign' && isUuid(b.ownerId) ? await assignComplaint(db, actor, params.complaintId, b.ownerId as string)
      : null;
    if (!done) return ruleError(400, 'not_sent_properly');
    if (done.ok) return NextResponse.json({ parentTold: done.parentTold ?? null });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return done.reason === 'not_found' ? ruleError(404, 'not_found') : jsonError(409, 'that was not done', { code: done.reason });
  });
}
