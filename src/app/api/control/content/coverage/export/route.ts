import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/audit/log';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { asLiveStaff } from '@/lib/control/billing-route';
import { COVERAGE_CSV_HEADER, coverage, coverageCsvRow, parseCoverageFilters } from '@/lib/content/coverage';
import { pilotOnly, readPilotScope } from '@/lib/content/pilot-scope';
import { csvResponse, toCsv } from '@/lib/export/csv';
import { indiaDate } from '@/lib/time/india';

// GET ?board=&class=&subject=[&pilot=1]: Control → Content → Coverage as a spreadsheet, one row per syllabus unit, the rows the
// current filter shows (W9-D). NetCyberAI staff only. UTF-8 with a byte order mark (src/lib/export/csv.ts), so Excel
// shows the Hindi unit titles. One audit row: who, the filter and how many rows.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const filters = parseCoverageFilters(req.nextUrl.searchParams);
  const pilot = req.nextUrl.searchParams.get('pilot') === '1';
  const run = await asLiveStaff(guard.claims, async (db) => {
    const result = await coverage(db, filters);
    // &pilot=1 keeps the units inside the pilot scope (W12-D); with no scope set it keeps none.
    if (pilot) result.units = pilotOnly(await readPilotScope(db), result.units);
    await writeAuditLog(db, { schoolId: null, actorUserId: guard.claims.sub, actorRole: 'super_admin', eventAction: 'content.coverage_exported', targetType: 'content_coverage', beforeState: undefined, afterState: { boardId: filters.boardId ?? null, classLevel: filters.classLevel ?? null, subject: filters.subject ?? null, pilotOnly: pilot, rows: result.units.length } });
    return result.units;
  });
  if ('refused' in run) return run.refused;
  return csvResponse(`netcyberai-coverage-${indiaDate()}`, toCsv(COVERAGE_CSV_HEADER, run.value.map(coverageCsvRow)));
}
