'use client';

import { useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { numberWords } from '@/components/exams/exam-format';
import { TAP } from '@/components/exams/SchemeParts';
import type { MarkingOverview, SheetState } from '@/lib/contracts/marking';
import { inProgress } from '@/lib/marking/review-view';
import { ask, errorWords, failureWords, childLine, STATE_KEYS } from './parts';

// Step 3 of a paper's AI marking: how far reading and marking have come (C347). The pages read, blank, unreadable and
// duplicate; the scripts waiting, being marked, marked and failed (with "Mark again"). The hub asks again every few
// seconds while anything is in progress and stops when nothing is. Counts only: nothing here compares children.

const tile = 'flex min-w-[7rem] flex-1 flex-col rounded-lg border-l-4 bg-off-white px-3 py-2';

export function ProgressPanel({ overview, mayChange, onChanged }: { overview: MarkingOverview; mayChange: boolean; onChanged: () => void }) {
  const { t, lang } = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  // Scripts the AI has tried as many times as it may: asking again is refused for good (a person marks them).
  const [noTries, setNoTries] = useState<string[]>([]);
  const live = overview.sheets.filter((s) => s.state !== 'set_aside');
  const count = (state: SheetState) => live.filter((s) => s.state === state).length;
  const marked = count('marked') + count('approved');
  const failed = live.filter((s) => s.state === 'failed');
  const working = inProgress(overview);
  const pages = overview.pages;
  const pagesTotal = Object.values(pages).reduce((a, b) => a + b, 0);

  const markAgain = async (sheetId: string) => {
    setBusy(sheetId);
    setNote(null);
    const r = await ask('POST', `/api/app/marking/sheets/${sheetId}/mark-again`);
    setBusy(null);
    // A script still being worked on is taken again only after a quarter of an hour.
    if (!r.ok && r.body?.code === 'tries') setNoTries((l) => [...l, sheetId]);
    if (!r.ok) return setNote({ ok: false, text: r.body?.code === 'state' && !failed.some((f) => f.sheetId === sheetId) ? t('mk.err.still_working') : errorWords(t, r) });
    setNote({ ok: true, text: t('mk.progress.again') });
    onChanged();
  };

  if (pagesTotal === 0 && live.length === 0) return <p data-progress-none className="text-slate/70">{t('mk.progress.none')}</p>;

  return (
    <div data-progress className="flex flex-col gap-3" aria-live="polite">
      {working && <p data-progress-working className="flex items-center gap-2 font-semibold"><span aria-hidden="true" className="inline-block h-3 w-3 rounded-full bg-royal motion-safe:animate-pulse" />{t('mk.progress.working')}</p>}

      <div>
        <h3 className="mb-1 font-bold">{t('mk.progress.pages')}</h3>
        <ul className="flex flex-wrap gap-2">
          <li className={`${tile} border-emerald`} data-pages="read"><span className="text-2xl font-bold">{numberWords(pages.read, lang)}</span><span>{t('mk.pages.read')}</span></li>
          <li className={`${tile} border-royal`} data-pages="new"><span className="text-2xl font-bold">{numberWords(pages.new, lang)}</span><span>{t('mk.pages.new')}</span></li>
          <li className={`${tile} border-slate/40`} data-pages="blank"><span className="text-2xl font-bold">{numberWords(pages.blank, lang)}</span><span>{t('mk.pages.blank')}</span></li>
          <li className={`${tile} border-amber`} data-pages="unreadable"><span className="text-2xl font-bold">{numberWords(pages.unreadable + pages.failed, lang)}</span><span>{t('mk.pages.unreadable')}</span></li>
          <li className={`${tile} border-slate/40`} data-pages="duplicate"><span className="text-2xl font-bold">{numberWords(pages.duplicate, lang)}</span><span>{t('mk.pages.duplicate')}</span></li>
        </ul>
      </div>

      <div>
        <h3 className="mb-1 font-bold">{t('mk.progress.scripts')}</h3>
        <ul className="flex flex-wrap gap-2">
          <li className={`${tile} border-slate/40`} data-scripts="waiting"><span className="text-2xl font-bold">{numberWords(count('waiting'), lang)}</span><span>{t('mk.scripts.waiting')}</span></li>
          <li className={`${tile} border-royal`} data-scripts="marking"><span className="text-2xl font-bold">{numberWords(count('marking'), lang)}</span><span>{t('mk.scripts.marking')}</span></li>
          <li className={`${tile} border-emerald`} data-scripts="marked"><span className="text-2xl font-bold">{numberWords(marked, lang)}</span><span>{t('mk.scripts.marked')}</span></li>
          <li className={`${tile} border-red-800`} data-scripts="failed"><span className="text-2xl font-bold">{numberWords(failed.length, lang)}</span><span>{t('mk.scripts.failed')}</span></li>
        </ul>
        {live.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            <div role="progressbar" aria-label={t('mk.progress.bar')} aria-valuemin={0} aria-valuemax={live.length} aria-valuenow={marked} className="h-2 overflow-hidden rounded-full bg-slate/10">
              <div className="h-full bg-emerald" style={{ width: `${Math.round((marked / live.length) * 100)}%` }} />
            </div>
            <p className="text-slate/70">{t('mk.progress.of', { done: marked, total: live.length })}</p>
          </div>
        )}
      </div>

      {failed.length > 0 && (
        <ul data-failed-scripts className="flex flex-col gap-2">
          {failed.map((s) => (
            <li key={s.sheetId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-800/30 p-3">
              <div className="min-w-0">
                <p className="font-semibold">{s.student ? childLine(s.student) : t('mk.review.noChild')}</p>
                <p className="text-red-800">{failureWords(t, s.failure)}</p>
              </div>
              {mayChange && !noTries.includes(s.sheetId) && (
                <button type="button" data-mark-again={s.sheetId} className={TAP} disabled={busy === s.sheetId} onClick={() => void markAgain(s.sheetId)}>
                  {t('mk.progress.markAgain')}
                </button>
              )}
              {noTries.includes(s.sheetId) && <p data-no-tries className="basis-full text-slate/80">{t('mk.err.tries')}</p>}
            </li>
          ))}
        </ul>
      )}

      {mayChange && live.some((s) => s.state === 'waiting' || s.state === 'marking') && (
        <details data-stuck className="rounded-md border border-slate/10 p-3">
          <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold">{t('mk.progress.stuck')}</summary>
          <p className="mt-1 text-slate/70">{t('mk.progress.stuckHow')}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {live.filter((s) => s.state === 'waiting' || s.state === 'marking').map((s) => (
              <li key={s.sheetId} className="flex flex-wrap items-center justify-between gap-2">
                <span>{s.student ? childLine(s.student) : t('mk.review.noChild')} · {t(STATE_KEYS[s.state])}</span>
                {!noTries.includes(s.sheetId) && (
                  <button type="button" data-mark-again={s.sheetId} className={TAP} disabled={busy === s.sheetId} onClick={() => void markAgain(s.sheetId)}>
                    {t('mk.progress.markAgain')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {note && <p role="status" data-progress-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>{note.text}</p>}
    </div>
  );
}
