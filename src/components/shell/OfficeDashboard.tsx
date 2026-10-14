import { OfficeDashboardView, type OfficeDashboardData } from '@/components/dashboards/OfficeDashboardView';
import { redirect } from 'next/navigation';
import { SessionRevokedError, withTenantContext } from '@/lib/auth/db';
import type { SessionClaims } from '@/lib/auth/types';
import type { SchoolRole } from '@/lib/contracts/modules';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import type { Lang } from '@/lib/i18n';
import { loadFacts } from '@/lib/insights/load';
import { rangeFor } from '@/lib/insights/screens';
import type { RangeId } from '@/lib/insights/types';
import { indiaDate } from '@/lib/time/india';

// The office's dashboard (docs/26 slice 8d, C203): the school facts for the
// chosen days, loaded in ONE transaction that is the signed-in person's own
// (withTenantContext: their school, role and user are set, so row level
// security decides every number). Nothing here reads as the platform, and
// nothing reads illustrative data. If the facts cannot be loaded at all the
// page still opens and says so; it never shows a made-up number.
export async function OfficeDashboard({ session, rangeId, lang }: { session: SessionClaims; rangeId: RangeId; lang: Lang }) {
  const schoolId = session.schoolId as string;
  const today = indiaDate();
  let data: OfficeDashboardData = { schoolName: '', rangeId, range: rangeFor(today, rangeId), facts: [], failed: 1 };
  try {
    data = await withTenantContext(session, async (db) => {
      const school = (await db.query(`select name from schools where school_id = $1`, [schoolId])).rows[0];
      const loaded = await loadFacts(db, { schoolId, userId: session.sub, role: session.role as SchoolRole }, await loadEntitlements(db, schoolId), { range: rangeId, today });
      return { schoolName: (school?.name as string | undefined) ?? '', rangeId, range: loaded.range, facts: loaded.facts, failed: loaded.failed.length };
    });
  } catch (err) {
    if (err instanceof SessionRevokedError) redirect('/login');
    console.error('[dashboard] could not load', err instanceof Error ? err.name : 'error');
  }
  return <OfficeDashboardView data={data} lang={lang} tour="dashboard" help="read-the-dashboard" />;
}
