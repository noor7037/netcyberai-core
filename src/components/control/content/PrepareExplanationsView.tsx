'use client';

import { useRef, useState } from 'react';
import { useStepUp } from '@/components/auth/StepUp';
import { useT } from '@/components/app-shell/LangContext';
import { Button } from '@/components/ui/Button';
import type { MessageKey } from '@/lib/i18n';

// Control → Content → Responses (P1 slice 3, C300): make the explanation of every chapter and topic of one syllabus
// version, in English and in Hindi, before children ask. Each goes into the queue below as AI-made, to check or
// withdraw. The server makes one per call; this keeps calling until nothing is missing, a line fails, or Stop.

export type PreparableVersion = { versionId: string; boardId: string; classLevel: number; subject: string; year: string; versionNo: number; status: string };
type State = { total: number; checked: number; aiMade: number; missing: number; withdrawn: number };

export function PrepareExplanationsView({ versions }: { versions: PreparableVersion[] }) {
  const { t } = useT();
  const { stepUpFetch } = useStepUp();
  const [versionId, setVersionId] = useState(versions[0]?.versionId ?? '');
  const [state, setState] = useState<State | null>(null);
  const [running, setRunning] = useState(false);
  const stopAsked = useRef(false);
  const [note, setNote] = useState<string | null>(null);

  const call = async (init?: RequestInit) => {
    const res = await stepUpFetch(init ? '/api/family/prepare' : `/api/family/prepare?version=${versionId}`, init).catch(() => null);
    return res?.ok ? ((await res.json()) as { state: State; made?: { key: string; language: string; outcome: string } | null }) : null;
  };

  const look = async () => {
    setNote(null);
    const r = await call();
    if (r) setState(r.state);
    else setNote(t('control.prepare.failed'));
  };

  const prepare = async () => {
    stopAsked.current = false;
    setRunning(true);
    setNote(null);
    for (;;) {
      if (stopAsked.current) break;
      const r = await call({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId }) });
      if (!r) {
        setNote(t('control.prepare.failed'));
        break;
      }
      setState(r.state);
      if (!r.made) {
        setNote(t('control.prepare.done'));
        break;
      }
      if (r.made.outcome !== 'kept') {
        setNote(t('control.prepare.lineFailed', { key: r.made.key, language: r.made.language, reason: r.made.outcome }));
        break;
      }
    }
    setRunning(false);
  };

  if (versions.length === 0) return null;
  return (
    <section aria-labelledby="prepare-explanations" className="mb-6 flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate/10">
      <h2 id="prepare-explanations" className="text-lg font-bold text-slate">
        {t('control.prepare.title')}
      </h2>
      <p className="text-sm text-slate/80">{t('control.prepare.lead')}</p>
      <label className="flex flex-col gap-1 text-sm font-semibold text-slate">
        {t('control.prepare.version')}
        <select
          className="min-h-[44px] rounded-xl border border-slate/20 bg-white px-3 text-sm font-normal"
          value={versionId}
          disabled={running}
          onChange={(e) => {
            setVersionId(e.target.value);
            setState(null);
            setNote(null);
          }}
        >
          {versions.map((v) => (
            <option key={v.versionId} value={v.versionId}>
              {t('control.prepare.versionLabel', { board: v.boardId, classLevel: String(v.classLevel), subject: t(`fam.subject.${v.subject}` as MessageKey), year: v.year, n: String(v.versionNo), status: v.status })}
            </option>
          ))}
        </select>
      </label>
      {state && (
        <p role="status" className="text-sm text-slate">
          {t('control.prepare.counts', { total: String(state.total), checked: String(state.checked), aiMade: String(state.aiMade), missing: String(state.missing), withdrawn: String(state.withdrawn) })}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={prepare} disabled={running || !versionId}>
          {running ? t('control.prepare.running') : t('control.prepare.start')}
        </Button>
        {running ? (
          <Button type="button" variant="outline" onClick={() => (stopAsked.current = true)}>
            {t('control.prepare.stop')}
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={look} disabled={!versionId}>
            {t('control.prepare.look')}
          </Button>
        )}
        {note && <p className="text-sm font-semibold text-slate">{note}</p>}
      </div>
    </section>
  );
}
