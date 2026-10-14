import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/audit/log';
import { csvResponse, toCsv } from '@/lib/export/csv';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { DEFAULT_LANG, LANG_COOKIE, readLangCookie } from '@/lib/i18n';
import { loadDesk } from '@/lib/rte/desk';
import { rteSheetCsv } from '@/lib/rte/sheet-csv';

// GET ?session=<id>: the year's claim sheet as a spreadsheet (C223), built from the same desk as the screen, in the
// person's language. Every download writes ONE audit row: who, which year and how many children; never the rows.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const asked = req.nextUrl.searchParams.get('session');
    const desk = await loadDesk(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { sessionId: isUuid(asked) ? asked : null });
    if (!desk) return ruleError(403, 'not_allowed');
    if (!desk.session) return ruleError(404, 'not_found');
    const lang = readLangCookie(req.cookies.get(LANG_COOKIE)?.value, claims.sub) ?? DEFAULT_LANG;
    const file = rteSheetCsv(lang, desk);
    await writeAuditLog(db, {
      schoolId: claims.schoolId,
      actorUserId: claims.sub,
      actorRole: claims.role,
      eventAction: 'rte.sheet_exported',
      targetType: 'academic_sessions',
      targetId: desk.session.session_id,
      beforeState: undefined,
      afterState: { session: desk.session.label, children: file.rows.length - 1, language: lang },
    });
    return csvResponse(`rte-claim-sheet-${desk.session.label}`, toCsv(file.header, file.rows));
  });
}
