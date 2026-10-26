'use client';

import { useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { numberWords } from '@/components/exams/exam-format';
import { PRIMARY, TAP } from '@/components/exams/SchemeParts';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import type { MarkingOverview } from '@/lib/contracts/marking';
import { bucketCounts, bucketOf, filterSheets, flagsInOrder, readyIds, type ReviewFilter } from '@/lib/marking/review-view';
import { ask, childLine, errorWords, FLAG_KEYS, sheetHref, STATE_KEYS } from './parts';

// Step 4 of a paper's AI marking: the review list (C347). Every script in roll order, with what needs a look as plain
// chips, the total out of the paper's marks, and its state. "Approve all N ready" takes only the marked scripts of a
// child with no flag, and says how many before it is pressed. The candidates with no script can be marked absent,
// several at once. Nothing here ranks a child, puts one above another or compares two: the order is the roll's.

export function ReviewList({ paperId, overview, mayChange, onChanged }: { paperId: string; overview: MarkingOverview; mayChange: boolean; onChanged: () => void }) {
  const { t, lang } = useT();
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const counts = bucketCounts(overview.sheets);
  const ready = readyIds(overview.sheets);
  const rows = filterSheets(overview.sheets, filter);
  const absent = new Set(overview.absent);
  const open = overview.withoutScript.filter((c) => !absent.has(c.studentId));

  const approveAll = async () => {
    setBusy(true);
    setNote(null);
    const r = await ask('POST', `/api/app/marking/papers/${paperId}/approve`, { all: 'unflagged' });
    setBusy(false);
    setConfirming(false);
    if (!r.ok) return setNote({ ok: false, text: errorWords(t, r) });
    setNote({ ok: true, text: t('mk.review.approvedMany', { n: Number(r.body?.approved ?? 0) }) });
    onChanged();
  };
  const markAbsent = async () => {
    setBusy(true);
    setNote(null);
    const r = await ask('POST', `/api/app/marking/papers/${paperId}/absent`, { studentIds: picked });
    setBusy(false);
    if (!r.ok) return setNote({ ok: false, text: errorWords(t, r) });
    setNote({ ok: true, text: t('mk.review.absentDone', { n: picked.length }) });
    setPicked([]);
    onChanged();
  };

  if (!overview.sheets.length && !overview.withoutScript.length) return <p data-review-none className="text-slate/70">{t('mk.review.none')}</p>;

  return (
    <div data-review-list className="flex flex-col gap-4">
      {overview.sheets.length > 0 && (
        <>
          <div className="flex flex-col gap-2 rounded-md bg-off-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p data-ready-count className="min-w-0 flex-1">{t(ready.length === 1 ? 'mk.review.readyOne' : 'mk.review.ready', { n: ready.length })}</p>
              <InfoTip>{t('mk.review.readyHow')}</InfoTip>
              {mayChange && (
                <button type="button" data-approve-all className={PRIMARY} disabled={busy || ready.length === 0 || !overview.ready} onClick={() => setConfirming(true)}>
                  {t('mk.review.approveAll', { n: ready.length })}
                </button>
              )}
            </div>
            {confirming && (
              <div role="group" aria-label={t('mk.review.confirmTitle')} data-approve-confirm className="flex flex-col gap-2 border-t border-slate/10 pt-2">
                <p className="font-semibold">{t('mk.review.confirm', { n: ready.length })}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" data-approve-yes className={PRIMARY} disabled={busy} onClick={() => void approveAll()}>{t('mk.review.confirmYes', { n: ready.length })}</button>
                  <button type="button" className={TAP} onClick={() => setConfirming(false)}>{t('mk.review.confirmNo')}</button>
                </div>
              </div>
            )}
          </div>

          <SegmentedControl
            id="mk-review-filter"
            label={t('mk.review.filter')}
            hideLabel
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('mk.review.all', { n: overview.sheets.filter((s) => s.state !== 'set_aside').length }) },
              { value: 'needs', label: t('mk.review.needs', { n: counts.needs }) },
              { value: 'ready', label: t('mk.review.readyTab', { n: counts.ready }) },
              { value: 'approved', label: t('mk.review.approvedTab', { n: counts.approved }) },
            ]}
          />

          {rows.length === 0 && <p className="text-slate/70">{t('mk.review.noneHere')}</p>}
          <ol data-review-rows className="flex flex-col gap-2">
            {rows.map((s) => {
              const bucket = bucketOf(s);
              const flags = flagsInOrder(s.flags);
              return (
                <li key={s.sheetId} data-sheet={s.sheetId} data-bucket={bucket} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate/10 bg-white p-3">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="font-bold">{s.student ? childLine(s.student) : t('mk.review.noChild')}</p>
                    <p className="text-slate/70">{t('mk.review.pages', { n: s.pages })}{s.student?.seatNo ? ` · ${s.student.seatNo}` : ''}</p>
                    {flags.length > 0 && (
                      <ul className="mt-1 flex flex-wrap gap-1">
                        {flags.map((f) => (
                          <li key={f}><Badge variant="warning">{t(FLAG_KEYS[f])}</Badge></li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <p data-sheet-total className="min-w-[5rem] font-bold">
                    {s.total === null ? '—' : t('mk.review.total', { score: numberWords(s.total, lang), max: numberWords(s.max, lang) })}
                  </p>
                  <Badge variant={bucket === 'approved' ? 'success' : bucket === 'needs' ? 'warning' : 'neutral'}>{t(STATE_KEYS[s.state])}</Badge>
                  <a href={sheetHref(paperId, s.sheetId)} data-review-link className={bucket === 'needs' ? PRIMARY : TAP}>
                    {s.state === 'waiting' || s.state === 'marking' ? t('mk.review.open') : bucket === 'approved' ? t('mk.review.seeIt') : t('mk.review.check')}
                  </a>
                </li>
              );
            })}
          </ol>
        </>
      )}

      {(overview.withoutScript.length > 0) && (
        <div data-no-script className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-1">
            <h3 className="font-bold">{t('mk.absent.title', { n: overview.withoutScript.length })}</h3>
            <InfoTip>{t('mk.absent.how')}</InfoTip>
          </div>
          <ul className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
            {overview.withoutScript.map((c) => (
              <li key={c.studentId} data-candidate={c.studentId}>
                {absent.has(c.studentId) ? (
                  <p className="flex min-h-[44px] items-center gap-2 py-2">
                    <span>{childLine(c)}</span>
                    <Badge>{t('mk.absent.is')}</Badge>
                  </p>
                ) : mayChange ? (
                  <Checkbox id={`mk-absent-${c.studentId}`} label={childLine(c)} checked={picked.includes(c.studentId)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.studentId] : picked.filter((x) => x !== c.studentId))} />
                ) : (
                  <p className="flex min-h-[44px] items-center py-2">{childLine(c)}</p>
                )}
              </li>
            ))}
          </ul>
          {mayChange && open.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" data-absent-save className={PRIMARY} disabled={busy || picked.length === 0} onClick={() => void markAbsent()}>
                {t('mk.absent.mark', { n: picked.length })}
              </button>
              <button type="button" className={TAP} onClick={() => setPicked(picked.length === open.length ? [] : open.map((c) => c.studentId))}>
                {picked.length === open.length ? t('mk.absent.none') : t('mk.absent.all')}
              </button>
            </div>
          )}
        </div>
      )}

      {note && (
        <p role="status" data-review-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}
