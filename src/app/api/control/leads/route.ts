import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit/log';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { asLiveStaff } from '@/lib/control/billing-route';
import { listLeads, parseFilters, parseLeadUpdate, updateLead } from '@/lib/control/leads';

// Control → Leads (W7-L). NetCyberAI staff only, checked again on every request (the account is still active and
// still staff).
//   GET   ?status=&source=&q=&page=        → { leads, total, page, pageSize }, newest first, 50 a page
//   PATCH { leadId, status, notes, countryCode? } → { lead }; one audit row (ids and statuses only, no contact details)
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const params = req.nextUrl.searchParams;
  const page = Number(params.get('page') ?? '1');
  const run = await asLiveStaff(guard.claims, (db) => listLeads(db, parseFilters(params), Number.isFinite(page) ? page : 1));
  if ('refused' in run) return run.refused;
  return NextResponse.json(run.value, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const input = parseLeadUpdate(await req.json().catch(() => null));
  if (!input) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const run = await asLiveStaff(guard.claims, async (db) => {
    const out = await updateLead(db, input);
    if ('error' in out) return out;
    await writeAuditLog(db, {
      schoolId: null,
      actorUserId: guard.claims.sub,
      actorRole: 'super_admin',
      eventAction: 'lead.updated',
      targetType: 'lead',
      targetId: input.leadId,
      beforeState: { status: out.before.status },
      afterState: { status: out.lead.status, countryCode: input.countryCode ? out.lead.countryCode : undefined },
    });
    return out;
  });
  if ('refused' in run) return run.refused;
  if ('error' in run.value) return NextResponse.json({ error: run.value.error }, { status: run.value.error === 'not_found' ? 404 : 400 });
  return NextResponse.json({ lead: run.value.lead });
}
