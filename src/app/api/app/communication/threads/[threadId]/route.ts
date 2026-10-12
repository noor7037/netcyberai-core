import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { queueThreadReply } from '@/lib/whatsapp/gate';
import { liftOptOut, markThreadRead, threadMessages } from '@/lib/whatsapp/replies';

// One conversation (docs/25 slice 7f, C187).
//   GET   its messages, oldest first; opening it marks it read
//   POST  { action: 'reply', text }   free text, only inside the 24 hours the parent's own message opened
//         { action: 'lift', reason }  the parent asked for messages to start again (principal or school admin)
const STAFF: readonly string[] = ['principal', 'school_admin', 'teacher'];

export async function GET(req: NextRequest, { params }: { params: { threadId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!STAFF.includes(claims.role)) return ruleError(403, 'not_allowed');
    if (!isUuid(params.threadId)) return ruleError(400, 'not_sent_properly');
    const found = await threadMessages(db, claims.schoolId, params.threadId);
    if (!found) return ruleError(404, 'not_found');
    await markThreadRead(db, claims.schoolId, params.threadId);
    return NextResponse.json(found, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest, { params }: { params: { threadId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!STAFF.includes(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    if (!isUuid(params.threadId)) return ruleError(400, 'not_sent_properly');
    if (body?.action === 'reply' && typeof body.text === 'string' && body.text.length <= 5000) {
      const sent = await queueThreadReply(db, jobQueue, { schoolId: claims.schoolId, userId: claims.sub }, params.threadId, body.text);
      if (sent.ok) return NextResponse.json({ ok: true }, { status: 201 });
      return sent.reason === 'no_thread' ? ruleError(404, 'not_found') : jsonError(sent.reason === 'text' ? 400 : 409, 'the reply was not sent', { code: sent.reason });
    }
    if (body?.action === 'lift' && typeof body.reason === 'string' && body.reason.length <= 400) {
      const done = await liftOptOut(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.threadId, body.reason);
      if (done.ok) return NextResponse.json({ ok: true });
      return done.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : done.reason === 'not_found' ? ruleError(404, 'not_found') : jsonError(400, 'not lifted', { code: done.reason });
    }
    return ruleError(400, 'not_sent_properly');
  });
}
