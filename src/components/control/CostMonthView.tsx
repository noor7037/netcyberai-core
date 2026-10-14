import Link from 'next/link';
import { QUIET_ACTION } from '@/components/app-ui/ModulePage';
import { Badge } from '@/components/ui/Badge';
import { COST_LIST_COLUMNS, costListCells, LIMIT_STATE_KEY, type CostMonth, type MonthLine } from '@/lib/control/messaging-cost';
import { t, tOr, type Lang } from '@/lib/i18n';
import { shiftMonth } from '@/lib/whatsapp/cost';

// Control → Messaging & Cost, one month (docs/26 slice 8f, C205). Drawn on the server from loadCostMonth: the list
// of live schools (the rows the CSV export writes), the schools at or near their limit or held back by it, the same
// month by category, six months of each school's spend, and the rates. One sentence says what every figure counts.

const TH = 'px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate/70';
const TD = 'px-3 py-2 text-sm text-slate tabular-nums';
const PATH = '/control/messaging-cost';
// The schools the page lists against their limit, in this order: at or over it, then those it held a message back
// for, then those near it.
const FLAG_ORDER: readonly string[] = ['reached', 'held', 'near'];
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const count = (n: number) => n.toLocaleString('en-IN');
// A cell of the list as the screen shows it: an amount gets the rupee sign and commas, a count its commas; words stay.
const shown = (cell: string | number) => (typeof cell === 'number' ? count(cell) : /^\d+\.\d{2}$/.test(cell) ? rupees(Math.round(Number(cell) * 100)) : cell);

export function monthName(lang: Lang, month: string, short = false): string {
  return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { month: short ? 'short' : 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
}

// The month switch: any month from the first logged message to this one, and one step either way.
// The select is keyed by the month shown. A step by a link changes the month without loading the page afresh, and
// React does not apply a new defaultValue to a select it has already drawn: without the key it would go on naming
// the month shown before, and "Show month" would jump back to it.
export function CostMonthPicker({ data, lang }: { data: CostMonth; lang: Lang }) {
  return (
    <form method="get" action={PATH} data-cost-month-picker lang={lang} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor="cost-month" className="text-sm font-semibold text-slate">
          {t(lang, 'cost.month.month')}
        </label>
        <select key={data.month} id="cost-month" name="month" defaultValue={data.month} className="min-h-[44px] rounded-md border border-slate/20 bg-white px-3 text-sm text-slate">
          {data.months.map((m) => (
            <option key={m} value={m}>
              {m === data.thisMonth ? `${monthName(lang, m)} (${t(lang, 'cost.month.thisMonth')})` : monthName(lang, m)}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" data-cost-month-show className={QUIET_ACTION}>
        {t(lang, 'cost.month.show')}
      </button>
      {data.month > data.firstMonth && (
        <Link href={`${PATH}?month=${shiftMonth(data.month, -1)}`} data-cost-month-earlier className={QUIET_ACTION}>
          {t(lang, 'cost.month.earlier')}
        </Link>
      )}
      {data.month < data.thisMonth && (
        <Link href={`${PATH}?month=${shiftMonth(data.month, 1)}`} data-cost-month-later className={QUIET_ACTION}>
          {t(lang, 'cost.month.later')}
        </Link>
      )}
    </form>
  );
}

function CategoryNumbers({ line }: { line: MonthLine }) {
  return (
    <>
      <td className={TD}>{count(line.attempts)}</td>
      <td className={TD}>{count(line.delivered)}</td>
      <td className={TD}>{rupees(line.costPaise)}</td>
      <td className={TD}>{rupees(line.gstPaise)}</td>
      <td className={`${TD} font-semibold`}>{rupees(line.spentPaise)}</td>
      <td className={TD}>{count(line.onItsWay)}</td>
      <td className={TD}>{count(line.heldForBudget)}</td>
      <td className={TD}>{count(line.heldNoRate)}</td>
      <td className={TD}>{count(line.rateNotVerified)}</td>
    </>
  );
}

export function CostMonthView({ data, lang }: { data: CostMonth; lang: Lang }) {
  const category = (c: string) => tOr(lang, `cost.category.${c}`, c);
  const month = monthName(lang, data.month);
  const flagged = data.schools.filter((s) => FLAG_ORDER.includes(s.state)).sort((a, b) => FLAG_ORDER.indexOf(a.state) - FLAG_ORDER.indexOf(b.state));
  return (
    <div lang={lang} data-cost-month={data.month} className="flex flex-col gap-5">
      {data.categoriesWithoutRate.length > 0 && (
        <div role="status" data-rate-gap className="rounded-xl border border-tangerine/40 bg-tangerine/10 p-4">
          <p className="text-base font-bold text-slate">{t(lang, 'cost.gap.title')}</p>
          <p className="max-w-prose text-sm text-slate">{t(lang, 'cost.gap.text', { categories: data.categoriesWithoutRate.map(category).join(', ') })}</p>
        </div>
      )}

      <p data-cost-counts className="max-w-prose rounded-xl border border-slate/10 bg-off-white p-4 text-sm text-slate">
        {t(lang, 'cost.month.counts', { month })}
      </p>

      <section aria-labelledby="cost-flagged" data-cost-flagged className="flex flex-col gap-2">
        <h2 id="cost-flagged" className="text-lg font-bold text-slate">
          {t(lang, 'cost.month.flagged.title')}
        </h2>
        {flagged.length === 0 && <p className="max-w-prose text-sm text-slate">{t(lang, 'cost.month.flagged.none', { month })}</p>}
        {flagged.length > 0 && (
          <ul className="flex flex-col gap-2">
            {flagged.map((s) => (
              <li key={s.schoolId} data-cost-flag={s.state} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate/10 bg-white p-3 text-sm text-slate">
                <span className="font-bold">{s.schoolName}</span>
                <Badge variant={s.state === 'near' ? 'warning' : 'danger'}>{t(lang, LIMIT_STATE_KEY[s.state])}</Badge>
                <span>{t(lang, 'cost.month.flagged.line', { counted: rupees(s.countedPaise), limit: rupees(s.budgetPaise ?? 0), held: count(s.heldForBudget) })}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="max-w-prose text-sm text-slate/70">{t(lang, 'cost.month.flagged.rule')}</p>
        {data.month < data.thisMonth && (
          <p data-cost-limit-then className="max-w-prose text-sm text-slate/70">
            {t(lang, 'cost.month.limitThen')}
          </p>
        )}
      </section>

      <section aria-labelledby="cost-list" className="flex flex-col gap-2">
        <h2 id="cost-list" className="text-lg font-bold text-slate">
          {t(lang, 'cost.month.list.title', { month })}
        </h2>
        {data.schools.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate/20 bg-white p-5">
            <p className="text-base font-bold text-slate">{t(lang, 'cost.month.list.none.title')}</p>
            <p className="max-w-prose text-sm text-slate">{t(lang, 'cost.month.list.none.do')}</p>
          </div>
        )}
        {data.schools.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate/10 bg-white">
            <table data-cost-list className="w-full min-w-[1100px] border-collapse">
              <thead>
                <tr className="border-b border-slate/10">
                  {COST_LIST_COLUMNS.map((k) => (
                    <th key={k} scope="col" className={TH}>
                      {t(lang, k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.schools.map((s) => {
                  const [name, ...cells] = costListCells(lang, s);
                  return (
                    <tr key={s.schoolId} data-cost-list-row={s.schoolId} data-cost-state={s.state} className="border-b border-slate/10">
                      <th scope="row" className={`${TD} text-left font-semibold`}>
                        {name}
                      </th>
                      {cells.map((cell, i) => (
                        <td key={COST_LIST_COLUMNS[i + 1]} className={TD}>
                          {shown(cell)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="cost-by-school" className="flex flex-col gap-2">
        <h2 id="cost-by-school" className="text-lg font-bold text-slate">
          {t(lang, 'cost.month.byCategory', { month })}
        </h2>
        {data.byCategory.length === 0 && (
          <div data-cost-empty className="rounded-xl border border-dashed border-slate/20 bg-white p-5">
            <p className="text-base font-bold text-slate">{t(lang, 'cost.month.empty.title', { month })}</p>
            <p className="max-w-prose text-sm text-slate">{t(lang, 'cost.month.empty.do')}</p>
          </div>
        )}
        {data.byCategory.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate/10 bg-white">
            <table data-cost-categories className="w-full min-w-[1080px] border-collapse">
              <thead>
                <tr className="border-b border-slate/10">
                  {(['cost.school', 'cost.category', 'cost.attempts', 'cost.month.delivered', 'cost.cost', 'cost.gst', 'cost.total', 'cost.month.onItsWay', 'cost.month.held', 'cost.month.heldNoRate', 'cost.month.rateNotVerified'] as const).map((k) => (
                    <th key={k} scope="col" className={TH}>
                      {t(lang, k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.byCategory.flatMap((s) =>
                  s.categories.map((c, i) => (
                    <tr key={`${s.schoolId}-${c.category}`} className="border-b border-slate/10">
                      <th scope="row" className={`${TD} text-left font-semibold`}>
                        {i === 0 ? s.schoolName : ''}
                      </th>
                      <td className={TD}>{category(c.category)}</td>
                      <CategoryNumbers line={c} />
                    </tr>
                  ))
                )}
                <tr data-cost-totals>
                  <th scope="row" colSpan={2} className={`${TD} text-left font-bold`}>
                    {t(lang, 'cost.totals')}
                  </th>
                  <CategoryNumbers line={data.totals} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.history.schools.length > 0 && (
        <section aria-labelledby="cost-history" className="flex flex-col gap-2">
          <div>
            <h2 id="cost-history" className="text-lg font-bold text-slate">
              {t(lang, 'cost.month.history.title', { month })}
            </h2>
            <p className="max-w-prose text-sm text-slate/70">{t(lang, 'cost.month.history.how')}</p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate/10 bg-white">
            <table data-cost-history className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-slate/10">
                  <th scope="col" className={TH}>
                    {t(lang, 'cost.school')}
                  </th>
                  {data.history.months.map((m) => (
                    <th key={m} scope="col" className="px-3 py-0 text-left text-sm font-semibold">
                      <Link href={`${PATH}?month=${m}`} aria-current={m === data.month ? 'true' : undefined} className="inline-flex min-h-[44px] items-center text-sapphire underline">
                        {monthName(lang, m, true)}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.history.schools.map((s) => (
                  <tr key={s.schoolId} data-cost-history-row={s.schoolId} className="border-b border-slate/10">
                    <th scope="row" className={`${TD} text-left font-semibold`}>
                      {s.schoolName}
                    </th>
                    {s.spentPaise.map((paise, i) => (
                      <td key={data.history.months[i]} className={TD}>
                        {rupees(paise)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section aria-labelledby="cost-rates" className="flex flex-col gap-2">
        <h2 id="cost-rates" className="text-lg font-bold text-slate">
          {t(lang, 'cost.rates')}
        </h2>
        {data.rates.length === 0 && <p className="max-w-prose text-sm text-slate">{t(lang, 'cost.rates.none')}</p>}
        {data.rates.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate/10 bg-white">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-slate/10">
                  {(['cost.category', 'cost.rate', 'cost.gstPercent', 'cost.from', 'cost.source', 'cost.verifiedOn', 'cost.inForce'] as const).map((k) => (
                    <th key={k} scope="col" className={TH}>
                      {t(lang, k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rates.map((r, i) => (
                  <tr key={`${r.category}-${r.effectiveFrom}-${i}`} className="border-b border-slate/10">
                    <th scope="row" className={`${TD} text-left font-semibold`}>
                      {category(r.category)}
                    </th>
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
