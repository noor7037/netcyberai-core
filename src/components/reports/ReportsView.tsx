'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { explainError } from '@/lib/errors/catalogue';
import { isMessageKey, type MessageKey } from '@/lib/i18n';
import type { RangeId } from '@/lib/insights/types';
import { DEFAULT_REPORT_RANGE, REPORT_RANGE_IDS, isRealDay, isReportRangeId, rangeQuery } from '@/lib/reports/range';
import { reportEmpty, reportTable } from '@/lib/reports/table';
import { REPORT_GROUPS, isReportId, type ReportId, type ReportListed, type ReportResult } from '@/lib/reports/types';

// Reports (docs/26 slice 8h, C207). The list of this person's reports (the server sends only the ones their role
// may read and whose module the school has on); a report opens below it with its days, its table and total row,
// when it was run, the rule in one sentence under "Why this?", and "Download CSV", which asks the server for the
// same report with the same days. This screen counts nothing: every figure is the server's, written by the same
// functions the file is written by (src/lib/reports/table.ts).

type Asked = { rangeId: RangeId } | { from: string; to: string };
type Listing = { reports: ReportListed[]; today: string };

const TAP = 'inline-flex min-h-[44px] items-center justify-center rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'inline-flex min-h-[44px] items-center justify-center rounded-md bg-sapphire px-5 text-sm font-semibold text-white';
const FIELD = 'min-h-[44px] rounded-md border border-slate/20 bg-white px-3 text-sm text-slate';
const WHY = 'inline-flex min-h-[44px] cursor-pointer items-center font-semibold text-sapphire underline';
const NUMBERS: readonly string[] = ['count', 'inr_paise', 'percent'];

// The report and the days in the address, so a report can be bookmarked and opened again.
function readAddress(): { open: ReportId | null; asked: Asked } {
  const q = new URLSearchParams(window.location.search);
  const report = q.get('report');
  const [from, to, range] = [q.get('from'), q.get('to'), q.get('range')];
  const asked: Asked = isRealDay(from) && isRealDay(to) ? { from, to } : { rangeId: isReportRangeId(range) ? range : DEFAULT_REPORT_RANGE };
  return { open: isReportId(report) ? report : null, asked };
}
function writeAddress(open: ReportId | null, asked: Asked) {
  window.history.replaceState(null, '', open ? `${window.location.pathname}?report=${open}&${rangeQuery(asked)}` : window.location.pathname);
}

export function ReportsView() {
  const { t, lang, tCount } = useT();
  const [listing, setListing] = useState<Listing | null>(null);
  const [listState, setListState] = useState<'loading' | 'ok' | 'failed' | 'not_yours'>('loading');
  const [open, setOpen] = useState<ReportId | null>(null);
  const [asked, setAsked] = useState<Asked>({ rangeId: DEFAULT_REPORT_RANGE });
  const [dates, setDates] = useState({ from: '', to: '' });
  const [report, setReport] = useState<ReportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const latest = useRef(0);
  const opened = useRef<HTMLElement | null>(null);
  const tapped = useRef(false);

  // A report opens below the list. On a phone the list fills the screen, so a report chosen by a tap is brought
  // into view (at once: no movement to wait for). One opened from the address leaves the page where it is.
  useEffect(() => {
    if (!open || !tapped.current) return;
    tapped.current = false;
    const el = opened.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) el.scrollIntoView({ block: 'start' });
  }, [open]);

  useEffect(() => {
    const at = readAddress();
    setAsked(at.asked);
    if ('from' in at.asked) setDates(at.asked);
    void (async () => {
      const res = await fetch('/api/app/reports').catch(() => null);
      const got = res?.ok ? ((await res.json().catch(() => null)) as Listing | null) : null;
      if (!got) return setListState(res?.status === 403 ? 'not_yours' : 'failed');
      setListing(got);
      setListState('ok');
      // A report in the address that is not this person's is simply not opened.
      if (at.open && got.reports.some((r) => r.id === at.open)) setOpen(at.open);
    })();
  }, []);

  useEffect(() => {
    if (!open) return;
    const mine = ++latest.current;
    setBusy(true);
    setRefusal(null);
    writeAddress(open, asked);
    // A report about this moment is asked for without days: the days chosen for another report do not matter to it.
    const aboutNow = listing?.reports.find((r) => r.id === open)?.period === 'now';
    void (async () => {
      const res = await fetch(`/api/app/reports/${open}${aboutNow ? '' : `?${rangeQuery(asked)}`}`).catch(() => null);
      const body = res ? await res.json().catch(() => null) : null;
      if (mine !== latest.current) return; // a later choice has been made since
      setBusy(false);
      if (!res?.ok || !body?.report) {
        setReport(null);
        const own = `rpt.err.${body?.code}`;
        return setRefusal(isMessageKey(own) ? t(own as MessageKey) : explainError(body, t('rpt.err.other'), lang, res?.status));
      }
      const got = body.report as ReportResult;
      setReport(got);
      if (got.range) setDates(got.range);
    })();
    // The words (t, lang) do not change which report is asked for, and a report is opened only from the loaded list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, asked]);

  if (listState === 'loading') return null;
  if (listState === 'failed') return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('rpt.failed')}</p>;
  if (listState === 'not_yours' || !listing || listing.reports.length === 0) {
    const which = listState === 'not_yours' ? 'none' : 'noneOn';
    return (
      <div lang={lang} data-reports-none={which} className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-slate/20 bg-white p-5">
        <p className="text-base font-bold text-slate">{t(`rpt.${which}.title` as MessageKey)}</p>
        <p className="max-w-prose text-sm text-slate">{t(`rpt.${which}.do` as MessageKey)}</p>
      </div>
    );
  }

  const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const ranAt = (iso: string) => {
    const at = new Date(iso);
    const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
    return t('rpt.ranAt', { time: at.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }), day: at.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) });
  };
  const source = (s: string) => (isMessageKey(`rpt.source.${s}`) ? t(`rpt.source.${s}` as MessageKey) : isMessageKey(`dash.source.${s}`) ? t(`dash.source.${s}` as MessageKey) : s);
  const chosen = listing.reports.find((r) => r.id === open) ?? null;
  const shown = report && report.id === open ? report : null;
  const table = shown ? reportTable(lang, shown) : null;
  const nothing = shown ? reportEmpty(lang, shown) : null;
  const twoDates = isRealDay(dates.from) && isRealDay(dates.to);

  return (
    <div lang={lang} data-reports className="flex flex-col gap-4 text-sm text-slate">
      <section data-report-list className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
        <div>
          <h2 className="text-base font-bold">{t('rpt.list.title')}</h2>
          <p className="text-slate/70">{t('rpt.list.how')}</p>
        </div>
        {REPORT_GROUPS.filter((g) => listing.reports.some((r) => r.group === g)).map((g) => (
          <div key={g} data-report-group={g} className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate">{t(`rpt.group.${g}` as MessageKey)}</h3>
            <ul className="grid gap-2 md:grid-cols-2">
              {listing.reports.filter((r) => r.group === g).map((r) => (
                <li key={r.id}>
                  <button type="button" data-report-item={r.id} aria-pressed={r.id === open} className={`flex min-h-[44px] w-full flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left ${r.id === open ? 'border-sapphire bg-off-white' : 'border-slate/10 bg-white'}`}
                    onClick={() => {
                      tapped.current = true;
                      setOpen(r.id);
                    }}
                  >
                    <span className="font-bold text-slate">{t(`rpt.${r.id}.title` as MessageKey)}</span>
                    <span className="text-slate/70">{t(`rpt.${r.id}.about` as MessageKey)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {!chosen ? (
        <p data-report-choose className="rounded-md bg-off-white px-3 py-2">{t('rpt.choose')}</p>
      ) : (
        <section ref={opened} data-report={chosen.id} data-report-state={busy ? 'loading' : shown ? 'shown' : 'refused'} className="flex min-w-0 scroll-mt-20 flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
          <div>
            <h2 className="text-base font-bold">{t(`rpt.${chosen.id}.title` as MessageKey)}</h2>
            <p className="text-slate/70">{t(`rpt.${chosen.id}.about` as MessageKey)}</p>
          </div>

          {chosen.period === 'now' ? (
            <p data-report-now className="rounded-md bg-off-white px-3 py-2">{t('rpt.range.now')}</p>
          ) : (
            <div data-report-range className="flex flex-col gap-3">
              <div role="group" aria-label={t('rpt.range.label')} className="flex flex-wrap gap-2">
                {REPORT_RANGE_IDS.map((id) => {
                  const on = 'rangeId' in asked && asked.rangeId === id;
                  return (
                    <button key={id} type="button" data-report-range-id={id} aria-pressed={on} className={on ? PRIMARY : TAP} onClick={() => setAsked({ rangeId: id })}>
                      {t(`dash.range.${id}` as MessageKey)}
                    </button>
                  );
                })}
              </div>
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (twoDates) setAsked({ from: dates.from, to: dates.to });
                }}
              >
                <p className="w-full font-semibold">{t('rpt.range.dates')}</p>
                <label className="flex flex-col gap-1">
                  <span className="text-slate/70">{t('rpt.range.from')}</span>
                  <input type="date" data-report-from className={FIELD} value={dates.from} onChange={(e) => setDates({ ...dates, from: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-slate/70">{t('rpt.range.to')}</span>
                  <input type="date" data-report-to className={FIELD} value={dates.to} onChange={(e) => setDates({ ...dates, to: e.target.value })} />
                </label>
                <button type="submit" data-report-show disabled={!twoDates} className={'from' in asked ? PRIMARY : TAP}>
                  {t('rpt.range.show')}
                </button>
              </form>
            </div>
          )}

          {busy && <p role="status" data-report-loading className="rounded-md bg-off-white px-3 py-2">{t('rpt.loading')}</p>}
          {refusal && !busy && <p role="alert" data-report-refused className="rounded-md bg-off-white px-3 py-2 font-semibold">{refusal}</p>}

          {shown && table && !busy && (
            <>
              <p data-report-ran className="text-slate/70">
                {shown.range && <span data-report-days={`${shown.range.from}/${shown.range.to}`}>{shown.range.from === shown.range.to ? t('rpt.covers.one', { day: day(shown.range.from) }) : t('rpt.covers', { from: day(shown.range.from), to: day(shown.range.to) })} · </span>}
                {ranAt(shown.ranAt)} · <span data-report-row-count={shown.rows.length}>{tCount('rpt.rows', shown.rows.length)}</span>
              </p>

              {!table.total ? (
                <div data-report-empty={shown.state} className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-slate/20 bg-white p-5">
                  <p className="text-base font-bold text-slate">{nothing?.title}</p>
                  <p className="max-w-prose text-sm text-slate">{nothing?.do}</p>
                </div>
              ) : (
                <>
                  <div className="min-w-0 md:overflow-x-auto">
                    <table data-report-table className="block w-full border-collapse md:table">
                      <thead className="hidden md:table-header-group">
                        <tr>
                          {shown.columns.map((c, i) => (
                            <th key={c.key} scope="col" className={`border-b border-slate/20 px-3 py-2 font-bold ${NUMBERS.includes(c.unit) ? 'text-right' : 'text-left'}`}>
                              {table.headings[i]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="flex flex-col gap-2 md:table-row-group">
                        {table.rows.map((cells, r) => (
                          <tr key={r} data-report-row className="flex flex-col gap-1 rounded-md border border-slate/10 p-3 md:table-row md:rounded-none md:border-0 md:p-0">
                            {cells.map((cell, i) => {
                              const c = shown.columns[i];
                              return i === 0 ? (
                                <th key={c.key} scope="row" data-cell={c.key} className="text-left font-bold md:border-b md:border-slate/10 md:px-3 md:py-2">
                                  {cell}
                                </th>
                              ) : (
                                <td key={c.key} data-cell={c.key} className={`flex justify-between gap-3 md:table-cell md:border-b md:border-slate/10 md:px-3 md:py-2 ${NUMBERS.includes(c.unit) ? 'tabular-nums md:text-right' : ''}`}>
                                  <span className="text-slate/70 md:hidden">{table.headings[i]}</span>
                                  <span className="min-w-0 break-words text-right">{cell}</span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="mt-2 block md:mt-0 md:table-footer-group">
                        <tr data-report-total className="flex flex-col gap-1 rounded-md border border-slate/20 bg-off-white p-3 font-bold md:table-row md:rounded-none md:border-0 md:p-0">
                          {table.total.map((cell, i) => {
                            const c = shown.columns[i];
                            return i === 0 ? (
                              <th key={c.key} scope="row" data-total-cell={c.key} className="text-left md:px-3 md:py-2">
                                {cell}
                              </th>
                            ) : (
                              <td key={c.key} data-total-cell={c.key} className={`justify-between gap-3 md:table-cell md:px-3 md:py-2 ${cell === '' ? 'hidden' : 'flex'} ${NUMBERS.includes(c.unit) ? 'tabular-nums md:text-right' : ''}`}>
                                <span className="text-slate/70 md:hidden">{table.headings[i]}</span>
                                <span>{cell}</span>
                              </td>
                            );
                          })}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {shown.notes.map((n) => (
                    <p key={n.key} data-report-note className="rounded-md bg-off-white px-3 py-2">{t(n.key, n.params)}</p>
                  ))}
                  <div className="flex flex-col items-start gap-1">
                    {/* The file is asked for with the very days on the screen, so it has these rows even after midnight. */}
                    <a href={`/api/app/reports/${shown.id}/export${shown.range ? `?${rangeQuery(shown.range)}` : ''}`} data-report-export className={PRIMARY}>
                      {t('rpt.download')}
                    </a>
                    <p className="text-slate/70">{t('rpt.download.how')}</p>
                  </div>
                </>
              )}

              <details data-report-why>
                <summary className={WHY}>{t('myDay.why')}</summary>
                <div className="flex flex-col gap-1 pb-1">
                  <p>{isMessageKey(shown.rule.key) ? t(shown.rule.key as MessageKey) : shown.rule.key}</p>
                  <p>{t('rpt.why.total')}</p>
                  <p>{t('rpt.why.source', { sources: shown.sources.map(source).join(', ') })}</p>
                  <p>{t('rpt.why.version', { version: shown.rule.version })}</p>
                </div>
              </details>
            </>
          )}
        </section>
      )}
    </div>
  );
}
