import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/audit/log';
import { csvResponse, toCsv } from '@/lib/export/csv';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { DEFAULT_LANG, LANG_COOKIE, readLangCookie, t } from '@/lib/i18n';
import { DASHBOARD_CSV_HEADER, dashboardCsvRows, dashboardModel } from '@/lib/insights/dashboard';
import { loadFacts } from '@/lib/insights/load';
import { DEFAULT_RANGE, isRangeId } from '@/lib/insights/screens';

// GET ?range=today|7d|30d: the dashboard as a spreadsheet (docs/26 slice 8d, C203). The file has what is on the
// screen: the same facts, loaded the same way in the caller's own tenant transaction (row level security decides
// every number), arranged by the same function the screen is drawn from, in the person's language. Only the
// office has the dashboard, so only the office can export it. Every export writes an audit row: who, which days
// and how many rows. The numbers themselves are not copied into the audit trail.
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (claims.role !== 'principal' && claims.role !== 'school_admin') return ruleError(403, 'not_allowed');
    const asked = req.nextUrl.searchParams.get('range');
    if (asked !== null && !isRangeId(asked)) return ruleError(400, 'not_sent_properly');
    const rangeId = asked ?? DEFAULT_RANGE;
    const lang = readLangCookie(req.cookies.get(LANG_COOKIE)?.value, claims.sub) ?? DEFAULT_LANG;
    const loaded = await loadFacts(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, await loadEntitlements(db, claims.schoolId), { range: rangeId });
    // A number that could not be worked out is left out of the screen, which says so; the file says so too.
    const rows = dashboardCsvRows(lang, dashboardModel(loaded.facts), loaded.range, loaded.failed.length);
    await writeAuditLog(db, {
      schoolId: claims.schoolId,
      actorUserId: claims.sub,
      actorRole: claims.role,
      eventAction: 'dashboard.exported',
      targetType: 'dashboard',
      beforeState: undefined,
      afterState: { range: rangeId, from: loaded.range.from, to: loaded.range.to, rows: rows.length, language: lang, leftOut: loaded.failed.length },
    });
    return csvResponse(`dashboard-${loaded.today}-${rangeId}`, toCsv(DASHBOARD_CSV_HEADER.map((key) => t(lang, key)), rows));
  });
}
