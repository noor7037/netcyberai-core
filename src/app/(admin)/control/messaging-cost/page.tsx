import { ModulePage, PRIMARY_ACTION } from '@/components/app-ui/ModulePage';
import { CostControls } from '@/components/control/CostControls';
import { CostMonthPicker, CostMonthView } from '@/components/control/CostMonthView';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { loadCostMonth } from '@/lib/control/messaging-cost';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { indiaMonth, monthToShow } from '@/lib/whatsapp/cost';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';

// Messaging & Cost (T7, C140; by month since docs/26 slice 8f, C205). One month of India's calendar, chosen in the
// address (?month=YYYY-MM): this month when none is given, and never a month after this one. For that month: each
// live school's delivered spend, what is on its way, what the send-gate counts against the limit, what the limit
// held back, and the limit (for a month that is over, the one in force at its end); the schools at or near their
// limit or held back by it; the same month by Meta's category; six months of each school's spend; and the rates.
// The list of schools downloads as a CSV with the same rows. Below it, a rate is added and a school's limit is set.

export const dynamic = 'force-dynamic';

export default async function MessagingCostPage({ searchParams }: { searchParams: { month?: string | string[] } }) {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const thisMonth = indiaMonth();
  const month = monthToShow(searchParams.month, thisMonth);
  // The layout has already refused anyone but the founder; this runs as nca_super.
  const data = session ? await withTenantContext(session, (db) => loadCostMonth(db, month, thisMonth)) : null;
  return (
    <ModulePage
      title={t(lang, 'cost.title')}
      purpose={t(lang, 'cost.month.purpose')}
      about={t(lang, 'cost.month.about')}
      icon="chat"
      tone="cyan"
      eyebrow={t(lang, 'group.control')}
      headerLang={lang}
      primary={
        data && (
          <a href={`/api/control/messaging-cost/export?month=${data.month}`} data-cost-export className={PRIMARY_ACTION}>
            {t(lang, 'cost.month.export')}
          </a>
        )
      }
      filters={data && <CostMonthPicker data={data} lang={lang} />}
    >
      <WordsProvider words={pageWords(lang, '/control/messaging-cost')}>
      <div className="flex flex-col gap-5">
        {data && <CostMonthView data={data} lang={lang} />}
        <CostControls />
      </div>
      </WordsProvider>
    </ModulePage>
  );
}
