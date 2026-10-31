import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit/log';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { asLiveStaff } from '@/lib/control/billing-route';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { kickJobs } from '@/lib/jobs/handlers';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { listReplies, parseManualReply, queueManualReply } from '@/lib/leads/reply';

// Control → Leads (W12-F): the replies a lead was sent, and a reply by email. NetCyberAI staff only, checked again on
// every request.
//   GET  ?leadId=           → { replies }, newest first (each recorded only once the email service accepted it)
//   POST { leadId, body }   → 202 { queued: true }; the email job sends it and records it as 'manual'. One audit row
//                             (ids only, never the words or the address).
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const leadId = req.nextUrl.searchParams.get('leadId');
  if (!isUuid(leadId)) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const run = await asLiveStaff(guard.claims, (db) => listReplies(db, leadId));
  if ('refused' in run) return run.refused;
  return NextResponse.json({ replies: run.value }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const input = parseManualReply(await req.json().catch(() => null));
  if (!input) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const run = await asLiveStaff(guard.claims, async (db) => {
    const out = await queueManualReply(db, jobQueue, { ...input, by: guard.claims.sub });
    if ('error' in out) return out;
    await writeAuditLog(db, {
      schoolId: null,
      actorUserId: guard.claims.sub,
      actorRole: 'super_admin',
      eventAction: 'lead.reply_queued',
      targetType: 'lead',
      targetId: input.leadId,
      afterState: { channel: 'email', kind: 'manual' },
    });
    return out;
  });
  if ('refused' in run) return run.refused;
  if ('error' in run.value) return NextResponse.json({ error: run.value.error }, { status: run.value.error === 'not_found' ? 404 : 400 });
  await kickJobs([run.value.key]).catch(() => {});
  return NextResponse.json({ queued: true }, { status: 202 });
}
