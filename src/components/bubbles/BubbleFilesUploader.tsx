'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { numberWords } from '@/components/exams/exam-format';
import { PRIMARY, TAP } from '@/components/exams/SchemeParts';
import { Icon } from '@/components/visual/Icons';
import { sheetLayout } from '@/lib/bubbles/layout';
import { MAX_FILES_PER_UPLOAD, type BubbleScreen } from '@/lib/contracts/marking';
import { fileKind, inReadingOrder } from '@/lib/marking/browser-plan';
import { initialStates, sendFiles, type FileState } from '@/lib/marking/upload-run';
import { ask, errorWords } from '../marking/parts';
import { bubbleFileDeps, type BubbleFileTally } from './bubble-files';
import { BubbleWorker } from './bubble-worker';

// Bubble sheets chosen as files (C364), in step 2 of a paper's marking screen: scanned PDFs or photos of the printed
// sheets. Each page is read on this device in the scan worker; only a page read as a sheet of this paper is sent, as its
// straightened picture with what was read, and each becomes (or fills) the child's script at once. "Finish" closes the
// sending. No AI reads anything here.

export function BubbleFilesUploader({ paperId, bubbles, onChanged }: { paperId: string; bubbles: BubbleScreen; onChanged: () => void }) {
  const { t, lang } = useT();
  const [picked, setPicked] = useState<File[]>([]);
  const [states, setStates] = useState<FileState[]>([]);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [tally, setTally] = useState<BubbleFileTally>({ notSheets: 0, results: [] });
  const stopped = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const worker = useRef<BubbleWorker | null>(null);
  const layout = useMemo(() => sheetLayout(bubbles.questions), [bubbles.questions]);

  useEffect(() => () => worker.current?.terminate(), []);

  const pick = (list: FileList | null) => {
    if (!list) return;
    const ok = Array.from(list).filter((f) => fileKind(f) !== null);
    setPicked(inReadingOrder([...picked, ...ok]).slice(0, MAX_FILES_PER_UPLOAD));
    if (input.current) input.current.value = '';
  };

  const start = async () => {
    if (!picked.length) return;
    setBusy(true);
    setNote(null);
    const r = await ask('POST', `/api/app/marking/papers/${paperId}/bubbles`, { action: 'upload', mode: 'per_file', files: picked.length });
    const id = typeof r.body?.uploadId === 'string' ? r.body.uploadId : null;
    if (!r.ok || !id) {
      setBusy(false);
      return setNote({ ok: false, text: errorWords(t, r) });
    }
    setUploadId(id);
    worker.current ??= new BubbleWorker();
    const list = initialStates(picked);
    const files = new Map(list.map((s, i) => [s.fileNo, picked[i]]));
    const counted: BubbleFileTally = { notSheets: 0, results: [] };
    setStates(list);
    setPicked([]);
    setBusy(false);
    stopped.current = false;
    setRunning(true);
    await sendFiles(
      list.map((state) => ({ file: files.get(state.fileNo) as File, state })),
      bubbleFileDeps(id, layout, worker.current, counted, () => stopped.current),
      () => {
        setStates([...list]);
        setTally({ ...counted, results: [...counted.results] });
      }
    );
    setRunning(false);
    setTally({ ...counted, results: [...counted.results] });
    // Every file gone through: the sending is closed at once (a stopped one waits for "Finish").
    if (!stopped.current && list.every((s) => s.status === 'done')) {
      const closed = await ask('POST', `/api/app/marking/uploads/${id}/close`);
      if (closed.ok) setUploadId(null);
    }
    onChanged();
  };

  const finish = async () => {
    if (!uploadId) return;
    setBusy(true);
    const r = await ask('POST', `/api/app/marking/uploads/${uploadId}/close`);
    setBusy(false);
    if (!r.ok) return setNote({ ok: false, text: errorWords(t, r) });
    setUploadId(null);
    setStates([]);
    setTally({ notSheets: 0, results: [] });
    setNote({ ok: true, text: t('bub.files.finished') });
    onChanged();
  };

  const flagged = tally.results.filter((r) => r.flagged).length;
  return (
    <div data-bubble-files className="flex flex-col gap-3">
      <p className="flex items-start gap-2 text-slate/80">
        <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <span>{t('bub.files.how')}</span>
      </p>
      {!states.length && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className={`${TAP} cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-royal`}>
              <Icon name="plus" className="h-4 w-4" aria-hidden="true" />
              {picked.length ? t('mk.up.addMore') : t('mk.up.choose')}
              <input ref={input} id="bub-upload-files" data-bubble-input type="file" multiple accept="image/*,application/pdf" className="sr-only" onChange={(e) => pick(e.target.files)} />
            </label>
            <span className="text-slate/70">{t('mk.up.accepts')}</span>
          </div>
          {picked.length > 0 && (
            <>
              <ul data-bubble-picked className="flex flex-col gap-1">
                {picked.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 px-3 py-1">
                    <span className="min-w-0 break-words font-semibold">{f.name}</span>
                    <button type="button" className={TAP} aria-label={t('mk.up.removeFile', { name: f.name })} onClick={() => setPicked(picked.filter((_, j) => j !== i))}>
                      <span aria-hidden="true">×</span>
                      <span className="sr-only">{t('mk.up.removeFile', { name: f.name })}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" data-bubble-start className={PRIMARY} disabled={busy} onClick={() => void start()}>
                  {t('bub.files.start', { n: picked.length })}
                </button>
                <button type="button" className={TAP} onClick={() => setPicked([])}>{t('mk.up.clear')}</button>
              </div>
            </>
          )}
        </>
      )}

      {states.length > 0 && (
        <ul data-bubble-progress className="flex flex-col gap-2">
          {states.map((s) => (
            <li key={s.fileNo} data-status={s.status} className="flex flex-col gap-1 rounded-md border border-slate/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-words font-semibold">{s.name}</span>
                <span className={s.status === 'failed' ? 'font-semibold text-red-800' : s.status === 'done' ? 'font-semibold text-emerald-text' : 'text-slate/70'}>
                  {s.status === 'waiting' && t('mk.up.waiting')}
                  {s.status === 'reading' && t('mk.up.reading')}
                  {s.status === 'sending' && t('mk.up.sending', { done: s.pagesDone, total: s.pagesTotal ?? 0 })}
                  {s.status === 'done' && t('mk.up.done', { n: s.pagesDone })}
                  {s.status === 'failed' && t('mk.up.failed')}
                </span>
              </div>
              {s.pagesTotal !== null && s.status !== 'failed' && (
                <div role="progressbar" aria-label={s.name} aria-valuemin={0} aria-valuemax={s.pagesTotal} aria-valuenow={s.pagesDone} className="h-2 overflow-hidden rounded-full bg-slate/10">
                  <div className="h-full bg-sapphire" style={{ width: `${s.pagesTotal ? Math.round((s.pagesDone / s.pagesTotal) * 100) : 0}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {running && (
        <button type="button" className={`${TAP} self-start`} onClick={() => (stopped.current = true)}>{t('mk.up.stop')}</button>
      )}
      {tally.results.length > 0 && (
        <p data-bubble-result className="font-semibold">{t('bub.files.result', { n: numberWords(tally.results.length, lang), flagged: numberWords(flagged, lang) })}</p>
      )}
      {tally.notSheets > 0 && (
        <p data-bubble-not-sheets role="status" className="flex items-start gap-2 text-amber-text">
          <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{t('bub.files.notSheets', { n: numberWords(tally.notSheets, lang) })}</span>
        </p>
      )}
      {uploadId && !running && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-bubble-finish className={PRIMARY} disabled={busy} onClick={() => void finish()}>{t('bub.files.finish')}</button>
          <InfoTip>{t('bub.files.how')}</InfoTip>
        </div>
      )}
      {note && (
        <p role="status" className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>{note.text}</p>
      )}
    </div>
  );
}
