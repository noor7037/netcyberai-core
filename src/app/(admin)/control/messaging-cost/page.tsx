import { ModulePage } from '@/components/app-ui/ModulePage';
import { CostControls } from '@/components/control/CostControls';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { loadMessagingCost, type CostLine, type MessagingCost } from '@/lib/control/messaging-cost';
import { t, tOr, type Lang } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Messaging & Cost (T7, C140): read only. What the send-gate recorded for
// live schools in the last 30 days, and the rates it was costed with. A
// category with no verified rate is named at the top: its messages count as
// zero and are shown apart, so a missing rate is never mistaken for "free".

export const dynamic = 'force-dynamic';

const rupees = (paise: number) => `\u20b9${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TH = 'px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate/70';
const TD = 'px-3 py-2 text-sm text-slate tabular-nums';

function Numbers({ line }: { line: CostLine }) {
  return (
    <>
      <td className={TD}>{line.attempts.toLocaleString('en-IN')}</td>
      <td className={TD}>{line.billable.toLocaleString('en-IN')}</td>
      <td className={TD}>{rupees(line.costPaise)}</td>
      <td className={TD}>{rupees(line.gstPaise)}</td>
      <td className={`${TD} font-semibold`}>{rupees(line.costPaise + line.gstPaise)}</td>
      <td className={TD}>{line.rateNotVerified.toLocaleString('en-IN')}</td>
    </>
  );
}

function View({ data, lang }: { data: MessagingCost; lang: Lang }) {
  const category = (c: string) => tOr(lang, `cost.category.${c}`, c);
  const heads = ['cost.attempts', 'cost.billable', 'cost.cost', 'cost.gst', 'cost.total', 'cost.unverified'] as const;
  return (
    <div lang={lang} className="flex flex-col gap-5">
      {data.categoriesWithoutRate.length > 0 && (
        <div role="status" data-rate-gap className="rounded-xl border border-tangerine/40 bg-tangerine/10 p-4">
          <p className="text-base font-bold text-slate">{t(lang, 'cost.gap.title')}</p>
          <p className="max-w-prose text-sm text-slate">{t(lang, 'cost.gap.text', { categories: data.categoriesWithoutRate.map(category).join(', ') })}</p>
        </div>
      )}

      {data.schools.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate/20 bg-white p-5">
          <p className="text-base font-bold text-slate">{t(lang, 'cost.empty.title')}</p>
          <p className="max-w-prose text-sm text-slate">{t(lang, 'cost.empty.do')}</p>
        </div>
      ) : (
        <section aria-labelledby="cost-by-school" className="flex flex-col gap-2">
          <h2 id="cost-by-school" className="text-lg font-bold text-slate">
            {t(lang, 'cost.bySchool')}
          </h2>
          <div className="overflow-x-auto rounded-xl border border-slate/10 bg-white">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-slate/10">
                  <th scope="col" className={TH}>{t(lang, 'cost.school')}</th>
                  <th scope="col" className={TH}>{t(lang, 'cost.category')}</th>
                  {heads.map((k) => (
                    <th key={k} scope="col" className={TH}>{t(lang, k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.schools.flatMap((s) =>
                  s.categories.map((c, i) => (
                    <tr key={`${s.schoolId}-${c.category}`} className="border-b border-slate/10">
                      <th scope="row" className={`${TD} text-left font-semibold`}>{i === 0 ? s.schoolName : ''}</th>
                      <td className={TD}>{category(c.category)}</td>
                      <Numbers line={c} />
                    </tr>
                  ))
                )}
                <tr data-cost-totals>
                  <th scope="row" colSpan={2} className={`${TD} text-left font-bold`}>{t(lang, 'cost.totals')}</th>
                  <Numbers line={data.totals} />
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section aria-labelledby="cost-rates" className="flex flex-col gap-2">
        <h2 id="cost-rates" className="text-lg font-bold text-slate">
          {t(lang, 'cost.rates')}
        </h2>
        {data.rates.length === 0 ? (
          <p className="max-w-prose text-sm text-slate">{t(lang, 'cost.rates.none')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate/10 bg-white">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-slate/10">
                  {(['cost.category', 'cost.rate', 'cost.gstPercent', 'cost.from', 'cost.source', 'cost.verifiedOn', 'cost.inForce'] as const).map((k) => (
                    <th key={k} scope="col" className={TH}>{t(lang, k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rates.map((r, i) => (
                  <tr key={`${r.category}-${r.effectiveFrom}-${i}`} className="border-b border-slate/10">
                    <th scope="row" className={`${TD} text-left font-semibold`}>{category(r.category)}</th>
                    <td className={TD}>{rupees(r.ratePaise)}</td>
                    <td className={TD}>{r.gstPercent}</td>
                    <td className={TD}>{r.effectiveFrom}</td>
                    <td className={`${TD} break-words`}>{r.verifiedSource}</td>
                    <td className={TD}>{r.verifiedAt.slice(0, 10)}</td>
                    <td className={TD}>{t(lang, r.inForce ? 'cost.inForce' : 'cost.notInForce')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default async function MessagingCostPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  // The layout has already refused anyone but the founder; this runs as nca_super.
  const data = session ? await withTenantContext(session, (db) => loadMessagingCost(db)) : null;
  return (
    <ModulePage title={t(lang, 'cost.title')} purpose={t(lang, 'cost.purpose')} icon="chat" tone="cyan" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      <div className="flex flex-col gap-5">
        {data && <View data={data} lang={lang} />}
        <CostControls />
      </div>
    </ModulePage>
  );
}
