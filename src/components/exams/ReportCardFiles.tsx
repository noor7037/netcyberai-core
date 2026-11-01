'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import type { ReportCardFiles as FilesState } from '@/lib/exams/report-card-files';
import { PRIMARY, SECTION, TAP } from './SchemeParts';

// Each child's report card made as a file when the class is published (W14-F), on the publish page and the class's
// result page: how far it got ("12 of 26 ready", "all 26 ready", "3 failed: try again"), "Get every report card" (one
// zip of the files) and the "Class report" (one page with the class summary, in the language of the screen). Shown to
// those the server lets read it (the office and the class teacher); the office makes them again. While cards are still
// being made it looks again every few seconds, for a few minutes at most.
const EVERY_MS = 5_000;
const LOOKS = 36;

export function ReportCardFiles({ examId, classId }: { examId: string; classId: string }) {
  const { t, lang } = useT();
  const [state, setState] = useState<FilesState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [looks, setLooks] = useState(0);
  const base = `/api/app/exams/${examId}/classes/${classId}/report-cards`;

  const load = useCallback(async () => {
    const res = await fetch(`${base}/files`, { cache: 'no-store' }).catch(() => null);
    setState(res?.ok ? ((await res.json().catch(() => null)) as FilesState | null) : null);
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!state || state.waiting === 0 || looks >= LOOKS) return;
    const id = setTimeout(() => {
      setLooks((n) => n + 1);
      void load();
    }, EVERY_MS);
    return () => clearTimeout(id);
  }, [state, looks, load]);

  if (!state) return null;
  const make = async () => {
    setBusy(true);
    setNote(null);
    const res = await fetch(`${base}/files`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'make' }) }).catch(() => null);
    setBusy(false);
    setNote(res?.ok ? { ok: true, text: t('rcf.started') } : { ok: false, text: t('rcf.unavailable') });
    setLooks(0);
    await load();
  };
  const all = state.total > 0 && state.ready === state.total;
  return (
    <section data-rc-files className={SECTION}>
      <div className="flex flex-wrap items-center gap-x-1">
        <h2 className="text-base font-bold">{t('rcf.title')}</h2>
        <InfoTip>
          <p>{t('rcf.how')}</p>
          <p className="mt-2">{t('rcf.bundleHow')}</p>
        </InfoTip>
      </div>
      <p data-rc-files-state={all ? 'ready' : 'making'} role="status" className="font-semibold">
        {all ? t('rcf.allReady', { total: state.total }) : t('rcf.making', { ready: state.ready, total: state.total })}
      </p>
      {state.failed > 0 && (
        <p data-rc-files-failed className="rounded-md bg-off-white px-3 py-2">
          {t('rcf.failed', { failed: state.failed })}
        </p>
      )}
      {state.missing > 0 && (
        <p data-rc-files-missing className="rounded-md bg-off-white px-3 py-2">
          {t('rcf.missing', { missing: state.missing })}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {state.ready > 0 && (
          <a href={`${base}/bundle`} download data-rc-bundle className={PRIMARY}>
            {t('rcf.bundle')}
          </a>
        )}
        <a href={`${base}/class-report?lang=${lang}`} target="_blank" rel="noopener noreferrer" data-rc-class-report className={TAP}>
          {t('rcf.classReport')}
        </a>
        {state.mayMake && (state.failed > 0 || state.missing > 0) && (
          <button type="button" data-rc-files-make className={TAP} disabled={busy} onClick={() => void make()}>
            {state.failed > 0 ? t('rcf.retry') : t('rcf.make')}
          </button>
        )}
      </div>
      {note && (
        <p role="status" className={note.ok ? 'text-slate' : 'font-semibold text-slate'}>
          {note.text}
        </p>
      )}
    </section>
  );
}
