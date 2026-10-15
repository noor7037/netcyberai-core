import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/audit/log';
import { canWriteMasterData } from '@/lib/auth/require-app-session';
import { CLASS_CSV_EXPORT_COLUMNS, classCsvRows } from '@/lib/classes/class-csv';
import { csvResponse, toCsv } from '@/lib/export/csv';
import { listExport } from '@/lib/export/lists';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { indiaDate } from '@/lib/time/india';

// GET: the school's classes, for the principal and the school admin, audited.
//   ?format=xlsx   the classes list as an Excel file (C235-D, src/lib/export/lists.ts).
//   otherwise      a CSV in the class order (C235-A) whose columns are the ones the upload reads, so the file can be
//                  edited and given back (classes already there are refused, by line); it carries the class teachers'
//                  sign-in emails.
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('format') === 'xlsx') return appRoute(req, (ctx) => listExport(ctx, req, 'classes'));
  return appRoute(req, async ({ claims, db }) => {
    if (!canWriteMasterData(claims.role)) return ruleError(403, 'not_allowed');
    const rows = await classCsvRows(db, claims.schoolId);
    await writeAuditLog(db, { schoolId: claims.schoolId, actorUserId: claims.sub, actorRole: claims.role, eventAction: 'class.exported', targetType: 'classes', afterState: { rows: rows.length } });
    return csvResponse(`classes-${indiaDate()}`, toCsv(CLASS_CSV_EXPORT_COLUMNS, rows));
  });
}
