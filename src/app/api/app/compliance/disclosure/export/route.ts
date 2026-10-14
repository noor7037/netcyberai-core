import { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/audit/log';
import { csvResponse, toCsv } from '@/lib/export/csv';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { DEFAULT_LANG, LANG_COOKIE, readLangCookie } from '@/lib/i18n';
import { disclosureCsv, loadDisclosure } from '@/lib/compliance/disclosure';
import { deskInPlan } from '@/lib/compliance/qualifications';

// GET: the disclosure items in force as a spreadsheet, exactly what is kept, in the person's language (C227). Every
// download writes ONE audit row: who, and how many items; never the words.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await deskInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed'); // a part of the plan (C226)
    const items = await loadDisclosure(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role });
    if (!items) return ruleError(403, 'not_allowed');
    const lang = readLangCookie(req.cookies.get(LANG_COOKIE)?.value, claims.sub) ?? DEFAULT_LANG;
    const file = disclosureCsv(lang, items);
    await writeAuditLog(db, { schoolId: claims.schoolId, actorUserId: claims.sub, actorRole: claims.role, eventAction: 'compliance_desk.disclosure_exported', targetType: 'disclosure_entries', targetId: claims.schoolId, beforeState: undefined, afterState: { items: items.length, language: lang } });
    return csvResponse('public-disclosure', toCsv(file.header, file.rows));
  });
}
