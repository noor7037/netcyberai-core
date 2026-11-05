import { NextRequest, NextResponse } from 'next/server';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { tellFamily } from '@/lib/attendance/chronic';
import { whatsappSetUp } from '@/lib/communication/notices';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { indiaDate } from '@/lib/time/india';

// POST { studentId }: the principal tells that child's family, once in 7 days (W20-B). It writes a notice for the child's
// guardians and sends it by the three ways every notice goes: the Family app, email, and WhatsApp when the school has it.
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    if (!isUuid(body?.studentId)) return ruleError(400, 'not_sent_properly');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const done = await tellFamily(db, jobQueue, actor, body!.studentId as string, indiaDate(), { whatsappLive: await whatsappSetUp(claims.schoolId) });
    if (done.ok) return NextResponse.json({ noticeId: done.noticeId, queued: done.queued, held: done.held, inApp: done.inApp, byEmail: done.byEmail });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(409, 'the family was not told', { code: done.reason, ...(done.tellAgainOn ? { tellAgainOn: done.tellAgainOn } : {}) });
  });
}
