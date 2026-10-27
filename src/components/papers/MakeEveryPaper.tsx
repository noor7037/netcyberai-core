'use client';

import { useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { PRIMARY, TAP } from '@/components/exams/SchemeParts';
import { ask, errorWords } from '@/components/marking/parts';
import type { MessageKey } from '@/lib/i18n';

// "Make every paper" on an exam (docs/36 §1.1, C362): one making for each of its papers the person may mark that has no
// questions yet, each by the exam type's blueprint and its own class's taught log, each its own job. A paper that
// cannot be made now is left as it is, and the answer says how many and why. Asked once more after a plain confirm,
// so a stray tap queues nothing.

type Skip = { paperId: string; reason: string };
const REASONS: Record<string, MessageKey> = {
  has_questions: 'pp.all.reason.has_questions',
  busy: 'pp.all.reason.busy',
  closed: 'pp.all.reason.closed',
  locked: 'pp.all.reason.locked',
  no_blueprint: 'pp.all.reason.no_blueprint',
  plan: 'pp.all.reason.plan',
};

export function MakeEveryPaper({ examId, papers }: { examId: string; papers: { paperId: string; className: string; subjectName: string }[] }) {
  const { t } = useT();
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ queued: string[]; skipped: Skip[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = (paperId: string) => {
    const p = papers.find((x) => x.paperId === paperId);
    return p ? `${p.className} · ${p.subjectName}` : '';
  };

  const go = async () => {
    setBusy(true);
    setError(null);
    const r = await ask('POST', `/api/app/exams/${examId}/make-papers`);
    setBusy(false);
    setSure(false);
    if (!r.ok) return setError(errorWords(t, r));
    setDone(r.body as unknown as { queued: string[]; skipped: Skip[] });
  };
  // Papers that are not the person's own are not theirs to make: counted, not listed.
  const shown = (done?.skipped ?? []).filter((s) => s.reason !== 'not_allowed');
  const notMine = (done?.skipped ?? []).length - shown.length;

  return (
    <div data-make-every-paper={examId} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {!sure ? (
          <button type="button" data-make-all className={TAP} disabled={busy} onClick={() => setSure(true)}>
            {t('pp.all.go')}
          </button>
        ) : (
          <>
            <button type="button" data-make-all-sure className={PRIMARY} disabled={busy} onClick={() => void go()}>
              {t('pp.all.sure')}
            </button>
            <button type="button" className={TAP} onClick={() => setSure(false)}>
              {t('pp.cancel')}
            </button>
          </>
        )}
        <InfoTip>{t('pp.all.how')}</InfoTip>
      </div>
      {error && <p role="status" className="font-semibold text-red-800">{error}</p>}
      {done && (
        <div role="status" data-make-all-result className="flex flex-col gap-1 rounded-md bg-off-white px-3 py-2">
          <p className="font-semibold">{t('pp.all.queued', { n: done.queued.length })}</p>
          {shown.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {shown.map((s) => (
                <li key={s.paperId}>{t('pp.all.skipped', { paper: name(s.paperId), reason: t(REASONS[s.reason] ?? 'pp.all.reason.other') })}</li>
              ))}
            </ul>
          )}
          {notMine > 0 && <p className="text-slate/70">{t('pp.all.notMine', { n: notMine })}</p>}
        </div>
      )}
    </div>
  );
}
