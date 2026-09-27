'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/visual/Icons';
import { UI, type Lang } from '@/lib/free-tools/engine';
import { reportToCsv, type ToolReport } from '@/lib/free-tools/report';
import { downloadBlob, safeFilename, shareFile } from '@/lib/pdf/browser';
import { ReportView } from './ReportView';
import { usePrint } from './PrintPortal';

export const btn =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal disabled:opacity-60';
export const btnSolid = `${btn} bg-sapphire text-white hover:bg-sapphire/90`;
export const btnLine = `${btn} border-2 border-sapphire text-sapphire hover:bg-sapphire/5`;
export const btnQuiet = `${btn} border border-slate/20 bg-white text-slate hover:bg-off-white`;

export function todayLabel(): string {
  return new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Today's date, read after mount so the server-rendered HTML (no date)
// and the first client render always match.
export function useToday(): string {
  const [d, setD] = useState('');
  useEffect(() => setD(todayLabel()), []);
  return d;
}

// Print, PDF, CSV and share for one report. The share text carries the
// headline numbers and a link with numbers only; never a table of names.
export function ReportActions({
  report,
  lang,
  fileBase,
  rulesUpdated,
  sourcePath,
  shareUrl,
}: {
  report: ToolReport;
  lang: Lang;
  fileBase: string;
  rulesUpdated: string;
  sourcePath: string;
  shareUrl?: () => string;
}) {
  const { print, portal } = usePrint();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const today = useToday();
  const meta = { generatedOn: today, rulesUpdated, rulesLabel: UI.lastUpdated[lang], assumptionsLabel: UI.assumptions[lang] };

  const say = (m: string) => {
    setStatus(m);
    window.setTimeout(() => setStatus(''), 4000);
  };

  const summary = () => {
    const first = report.sections.find((s) => s.kind === 'stats');
    const lines = first && first.kind === 'stats' ? first.items.slice(0, 4).map((i) => `${i.label}: ${i.value}`) : [];
    const link = shareUrl ? shareUrl() : `${window.location.origin}${sourcePath}`;
    return [report.title, ...lines, '', link].join('\n');
  };

  async function pdf() {
    setBusy(true);
    try {
      const { reportPdf } = await import('@/lib/pdf/report-canvas');
      const blob = await reportPdf(report, { ...meta, sourceLine: `netcyberai.com${sourcePath}` });
      const name = safeFilename(fileBase, 'pdf');
      const shared = window.matchMedia('(pointer: coarse)').matches && (await shareFile(blob, name, report.title));
      if (!shared) downloadBlob(blob, name);
    } catch (e) {
      say((e as Error).message || 'The PDF could not be made in this browser.');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl());
      say(UI.shareDone[lang]);
    } catch {
      say(shareUrl());
    }
  }

  return (
    <div className="flex flex-col gap-2 print:hidden">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnSolid} onClick={pdf} disabled={busy}>
          <Icon name="download" className="h-4 w-4" /> {busy ? UI.pdfBusy[lang] : UI.pdf[lang]}
        </button>
        <button type="button" className={btnLine} onClick={() => print(<ReportView report={report} meta={meta} />)}>
          <Icon name="reports" className="h-4 w-4" /> {UI.print[lang]}
        </button>
        <button type="button" className={btnQuiet} onClick={() => downloadBlob(new Blob(['﻿' + reportToCsv(report)], { type: 'text/csv;charset=utf-8' }), safeFilename(fileBase, 'csv'))}>
          <Icon name="download" className="h-4 w-4" /> {UI.csv[lang]}
        </button>
        {shareUrl && (
          <button type="button" className={btnQuiet} onClick={copyLink}>
            <Icon name="link" className="h-4 w-4" /> {UI.share[lang]}
          </button>
        )}
        <a className={btnQuiet} href="https://wa.me/" target="_blank" rel="noopener noreferrer" onClick={(e) => (e.currentTarget.href = `https://wa.me/?text=${encodeURIComponent(summary())}`)}>
          <Icon name="chat" className="h-4 w-4" /> {UI.whatsapp[lang]}
        </a>
        <a className={btnQuiet} href="mailto:" onClick={(e) => (e.currentTarget.href = `mailto:?subject=${encodeURIComponent(report.title)}&body=${encodeURIComponent(summary())}`)}>
          <Icon name="mail" className="h-4 w-4" /> {UI.email[lang]}
        </a>
      </div>
      <p role="status" className="min-h-[1.25rem] text-sm font-semibold text-emerald-text">
        {status}
      </p>
      {portal}
    </div>
  );
}
