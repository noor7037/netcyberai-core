'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Select } from '@/components/ui/Select';
import type { ProgressReport } from '@/lib/exams/progress-report';
import { progressBlocks } from '@/lib/exams/progress-report-text';
import { downloadBlob, safeFilename } from '@/lib/pdf/browser';
import { CardPreview } from './CardPreview';
import { reportCardsPdf } from './report-card-pdf';
import { PRIMARY, SECTION, TAP } from './SchemeParts';

// A child's progress report (C230-AJ part 5): one child across a session's assessments, grouped by the school's exam types,
// from the marks of classes the school has published only. The screen and the printable PDF are made from the same blocks
// of words (src/lib/exams/progress-report-text.ts), drawn on this device as the report cards are. It compares the child
// with no one: no rank, no position. The office and the child's class teacher open it; the server decides.

export function ProgressReportView({ studentId }: { studentId: string }) {
  const { t, lang } = useT();
  const [data, setData] = useState<ProgressReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(
    async (session: string | null) => {
      const res = await fetch(`/api/app/exams/progress/${studentId}${session ? `?session=${encodeURIComponent(session)}` : ''}`, { cache: 'no-store' }).catch(() => null);
      const got = res?.ok ? ((await res.json().catch(() => null)) as ProgressReport | null) : null;
      setFailed(!got);
      if (got) setData(got);
    },
    [studentId]
  );
  useEffect(() => {
    void load(null);
  }, [load]);

  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('pr.failed')}</p>;
  if (!data) return null;
  const blocks = progressBlocks(data, lang);

  const download = async () => {
    setBusy(true);
    setNote({ ok: true, text: t('pr.download.making') });
    try {
      const file = safeFilename(`progress-report ${data.student.className ?? ''} ${data.student.rollNo ?? ''} ${data.session.label ?? ''}`, 'pdf');
      const blob = await reportCardsPdf([blocks], file, `${data.schoolName} · ${t('pr.card.heading')} · ${data.student.className ?? ''}`);
      downloadBlob(blob, file);
      setNote({ ok: true, text: t('pr.download.made', { file }) });
    } catch {
      setNote({ ok: false, text: t('pr.download.failed') });
    }
    setBusy(false);
  };

  return (
    <div lang={lang} data-progress-report className="flex flex-col gap-4 text-sm text-slate">
      {note && (
        <p role="status" data-pr-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}
      <section className={SECTION}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="min-w-0 text-base font-bold">{data.student.name}</h2>
          <InfoTip>
            <p>{t('pr.how')}</p>
            <p className="mt-2">{t('pr.noRank')}</p>
          </InfoTip>
        </div>
        <p className="text-slate/70">{[data.student.className ? t('rc.card.class', { className: data.student.className }) : null, data.student.rollNo ? t('rc.card.roll', { roll: data.student.rollNo }) : null].filter(Boolean).join(' · ')}</p>
        {data.sessions.length > 1 && (
          <div className="max-w-xs">
            <Select id="pr-session" data-pr-session label={t('pr.session.label')} value={data.session.sessionId ?? ''} onChange={(e) => void load(e.target.value || null)}>
              {data.sessions.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" data-pr-download className={PRIMARY} disabled={busy || !data.groups.length} onClick={() => void download()}>
            {t('pr.download.pdf')}
          </button>
          <a href="/app/exams" className={TAP}>{t('ex.allExams')}</a>
        </div>
      </section>
      <section aria-label={t('pr.card.heading')}>
        {data.groups.length ? <CardPreview blocks={blocks} /> : <p data-pr-empty className="rounded-md bg-off-white px-3 py-2">{t('pr.empty')}</p>}
      </section>
    </div>
  );
}
