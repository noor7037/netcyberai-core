'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Skeleton } from '@/components/app-ui/States';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { explainError } from '@/lib/errors/catalogue';
import type { MessageKey } from '@/lib/i18n';
import type { SetupSubject } from '@/lib/setup/subjects';

// Setup -> Subjects (docs/28 slice 10g, C244), for the principal and the school admin: add a subject, rename it,
// retire it and bring it back. A subject is retired, never deleted: it keeps its marks, homework, timetable periods
// and who teaches it, and leaves the lists where a subject is chosen. Subjects belong to the school, not to a class;
// a class is given its subjects on Staff (who teaches what). Every change is audited with ids only.

const CARD = 'flex max-w-3xl flex-col gap-3 rounded-2xl border border-slate/10 bg-white p-4 shadow-sm md:p-5';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const TAP = 'min-h-[44px] rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-slate disabled:opacity-60';

type Panel = { kind: 'rename'; id: string; draft: string } | { kind: 'retire'; id: string } | null;

export function SubjectsView() {
  const { t, lang } = useT();
  const toast = useToast();
  const [subjects, setSubjects] = useState<SetupSubject[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/setup/subjects', { cache: 'no-store' }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { subjects?: SetupSubject[] } | null) : null;
    if (body?.subjects) {
      setSubjects(body.subjects);
      setFailed(false);
    } else setFailed(true);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // One request; on a refusal the problem is said in the person's language.
  async function send(url: string, method: 'POST' | 'PATCH', body: unknown, typed?: string): Promise<boolean> {
    setBusy(true);
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const answer = (await res?.json().catch(() => null)) as { code?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      const retired: MessageKey | null = answer?.code === 'subject_retired' ? 'setup.subjects.refused.retired' : null;
      setProblem(retired ? t(retired, { name: typed ?? '' }) : explainError(answer, t('setup.subjects.failed'), lang, res?.status));
    } else setProblem(null);
    return Boolean(res?.ok);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (await send('/api/app/subjects', 'POST', { name }, name.trim())) {
      setName('');
      toast.show(t('setup.subjects.added'), 'success');
    }
    await load();
  }

  async function change(id: string, body: { name: string } | { retired: boolean }, done: MessageKey) {
    if (await send(`/api/app/setup/subjects/${id}`, 'PATCH', body)) {
      setPanel(null);
      toast.show(t(done), 'success');
    }
    await load();
  }

  if (failed && !subjects)
    return (
      <p role="alert" data-subjects="failed" className={`${CARD} text-sm text-slate`}>
        {t('setup.subjects.failed.load')}
      </p>
    );
  if (!subjects) return <Skeleton lines={4} className={CARD} />;

  const inUse = subjects.filter((s) => !s.retired);
  const retired = subjects.filter((s) => s.retired);

  // Drawn by a plain call, not as a component: a component made here would be a new one at every keystroke and the
  // rename field would lose its focus.
  const row = (s: SetupSubject) => {
    const renaming = panel?.kind === 'rename' && panel.id === s.subjectId ? panel : null;
    const retiring = panel?.kind === 'retire' && panel.id === s.subjectId;
    const used = s.uses.periods + s.uses.papers + s.uses.homework > 0;
    return (
      <li key={s.subjectId} data-subject={s.subjectId} data-subject-retired={s.retired ? 'yes' : 'no'} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
        {renaming ? (
          <form
            data-subject-rename-form
            className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-start"
            onSubmit={(e) => {
              e.preventDefault();
              void change(s.subjectId, { name: renaming.draft }, 'setup.subjects.renamed');
            }}
          >
            <Input id={`subject-name-${s.subjectId}`} label={t('setup.subjects.newName')} maxLength={80} required value={renaming.draft} onChange={(e) => setPanel({ kind: 'rename', id: s.subjectId, draft: e.target.value })} />
            <button type="submit" disabled={busy || !renaming.draft.trim()} className={PRIMARY}>
              {t('setup.subjects.renameSave')}
            </button>
            <button type="button" disabled={busy} className={TAP} onClick={() => setPanel(null)}>
              {t('setup.subjects.cancel')}
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className={`break-words text-base font-bold ${s.retired ? 'text-slate/70' : 'text-slate'}`}>{s.name}</p>
              {used && <p className="text-sm text-slate/70">{t('setup.subjects.uses', { periods: s.uses.periods, papers: s.uses.papers, homework: s.uses.homework })}</p>}
            </div>
            <button type="button" data-subject-rename disabled={busy} aria-label={t('setup.subjects.renameLabel', { name: s.name })} className={TAP} onClick={() => setPanel({ kind: 'rename', id: s.subjectId, draft: s.name })}>
              {t('setup.subjects.rename')}
            </button>
            {s.retired ? (
              <button type="button" data-subject-restore disabled={busy} aria-label={t('setup.subjects.restoreLabel', { name: s.name })} className={TAP} onClick={() => void change(s.subjectId, { retired: false }, 'setup.subjects.restored')}>
                {t('setup.subjects.restore')}
              </button>
            ) : (
              <button type="button" data-subject-retire disabled={busy} aria-label={t('setup.subjects.retireLabel', { name: s.name })} className={TAP} onClick={() => setPanel(retiring ? null : { kind: 'retire', id: s.subjectId })}>
                {t('setup.subjects.retire')}
              </button>
            )}
          </div>
        )}
        {retiring && (
          <div role="group" aria-labelledby={`retire-${s.subjectId}`} data-subject-confirm className="flex flex-col gap-2 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-slate">
            <p id={`retire-${s.subjectId}`} className="text-base font-bold">
              {t('setup.subjects.retire.title', { name: s.name })}
            </p>
            <p>{t('setup.subjects.retire.what', { name: s.name })}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-subject-confirm-yes disabled={busy} className={PRIMARY} onClick={() => void change(s.subjectId, { retired: true }, 'setup.subjects.retired')}>
                {t('setup.subjects.retire.yes')}
              </button>
              <button type="button" disabled={busy} className={TAP} onClick={() => setPanel(null)}>
                {t('setup.subjects.cancel')}
              </button>
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <div lang={lang} data-subjects className="flex flex-col gap-4">
      <section aria-labelledby="subjects-in-use" className={CARD}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 id="subjects-in-use" className="text-base font-bold text-slate">
            {t('setup.subjects.inUse')}
          </h2>
          <InfoTip>{t('setup.subjects.retireHow')}</InfoTip>
        </div>
        {inUse.length === 0 ? (
          <p data-subjects-none className="text-sm text-slate/70">
            {t('setup.subjects.none')}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate/10">
            {inUse.map(row)}
          </ul>
        )}
        <Link href="/app/staff" data-subjects-staff className="inline-flex min-h-[44px] items-center self-start text-sm font-semibold text-sapphire underline">
          {t('setup.subjects.teachers')}
        </Link>
      </section>

      <section aria-labelledby="subjects-add" className={CARD}>
        <h2 id="subjects-add" className="text-base font-bold text-slate">
          {t('setup.subjects.add')}
        </h2>
        <form data-subject-form onSubmit={(e) => void add(e)} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
          <Input id="subject-name" label={t('setup.subjects.name')} maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" data-subject-save disabled={busy || !name.trim()} className={PRIMARY}>
            {t('setup.subjects.save')}
          </button>
        </form>
        {problem && (
          <p role="alert" data-subject-problem className="rounded-md bg-off-white px-3 py-2 text-sm text-red-800">
            {problem}
          </p>
        )}
      </section>

      <section aria-labelledby="subjects-retired" className={CARD}>
        <h2 id="subjects-retired" className="text-base font-bold text-slate">
          {t('setup.subjects.retiredHeading')}
        </h2>
        {retired.length === 0 ? (
          <p data-subjects-none-retired className="text-sm text-slate/70">
            {t('setup.subjects.noneRetired')}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate/10">
            {retired.map(row)}
          </ul>
        )}
      </section>
    </div>
  );
}
