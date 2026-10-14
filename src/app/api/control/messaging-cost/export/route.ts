import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit/log';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { asLiveStaff } from '@/lib/control/billing-route';
import { COST_CSV_HEADER, costCsvRows, loadSchoolMonths } from '@/lib/control/messaging-cost';
import { csvResponse, toCsv } from '@/lib/export/csv';
import { DEFAULT_LANG, LANG_COOKIE, readLangCookie, t } from '@/lib/i18n';
import { indiaMonth, isCostMonth } from '@/lib/whatsapp/cost';

// GET ?month=YYYY-MM: Control's list of schools for one month as a spreadsheet (docs/26 slice 8f, C205).
// NetCyberAI staff only, checked again on this request (the account is still active and still staff). The file has
// the rows of the list on the screen: the same function loads them and the same function lays out a row, in the
// person's language. Amounts are rupees with two decimals. No personal data: a school's name and its counts.
// A month that is not a month, or is after this one, is refused: a file for another month than the one asked for
// would mislead. Every export writes an audit row: who, which month and how many rows, never the amounts.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const asked = req.nextUrl.searchParams.get('month');
  const thisMonth = indiaMonth();
  if (asked !== null && (!isCostMonth(asked) || asked > thisMonth)) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const month = asked ?? thisMonth;
  const lang = readLangCookie(req.cookies.get(LANG_COOKIE)?.value, guard.claims.sub) ?? DEFAULT_LANG;
  const run = await asLiveStaff(guard.claims, async (db) => {
    const schools = await loadSchoolMonths(db, month, thisMonth);
    await writeAuditLog(db, { schoolId: null, actorUserId: guard.claims.sub, actorRole: 'super_admin', eventAction: 'messaging_cost.exported', targetType: 'messaging_cost', targetId: month, beforeState: undefined, afterState: { month, rows: schools.length, language: lang } });
    return schools;
  });
  if ('refused' in run) return run.refused;
  return csvResponse(`messaging-cost-${month}`, toCsv(COST_CSV_HEADER.map((key) => t(lang, key)), costCsvRows(lang, run.value)));
}
