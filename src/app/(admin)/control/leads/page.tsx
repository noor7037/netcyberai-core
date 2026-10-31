import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { LeadsView } from '@/components/control/LeadsView';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';
import { listLeads, PAGE_SIZE } from '@/lib/control/leads';
import { autoReplyOn } from '@/lib/leads/reply';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Control → Leads (W7-L): every request the website brought in, newest first. The layout already admits only
// NetCyberAI staff; /api/control/leads checks again for every change, export and import.
export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const session = await getServerSession();
  const { lang } = getLang(session!.sub);
  const { first, autoReply } = session
    ? await withTenantContext(session, async (db) => ({ first: await listLeads(db, { status: null, source: null, q: null }, 1), autoReply: await autoReplyOn(db) }))
    : { first: { leads: [], total: 0, page: 1, pageSize: PAGE_SIZE }, autoReply: true };
  return (
    <ModulePage title={t(lang, 'control.leads.title')} purpose={t(lang, 'control.leads.purpose')} icon="admissions" tone="turquoise" eyebrow={t(lang, 'group.control')}>
      <WordsProvider words={pageWords(lang, '/control/leads')}>
        <LeadsView initial={first} autoReply={autoReply} />
      </WordsProvider>
    </ModulePage>
  );
}
