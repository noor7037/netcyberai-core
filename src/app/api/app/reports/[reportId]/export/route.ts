import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/audit/log';
import { csvResponse, toCsv } from '@/lib/export/csv';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { appRoute } from '@/lib/frameworks/route';
import { DEFAULT_LANG, LANG_COOKIE, readLangCookie } from '@/lib/i18n';
import { askReport } from '@/lib/reports/load';
import { reportRefusal } from '@/lib/reports/refusal';
import { reportCsv } from '@/lib/reports/table';
import { indiaDate } from '@/lib/time/india';

// GET, with the same days as the screen: the report as a spreadsheet (docs/26 slice 8h, C207). The file has
// exactly the rows and the total row of the screen: both come from the same function (askReport), in the
// caller's own tenant transaction, written by the same column rules, in the person's language. What is refused
// on the screen is refused here. Every export writes ONE audit row: who, which report, which days and how many
// rows. The rows themselves are never copied into the audit trail.
export async function GET(req: NextRequest, { params }: { params: { reportId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const asked = await askReport(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, await loadEntitlements(db, claims.schoolId), params.reportId, req.nextUrl.searchParams);
    if (!asked.ok) return reportRefusal(asked.reason);
    const { result } = asked;
    const lang = readLangCookie(req.cookies.get(LANG_COOKIE)?.value, claims.sub) ?? DEFAULT_LANG;
    const file = reportCsv(lang, result);
    await writeAuditLog(db, {
      schoolId: claims.schoolId,
      actorUserId: claims.sub,
      actorRole: claims.role,
      eventAction: 'report.exported',
      targetType: 'report',
      beforeState: undefined,
      afterState: { report: result.id, period: result.period, from: result.range?.from ?? null, to: result.range?.to ?? null, rows: result.rows.length, language: lang },
    });
    // The file is named for its days; a report about this moment, for India's date when it was run.
    return csvResponse(`report-${result.id}-${result.range ? `${result.range.from}-to-${result.range.to}` : indiaDate(new Date(result.ranAt))}`, toCsv(file.header, file.rows));
  });
}
