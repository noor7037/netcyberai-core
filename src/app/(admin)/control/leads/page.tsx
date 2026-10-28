import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { LeadsView } from '@/components/control/LeadsView';
import { listLeads, PAGE_SIZE } from '@/lib/control/leads';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Control → Leads (W7-L): every request the website brought in, newest first. The layout already admits only
// NetCyberAI staff; /api/control/leads checks again for every change, export and import.
export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const session = await getServerSession();
  const { lang } = getLang(session!.sub);
  const first = session
    ? await withTenantContext(session, (db) => listLeads(db, { status: null, source: null, q: null }, 1))
    : { leads: [], total: 0, page: 1, pageSize: PAGE_SIZE };
  return (
    <ModulePage title={t(lang, 'control.leads.title')} purpose={t(lang, 'control.leads.purpose')} icon="admissions" tone="turquoise" eyebrow={t(lang, 'group.control')}>
      <LeadsView initial={first} />
    </ModulePage>
  );
}
