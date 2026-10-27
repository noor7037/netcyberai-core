'use client';

import { useRef, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { PRIMARY, TAP } from '@/components/exams/SchemeParts';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Icon } from '@/components/visual/Icons';
import { MAX_FILES_PER_UPLOAD, type MarkingOverview, type PageUploadResult, type StartUploadResult, type UploadMode } from '@/lib/contracts/marking';
import type { MessageKey } from '@/lib/i18n';
import { UploadError, fileKind, inReadingOrder } from '@/lib/marking/browser-plan';
import { initialStates, sendFiles, type FileProblem, type FileState, type PageJob } from '@/lib/marking/upload-run';
import { ask, errorWords, scanHref } from './parts';
import { openFile } from './render-pages';

// Step 2 of a paper's AI marking: the class's scripts (C350). The teacher says whether each file is one child's
// script or one scan with many children in order, picks the files (PDF or photos; on a phone the camera may be
// offered), and the browser turns every page into a picture and sends a few at a time, with the progress of each
// file. "Mark these" closes the upload and the marking begins. Nothing here marks anything: it only sends pictures.

const PROBLEM_KEYS: Record<FileProblem, MessageKey> = {
  unreadable: 'mk.up.err.unreadable',
  too_many_pages: 'mk.up.err.too_many_pages',
  page_too_small: 'mk.up.err.page_too_small',
  page_too_big: 'mk.up.err.page_too_big',
  refused: 'mk.up.err.refused',
  network: 'mk.up.err.network',
  upload_total: 'mk.up.err.upload_total',
  limit: 'mk.up.err.limit',
  ai_off: 'mk.up.err.ai_off',
  upload_closed: 'mk.up.err.upload_closed',
  storage: 'mk.up.err.storage',
  closed: 'mk.err.closed',
};
// Trying the same file again changes nothing for these.
const NOT_AGAIN: readonly FileProblem[] = ['too_many_pages', 'unreadable', 'page_too_small', 'limit', 'ai_off', 'upload_closed', 'closed', 'upload_total'];

export function ScriptsUploader({ paperId, overview, mayUpload, why, onChanged }: { paperId: string; overview: MarkingOverview; mayUpload: boolean; why: MessageKey | null; onChanged: () => void }) {
  const { t } = useT();
  const [mode, setMode] = useState<UploadMode>('per_file');
  const [picked, setPicked] = useState<File[]>([]);
  const [states, setStates] = useState<FileState[]>([]);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const stopped = useRef(false);
  const files = useRef<Map<number, File>>(new Map());
  const input = useRef<HTMLInputElement>(null);

  // The phone scanner's uploads (by_child) are its own to close, once their pages are in: never offered here.
  const openUpload = overview.uploads.find((u) => !u.closed && u.mode !== 'by_child') ?? null;
  const resumable = uploadId ?? openUpload?.uploadId ?? null;
  const sent = states.reduce((n, s) => n + s.pagesDone, 0);
  const allDone = states.length > 0 && states.every((s) => s.status === 'done' || s.status === 'failed');
  const waiting = states.filter((s) => s.status === 'waiting');

  const pick = (list: FileList | null) => {
    if (!list) return;
    const ok = Array.from(list).filter((f) => fileKind(f) !== null);
    const skipped = list.length - ok.length;
    setNote(skipped ? { ok: false, text: t('mk.up.skipped', { n: skipped }) } : null);
    setPicked(inReadingOrder([...picked, ...ok]).slice(0, MAX_FILES_PER_UPLOAD));
    if (input.current) input.current.value = '';
  };

  const deps = (id: string) => ({
    open: openFile,
    send: async (batch: PageJob[]): Promise<PageUploadResult> => {
      const form = new FormData();
      for (const p of batch) {
        form.append('fileNo', String(p.fileNo));
        form.append('pageNo', String(p.pageNo));
        form.append('page', p.blob, `page-${p.fileNo}-${p.pageNo}.jpg`);
      }
      const res = await fetch(`/api/app/marking/uploads/${id}/pages`, { method: 'POST', body: form }).catch(() => null);
      if (!res) throw new UploadError(0);
      const body = (await res.json().catch(() => null)) as (PageUploadResult & { code?: string }) | null;
      if (!res.ok || !body || !Array.isArray(body.pages)) throw new UploadError(res.status, typeof body?.code === 'string' ? body.code : null);
      return body;
    },
    cancelled: () => stopped.current,
  });

  const start = async () => {
    if (!picked.length) return;
    setBusy(true);
    setNote(null);
    const r = await ask('POST', `/api/app/marking/papers/${paperId}/uploads`, { mode, files: picked.length });
    setBusy(false);
    const id = (r.body as StartUploadResult | null)?.uploadId;
    if (!r.ok || !id) return setNote({ ok: false, text: errorWords(t, r, 'mk.up.err.start') });
    setUploadId(id);
    const list = initialStates(picked);
    files.current = new Map(list.map((s, i) => [s.fileNo, picked[i]]));
    setStates(list);
    setPicked([]);
    await run(id, list, list);
  };

  const run = async (id: string, all: FileState[], todo: FileState[]) => {
    stopped.current = false;
    setRunning(true);
    const already = all.reduce((n, s) => n + (todo.includes(s) ? 0 : s.pagesDone), 0);
    await sendFiles(
      todo.map((state) => ({ file: files.current.get(state.fileNo) as File, state })),
      deps(id),
      () => setStates([...all]),
      already
    );
    setRunning(false);
    setStates([...all]);
  };

  const again = async (fileNo: number) => {
    if (!uploadId) return;
    const target = states.find((s) => s.fileNo === fileNo);
    if (target) await run(uploadId, states, [target]);
  };

  const closeUpload = async () => {
    if (!resumable) return;
    setBusy(true);
    setNote(null);
    const r = await ask('POST', `/api/app/marking/uploads/${resumable}/close`);
    setBusy(false);
    if (!r.ok) return setNote({ ok: false, text: errorWords(t, r, 'mk.up.err.close') });
    setNote({ ok: true, text: t('mk.up.started') });
    setStates([]);
    setUploadId(null);
    files.current = new Map();
    onChanged();
  };

  if (!mayUpload) {
    return <p data-uploads-off className="rounded-md bg-off-white px-3 py-2">{why ? t(why) : ''}</p>;
  }

  return (
    <div data-scripts-uploader className="flex flex-col gap-3">
      {!states.length && (
        <>
          <div data-scan-offer className="flex flex-col gap-2 rounded-md bg-off-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <a href={scanHref(paperId)} data-scan-open className={PRIMARY}>{t('mk.scan.open')}</a>
              <InfoTip>{t('mk.scan.openHow')}</InfoTip>
            </div>
            <p className="text-slate/80">{t('mk.scan.orFiles')}</p>
          </div>
          <div className="flex flex-wrap items-end gap-x-1">
            <SegmentedControl
              id="mk-upload-mode"
              label={t('mk.up.mode')}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'per_file', label: t('mk.up.perFile') },
                { value: 'combined', label: t('mk.up.combined') },
              ]}
            />
            <InfoTip>{t('mk.up.modeHow')}</InfoTip>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className={`${TAP} cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-royal`}>
              <Icon name="plus" className="h-4 w-4" aria-hidden="true" />
              {picked.length ? t('mk.up.addMore') : t('mk.up.choose')}
              <input ref={input} id="mk-upload-files" data-upload-input type="file" multiple accept="image/*,application/pdf" className="sr-only" onChange={(e) => pick(e.target.files)} />
            </label>
            <span className="text-slate/70">{t('mk.up.accepts')}</span>
          </div>

          {picked.length > 0 && (
            <>
              <ul data-picked-files className="flex flex-col gap-1">
                {picked.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 px-3 py-1">
                    <span className="min-w-0 break-words font-semibold">{f.name}</span>
                    <span className="flex items-center gap-2 text-slate/70">
                      {fileKind(f) === 'pdf' ? t('mk.up.kindPdf') : t('mk.up.kindPhoto')} · {t('mk.up.size', { mb: (f.size / 1_000_000).toFixed(1) })}
                      <button type="button" className={TAP} aria-label={t('mk.up.removeFile', { name: f.name })} onClick={() => setPicked(picked.filter((_, j) => j !== i))}>
                        <span aria-hidden="true">×</span>
                        <span className="sr-only">{t('mk.up.removeFile', { name: f.name })}</span>
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" data-upload-start className={PRIMARY} disabled={busy} onClick={() => void start()}>
                  {t('mk.up.start', { n: picked.length })}
                </button>
                <button type="button" className={TAP} onClick={() => setPicked([])}>{t('mk.up.clear')}</button>
              </div>
            </>
          )}
        </>
      )}

      {states.length > 0 && (
        <ul data-upload-progress className="flex flex-col gap-2">
          {states.map((s) => (
            <li key={s.fileNo} data-upload-file={s.fileNo} data-status={s.status} className="flex flex-col gap-1 rounded-md border border-slate/10 p-3">
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
              {s.status === 'failed' && s.error && (
                <div className="flex flex-wrap items-center gap-2">
                  <p role="alert" className="text-red-800">{t(PROBLEM_KEYS[s.error])}</p>
                  {!NOT_AGAIN.includes(s.error) && !running && (
                    <button type="button" data-upload-again className={TAP} onClick={() => void again(s.fileNo)}>{t('mk.up.again')}</button>
                  )}
                </div>
              )}
              {s.duplicates > 0 && <p className="text-slate/70">{t('mk.up.duplicates', { n: s.duplicates })}</p>}
            </li>
          ))}
        </ul>
      )}

      {running && (
        <button type="button" data-upload-stop className={`${TAP} self-start`} onClick={() => (stopped.current = true)}>{t('mk.up.stop')}</button>
      )}

      {!running && waiting.length > 0 && uploadId && (
        <button type="button" data-upload-continue className={`${TAP} self-start`} onClick={() => void run(uploadId, states, waiting)}>{t('mk.up.continue', { n: waiting.length })}</button>
      )}

      {allDone && !running && (
        <p className="flex items-center gap-2 font-semibold"><Icon name="check" className="h-5 w-5" aria-hidden="true" />{states.some((s) => s.status === 'failed') ? t('mk.up.someFailed', { n: sent }) : t('mk.up.sentAll', { n: sent })}</p>
      )}

      {resumable && !running && (states.length === 0 || sent > 0) && (
        <div className="flex flex-col gap-2 rounded-md bg-off-white p-3">
          {states.length === 0 && openUpload && <p data-open-upload>{t('mk.up.open', { pages: openUpload.pages, files: openUpload.files })}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" data-upload-close className={PRIMARY} disabled={busy} onClick={() => void closeUpload()}>
              {t('mk.up.markThese')}
            </button>
            <InfoTip>{t('mk.up.markHow')}</InfoTip>
          </div>
        </div>
      )}

      {note && (
        <p role="status" data-upload-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}
