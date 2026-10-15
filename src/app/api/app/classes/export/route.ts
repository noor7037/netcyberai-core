import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/audit/log';
import { canWriteMasterData } from '@/lib/auth/require-app-session';
import { CLASS_CSV_EXPORT_COLUMNS, classCsvRows } from '@/lib/classes/class-csv';
import { csvResponse, toCsv } from '@/lib/export/csv';
import { listExport } from '@/lib/export/lists';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { indiaDate } from '@/lib/time/india';

// GET: the school's classes as a CSV file, in the class order (C235-A). The principal and the school admin: the
// file carries the class teachers' sign-in emails. The column names are the ones the upload reads, so the file can
// be edited and given back (classes already there are refused, by line). Every download writes an audit row with
// how many classes it held.
//
// GET ?format=xlsx|csv: the classes list as the list screen shows it, as Excel or CSV, from the office's "Download"
// menu (C235-D, src/lib/export/lists.ts), audited as a list export.
export async function GET(req: NextRequest) {
  return appRoute(req, async (ctx) => {
    if (req.nextUrl.searchParams.has('format')) return listExport(ctx, req, 'classes');
    const { claims, db } = ctx;
    if (!canWriteMasterData(claims.role)) return ruleError(403, 'not_allowed');
    const rows = await classCsvRows(db, claims.schoolId);
    await writeAuditLog(db, { schoolId: claims.schoolId, actorUserId: claims.sub, actorRole: claims.role, eventAction: 'class.exported', targetType: 'classes', afterState: { rows: rows.length } });
    return csvResponse(`classes-${indiaDate()}`, toCsv(CLASS_CSV_EXPORT_COLUMNS, rows));
  });
}
