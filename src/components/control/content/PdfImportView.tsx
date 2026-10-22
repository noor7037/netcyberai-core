'use client';

import { useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { PRIMARY_ACTION } from '@/components/app-ui/ModulePage';
import { Input } from '@/components/ui/Input';
import type { ImportedVersion } from '@/lib/content/library';
import type { DroppedLine } from '@/lib/content/pdf-import';
import type { MessageKey } from '@/lib/i18n';

// Control → Content → import from a board's PDF (M2-12, C286; docs/family-app/10 §4.2). The PDF is read on the server,
// page by page, and only lines whose titles are printed on the page named become a draft version in review; the lines
// left out are listed with why. Another person approves the draft in the list below. The PDF is not kept.

const SECTION = 'flex flex-col gap-3 rounded-md border border-slate/10 bg-white p-4';
const MAX_BYTES = 10 * 1024 * 1024;

type Done = { version: ImportedVersion; dropped: DroppedLine[]; pages: number };

const toBase64 = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export function PdfImportView({ onImported }: { onImported: () => Promise<void> | void }) {
  const { t, tCount } = useT();
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [board, setBoard] = useState('CBSE');
  const [classLevel, setClassLevel] = useState('');
  const [subject, setSubject] = useState('');
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [dropped, setDropped] = useState<DroppedLine[]>([]);

  const errorText = (code: unknown) => t(typeof code === 'string' && /^[a-z_]+$/.test(code) ? (`control.import.err.${code}` as MessageKey) : 'control.import.err.failed');

  async function send() {
    setError(null);
    setDone(null);
    setDropped([]);
    if (!file) return setError(t('control.import.chooseFirst'));
    if (file.size > MAX_BYTES) return setError(t('control.import.err.too_big'));
    setBusy(true);
    const body = { pdf: await toBase64(file), sourceUrl: sourceUrl.trim(), board: board.trim(), classLevel: Number(classLevel), subject: subject.trim(), academicYear: year.trim() };
    const res = await fetch('/api/control/content/pdf-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok || !got?.version) {
      setError(errorText(got?.code));
      if (Array.isArray(got?.dropped)) setDropped(got.dropped);
      return;
    }
    setDone(got as Done);
    setDropped((got as Done).dropped);
    setFile(null);
    await onImported();
  }

  const droppedLine = (d: DroppedLine) =>
    t('control.import.droppedLine', {
      level: t(`control.import.level.${d.level}` as MessageKey),
      title: d.title,
      page: d.page ?? t('control.import.noPage'),
      reason: t(`control.import.reason.${d.reason}` as MessageKey),
    });

  return (
    <section className={SECTION} data-content-pdf-import>
      <h2 className="text-base font-bold">{t('control.import.title')}</h2>
      <p>{t('control.import.how')}</p>
      <input
        type="file"
        accept=".pdf,application/pdf"
        aria-label={t('control.import.file')}
        data-content-pdf-file
        className="min-h-[44px] text-sm text-slate"
        onChange={(e) => {
          setDone(null);
          setFile(e.target.files?.[0] ?? null);
        }}
      />
      <Input id="pdf-import-source" label={t('control.import.sourceUrl')} helperText={t('control.import.sourceUrlHint')} type="url" inputMode="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} floating={false} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Input id="pdf-import-board" label={t('control.import.board')} value={board} onChange={(e) => setBoard(e.target.value)} floating={false} />
        <Input id="pdf-import-class" label={t('control.import.class')} type="number" min={1} max={12} inputMode="numeric" value={classLevel} onChange={(e) => setClassLevel(e.target.value)} floating={false} />
        <Input id="pdf-import-subject" label={t('control.import.subject')} value={subject} onChange={(e) => setSubject(e.target.value)} floating={false} />
        <Input id="pdf-import-year" label={t('control.import.year')} value={year} onChange={(e) => setYear(e.target.value)} floating={false} />
      </div>
      <button type="button" data-content-pdf-send disabled={busy} onClick={() => void send()} className={PRIMARY_ACTION}>
        {t('control.import.send')}
      </button>
      {busy && (
        <p role="status" data-content-pdf-reading>
          {t('control.import.reading')}
        </p>
      )}
      {error && (
        <p role="alert" data-content-pdf-error className="rounded-md border border-red-800/30 px-3 py-2 font-semibold text-red-800">
          {error}
        </p>
      )}
      {done && (
        <p role="status" data-content-pdf-done className="rounded-md bg-off-white px-3 py-2 font-semibold">
          {t('control.import.done', { no: done.version.versionNo, units: done.version.units, chapters: done.version.chapters, topics: done.version.topics, pages: done.pages })}
        </p>
      )}
      {dropped.length > 0 && (
        <div data-content-pdf-dropped className="rounded-md border border-slate/10 p-3">
          <p className="font-semibold">{tCount('control.import.dropped', dropped.length)}</p>
          <ul className="mt-1 list-disc pl-5">
            {dropped.map((d, i) => (
              <li key={`${i}-${d.level}`}>{droppedLine(d)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
