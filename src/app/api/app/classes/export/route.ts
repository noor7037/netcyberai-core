import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/audit/log';
import { canWriteMasterData } from '@/lib/auth/require-app-session';
import { CLASS_CSV_EXPORT_COLUMNS, classCsvRows } from '@/lib/classes/class-csv';
import { csvResponse, toCsv } from '@/lib/export/csv';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { indiaDate } from '@/lib/time/india';

// GET: the school's classes as a CSV file, in the class order (C235-A). The principal and the school admin: the
// file carries the class teachers' sign-in emails. The column names are the ones the upload reads, so the file can
// be edited and given back (classes already there are refused, by line). Every download writes an audit row with
// how many classes it held.
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!canWriteMasterData(claims.role)) return ruleError(403, 'not_allowed');
    const rows = await classCsvRows(db, claims.schoolId);
    await writeAuditLog(db, { schoolId: claims.schoolId, actorUserId: claims.sub, actorRole: claims.role, eventAction: 'class.exported', targetType: 'classes', afterState: { rows: rows.length } });
    return csvResponse(`classes-${indiaDate()}`, toCsv(CLASS_CSV_EXPORT_COLUMNS, rows));
  });
}
