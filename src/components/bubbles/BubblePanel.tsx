'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { dayWords, numberWords } from '@/components/exams/exam-format';
import { PRIMARY, TAP } from '@/components/exams/SchemeParts';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/components/visual/Icons';
import type { BubblePrint, BubbleScreen, PaperSitting } from '@/lib/contracts/marking';
import type { MessageKey } from '@/lib/i18n';
import { downloadBlob, safeFilename } from '@/lib/pdf/browser';
import { ask, childLine, errorWords, scanHref } from '../marking/parts';
import { bubbleSheetsPdf } from './sheet-pdf';

// A paper's bubble (OMR) sheets on its marking screen (docs/36 §1.2, C364): how the paper is answered, the marks taken
// off a wrong answer, printing the sheets (the database numbers them in roll order; the PDF is made here), scanning them,
// and a mixed paper's read sheets that name no child yet. The server and the database decide who may do what; this
// screen only shows it. No child is ranked or compared: lists are in roll order or as read.

const PROBLEM_KEYS: Record<NonNullable<BubbleScreen['problem']>, MessageKey> = {
  no_choice: 'bub.problem.no_choice',
  sheet_full: 'bub.problem.sheet_full',
  questions: 'bub.problem.questions',
};
const WRONG_RE = /^(10(\.0)?|[0-9](\.[0-9])?)$/;
export const bubbleScanHref = (paperId: string) => `${scanHref(paperId)}?sheets=bubble`;

export function BubblePanel({ paperId, onScreen, onChanged }: { paperId: string; onScreen: (s: BubbleScreen | null) => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const [screen, setScreen] = useState<BubbleScreen | null>(null);
  const [wrong, setWrong] = useState('');
  const [blanks, setBlanks] = useState('0');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const r = await ask('GET', `/api/app/marking/papers/${paperId}/bubbles`);
    const s = r.ok ? (r.body as unknown as BubbleScreen) : null;
    setScreen(s);
    onScreen(s);
    if (s) setWrong((w) => (w === '' ? String(s.wrongMarks) : w));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!screen) return null;
  const may = screen.mayChange;
  const act = async (payload: Record<string, unknown>, done: (body: Record<string, unknown>) => string) => {
    setBusy(true);
    setNote(null);
    const r = await ask('POST', `/api/app/marking/papers/${paperId}/bubbles`, payload);
    if (!r.ok) {
      setBusy(false);
      return setNote({ ok: false, text: errorWords(t, r) });
    }
    await load();
    onChanged();
    setBusy(false);
    setNote({ ok: true, text: done(r.body ?? {}) });
  };

  const setSitting = (sitting: PaperSitting) => act({ action: 'sitting', sitting }, () => t('bub.sittingSaved'));
  const wrongOk = WRONG_RE.test(wrong.trim());
  const saveWrong = () => act({ action: 'wrong_marks', wrongMarks: Number(wrong.trim()) }, (b) => t('bub.wrongSaved', { n: numberWords(Number(b.remarked ?? 0), lang) }));
  const blanksN = Number(blanks);
  const blanksOk = /^[0-9]{1,3}$/.test(blanks.trim()) && blanksN <= 200;
  const print = async () => {
    setBusy(true);
    setNote({ ok: true, text: t('bub.printing') });
    const r = await ask('POST', `/api/app/marking/papers/${paperId}/bubbles`, { action: 'print', blanks: blanksN });
    if (!r.ok) {
      setBusy(false);
      return setNote({ ok: false, text: errorWords(t, r) });
    }
    const p = r.body?.print as BubblePrint;
    try {
      const pdf = await bubbleSheetsPdf(
        p,
        {
          name: t('bub.pdf.name'),
          roll: t('bub.pdf.roll'),
          examNo: t('bub.pdf.examNo'),
          sheetNo: t('bub.pdf.sheetNo'),
          rollGrid: t('bub.pdf.rollGrid'),
          blank: t('bub.pdf.blank'),
          rules: [t('bub.pdf.rule1'), t('bub.pdf.rule2'), t('bub.pdf.rule3'), t('bub.pdf.rule4')],
          footer: (n) => t('bub.pdf.footer', { n }),
          date: p.date ? dayWords(p.date, lang) : null,
        },
        t('bub.pdf.title')
      );
      downloadBlob(pdf, safeFilename(`${t('bub.pdf.title')} ${p.subjectName} ${p.className}`, 'pdf'));
      setNote({ ok: true, text: t('bub.printDone', { n: numberWords(p.sheets.length, lang) }) });
    } catch {
      setNote({ ok: false, text: t('mk.err.other') });
    }
    setBlanks('0');
    await load();
    setBusy(false);
  };
  const byId = new Map(screen.candidates.map((c) => [c.studentId, c]));
  const labels = screen.questions.map((q) => q.label);

  return (
    <div data-bubble-panel={screen.sitting} className="flex flex-col gap-3 rounded-md border border-slate/10 p-3">
      <div className="flex flex-wrap items-center gap-x-1">
        <h3 className="text-base font-bold">{t('bub.title')}</h3>
        <InfoTip>{t('bub.how')}</InfoTip>
      </div>
      <SegmentedControl
        id={`bub-sitting-${paperId}`}
        label={t('bub.sitting')}
        value={screen.sitting === 'bubble' ? 'bubble' : 'written'}
        onChange={(v) => (may && !busy ? void setSitting(v) : undefined)}
        options={[
          { value: 'written', label: t('bub.sitting.written'), disabled: !may || busy },
          { value: 'bubble', label: t('bub.sitting.bubble'), disabled: !may || busy },
        ]}
      />

      {screen.sitting === 'bubble' && (
        <>
          <p data-bubble-kind={screen.onlyChoice ? 'only' : 'mixed'}>{t(screen.onlyChoice ? 'bub.onlyChoice' : 'bub.mixed')}</p>
          {screen.problem ? (
            <p data-bubble-problem={screen.problem} className="flex items-start gap-2 font-semibold text-amber-text">
              <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{t(PROBLEM_KEYS[screen.problem])}</span>
            </p>
          ) : (
            <p className="text-slate/80">{t('bub.onSheet', { n: numberWords(labels.length, lang), labels: labels.length > 12 ? `${labels.slice(0, 12).join(', ')}…` : labels.join(', ') })}</p>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div className="w-full max-w-[16rem]">
              <Input
                id={`bub-wrong-${paperId}`}
                label={t('bub.wrong')}
                floating={false}
                inputMode="decimal"
                autoComplete="off"
                value={wrong}
                disabled={!may || busy}
                error={wrong.trim() && !wrongOk ? t('bub.wrongBad') : undefined}
                onChange={(e) => setWrong(e.target.value)}
              />
            </div>
            <button type="button" data-bubble-wrong-save className={TAP} disabled={!may || busy || !wrongOk || Number(wrong) === screen.wrongMarks} onClick={() => void saveWrong()}>
              {t('bub.wrongSave')}
            </button>
            <InfoTip>{t('bub.wrongHow')}</InfoTip>
          </div>

          <div className="flex flex-col gap-2 rounded-md bg-off-white p-3">
            <p data-bubble-printed>
              {screen.printed.candidates + screen.printed.blanks > 0
                ? t('bub.printed', { children: numberWords(screen.printed.candidates, lang), blanks: numberWords(screen.printed.blanks, lang) })
                : t('bub.printedNone')}
            </p>
            {screen.printed.replaced > 0 && <p className="text-amber-text">{t('bub.replaced', { n: numberWords(screen.printed.replaced, lang) })}</p>}
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-full max-w-[16rem]">
                <Input id={`bub-blanks-${paperId}`} label={t('bub.blanks')} floating={false} inputMode="numeric" autoComplete="off" value={blanks} disabled={!may || busy} onChange={(e) => setBlanks(e.target.value)} />
              </div>
              <InfoTip>{t('bub.blanksHow')}</InfoTip>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" data-bubble-print className={PRIMARY} disabled={!may || busy || !!screen.problem || !blanksOk} onClick={() => void print()}>
                <Icon name="download" className="h-4 w-4" aria-hidden="true" />
                {t('bub.print')}
              </button>
              <InfoTip>{t('bub.printHow')}</InfoTip>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {may && !screen.problem ? (
              <a href={bubbleScanHref(paperId)} data-bubble-scan className={PRIMARY}>{t('bub.scan')}</a>
            ) : (
              <span className={`${TAP} opacity-60`} aria-disabled="true">{t('bub.scan')}</span>
            )}
            <InfoTip>{t('bub.scanHow')}</InfoTip>
            <p className="basis-full text-slate/80">{t('bub.orFiles')}</p>
          </div>

          {screen.reads.total > 0 && (
            <div className="flex flex-col gap-2">
              <p data-bubble-reads>{t('bub.reads', { total: numberWords(screen.reads.total, lang), matched: numberWords(screen.reads.matched, lang), flagged: numberWords(screen.reads.flagged, lang) })}</p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" data-bubble-again className={TAP} disabled={!may || busy} onClick={() => void act({ action: 'again' }, (b) => t('bub.againDone', { n: numberWords(Number(b.remarked ?? 0), lang) }))}>
                  {t('bub.again')}
                </button>
                <InfoTip>{t('bub.againHow')}</InfoTip>
              </div>
            </div>
          )}

          {screen.waiting.length > 0 && (
            <section data-bubble-waiting aria-labelledby={`bub-waiting-${paperId}`} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-1">
                <h4 id={`bub-waiting-${paperId}`} className="font-bold">{t('bub.waiting.title')}</h4>
                <InfoTip>{t('bub.waiting.how')}</InfoTip>
              </div>
              <ul className="flex flex-col gap-2">
                {screen.waiting.map((w) => (
                  <li key={w.readId} data-bubble-read={w.readId} className="flex flex-col gap-2 rounded-md border border-amber p-3">
                    <p className="font-semibold">
                      {w.sheetNo !== null ? t('bub.waiting.sheetNo', { n: String(w.sheetNo).padStart(4, '0') }) : t('bub.waiting.noNo')}
                      {w.rollNo ? ` · ${t('bub.waiting.roll', { roll: w.rollNo })}` : ''}
                    </p>
                    <p className="text-slate/80">{t(w.why === 'two_scripts' ? 'bub.waiting.two_scripts' : 'bub.waiting.identity')}</p>
                    <div className="flex flex-wrap items-end gap-2">
                      {w.url && (
                        <a href={w.url} target="_blank" rel="noopener noreferrer" className={TAP}>{t('bub.waiting.view')}</a>
                      )}
                      <div className="min-w-[14rem] flex-1">
                        <Select id={`bub-child-${w.readId}`} label={t('bub.waiting.choose')} value={choice[w.readId] ?? ''} disabled={!may || busy} onChange={(e) => setChoice({ ...choice, [w.readId]: e.target.value })}>
                          <option value="">{t('bub.waiting.pick')}</option>
                          {screen.candidates.map((c) => (
                            <option key={c.studentId} value={c.studentId}>
                              {w.offered.includes(c.studentId) ? `${t('bub.waiting.maybe')}: ` : ''}
                              {childLine(c)}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <button
                        type="button"
                        className={PRIMARY}
                        disabled={!may || busy || !choice[w.readId] || !byId.has(choice[w.readId])}
                        onClick={() => void act({ action: 'read', readId: w.readId, do: 'child', studentId: choice[w.readId] }, () => t('bub.waiting.done'))}
                      >
                        {t('bub.waiting.give')}
                      </button>
                      <button type="button" className={TAP} disabled={!may || busy} onClick={() => void act({ action: 'read', readId: w.readId, do: 'aside' }, () => t('bub.waiting.done'))}>
                        {t('bub.waiting.aside')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {note && (
        <p role="status" data-bubble-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}
