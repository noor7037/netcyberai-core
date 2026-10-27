'use client';

import { useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { numberWords } from '@/components/exams/exam-format';
import { PRIMARY, TAP } from '@/components/exams/SchemeParts';
import { Icon } from '@/components/visual/Icons';
import type { MarkingException, MarkingOverview } from '@/lib/contracts/marking';
import { ask, childLine, errorWords, sheetHref, type Reply } from './parts';

// The hub's one list of things to settle (C230-AJ): a sheet that reads another child than the one chosen while scanning,
// a page that may not be an answer page (C230-AG), a page that could not be read or may be missing, a script of no one.
// Each is fixed with one tap, through the routes the script screen uses (choosing the child, settling a page, marking
// again); the rest of the class goes on meanwhile. Roll order, as the review list.

const key = (x: MarkingException) => `${x.kind}:${x.sheetId}:${x.page?.pageId ?? ''}`;

export function ExceptionsList({ paperId, overview, mayChange, onChanged }: { paperId: string; overview: MarkingOverview; mayChange: boolean; onChanged: () => void }) {
  const { t, lang } = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [takingOut, setTakingOut] = useState<string | null>(null);
  const [markAgain, setMarkAgain] = useState<string[]>([]);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const list = overview.exceptions;
  if (!list.length && !markAgain.length) return null;

  const run = async (id: string, fn: () => Promise<Reply>, done: string): Promise<Reply | null> => {
    setBusy(id);
    setNote(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) {
      setNote({ ok: false, text: errorWords(t, r) });
      return null;
    }
    setNote({ ok: true, text: done });
    onChanged();
    return r;
  };
  const confirmChild = (x: MarkingException) =>
    run(key(x), () => ask('POST', `/api/app/marking/sheets/${x.sheetId}`, { action: 'child', studentId: x.student?.studentId ?? null }), t('mk.id.chosen'));
  const settle = async (x: MarkingException, action: 'keep' | 'take_out') => {
    setTakingOut(null);
    const r = await run(key(x), () => ask('POST', `/api/app/marking/pages/${x.page?.pageId}`, { action }), action === 'keep' ? t('mk.page.kept') : t('mk.page.takenOut'));
    // A page kept after its script was marked was not marked with it: Mark again is offered, one more tap.
    if (r?.body?.markAgain === true) setMarkAgain((m) => [...m, x.sheetId]);
  };
  const again = (sheetId: string) =>
    run(`again:${sheetId}`, () => ask('POST', `/api/app/marking/sheets/${sheetId}/mark-again`), t('mk.progress.again')).then(() => setMarkAgain((m) => m.filter((s) => s !== sheetId)));

  const who = (x: MarkingException) => (x.student ? childLine(x.student) : t('mk.review.noChild'));
  const readWords = (x: MarkingException) =>
    [x.read?.name, x.read?.rollNo ? t('mk.ex.roll', { roll: x.read.rollNo }) : null, x.read?.seatNo ? t('mk.ex.seat', { seat: x.read.seatNo }) : null].filter(Boolean).join(' · ') || '—';
  const line = (x: MarkingException): string => {
    if (x.kind === 'mismatch') return t('mk.ex.mismatch', { child: who(x), read: readWords(x) });
    if (x.kind === 'not_answer_page') return t(x.page?.odd === 'id_document' ? 'mk.ex.idDocument' : 'mk.ex.notAnswer', { child: who(x), n: numberWords(x.page?.position ?? 0, lang) });
    if (x.kind === 'unreadable') return t('mk.ex.unreadable', { child: who(x) });
    if (x.kind === 'missing_page') return t('mk.ex.missing', { child: who(x) });
    return t('mk.ex.noChild');
  };

  return (
    <div data-exceptions className="flex flex-col gap-2 rounded-md border border-amber/40 bg-amber/10 p-3">
      <div className="flex flex-wrap items-center gap-x-1">
        <h3 className="flex items-center gap-2 font-bold text-amber-text"><Icon name="alert" className="h-5 w-5 shrink-0" aria-hidden="true" />{t('mk.ex.title', { n: numberWords(list.length, lang) })}</h3>
        <InfoTip>{t('mk.ex.how')}</InfoTip>
      </div>
      <ul className="flex flex-col gap-2">
        {list.map((x) => (
          <li key={key(x)} data-exception={x.kind} data-exception-sheet={x.sheetId} className="flex flex-col gap-2 rounded-md bg-white p-3">
            <p className="font-semibold">{line(x)}</p>
            <div className="flex flex-wrap gap-2">
              {x.kind === 'mismatch' && x.student && mayChange && (
                <button type="button" data-exception-confirm className={PRIMARY} disabled={busy !== null} onClick={() => void confirmChild(x)}>
                  {t('mk.ex.itIs', { name: x.student.name })}
                </button>
              )}
              {x.kind === 'not_answer_page' && x.page && mayChange && (
                <>
                  <button type="button" data-exception-keep className={TAP} disabled={busy !== null} onClick={() => void settle(x, 'keep')}>{t('mk.page.keep')}</button>
                  <button type="button" data-exception-take-out className={TAP} disabled={busy !== null} onClick={() => setTakingOut(key(x))}>{t('mk.page.takeOut')}</button>
                </>
              )}
              <a href={sheetHref(paperId, x.sheetId)} data-exception-open className={x.kind === 'mismatch' || x.kind === 'not_answer_page' ? TAP : PRIMARY}>
                {x.kind === 'mismatch' ? t('mk.ex.another') : t('mk.review.check')}
              </a>
            </div>
            {takingOut === key(x) && (
              <div role="group" aria-label={t('mk.page.takeOut')} className="flex flex-col gap-2 rounded-md bg-off-white p-3">
                <p className="font-semibold">{t('mk.page.takeOutSure')}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={PRIMARY} disabled={busy !== null} onClick={() => void settle(x, 'take_out')}>{t('mk.page.takeOutYes')}</button>
                  <button type="button" className={TAP} onClick={() => setTakingOut(null)}>{t('mk.review.confirmNo')}</button>
                </div>
              </div>
            )}
          </li>
        ))}
        {markAgain.map((sheetId) => (
          <li key={`again:${sheetId}`} data-exception="mark-again" className="flex flex-wrap items-center gap-2 rounded-md bg-white p-3">
            <p className="min-w-0 flex-1 font-semibold">{t('mk.page.keptMarkAgain')}</p>
            <button type="button" className={PRIMARY} disabled={busy !== null} onClick={() => void again(sheetId)}>{t('mk.progress.markAgain')}</button>
          </li>
        ))}
      </ul>
      {note && (
        <p role="status" data-exceptions-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-white text-slate' : 'border border-red-800/30 bg-white text-red-800'}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}
