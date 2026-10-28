import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/audit/log';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { asLiveStaff } from '@/lib/control/billing-route';
import { LEAD_CSV_HEADER, leadCsvRow, loadLeadsForExport, parseFilters } from '@/lib/control/leads';
import { csvResponse, toCsv } from '@/lib/export/csv';
import { indiaDate } from '@/lib/time/india';

// GET ?status=&source=&q=: Control → Leads as a spreadsheet, the rows the current filter shows, every column (W7-L).
// NetCyberAI staff only. UTF-8 with a byte order mark (src/lib/export/csv.ts), so Excel shows Arabic and Hindi names;
// a cell that would run as a formula is written as text. One audit row: who, the filter and how many rows.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const filters = parseFilters(req.nextUrl.searchParams);
  const run = await asLiveStaff(guard.claims, async (db) => {
    const leads = await loadLeadsForExport(db, filters);
    await writeAuditLog(db, { schoolId: null, actorUserId: guard.claims.sub, actorRole: 'super_admin', eventAction: 'leads.exported', targetType: 'lead', beforeState: undefined, afterState: { status: filters.status, source: filters.source, searched: Boolean(filters.q), rows: leads.length } });
    return leads;
  });
  if ('refused' in run) return run.refused;
  return csvResponse(`netcyberai-leads-${indiaDate()}`, toCsv(LEAD_CSV_HEADER, run.value.map(leadCsvRow)));
}
