'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { dayWords, numberWords } from '@/components/exams/exam-format';
import { SECTION, TAP } from '@/components/exams/SchemeParts';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/visual/Icons';
import { BubblePanel } from '@/components/bubbles/BubblePanel';
import type { BubbleScreen, MarkingOverview, SetupScreen } from '@/lib/contracts/marking';
import type { MessageKey } from '@/lib/i18n';
import { inProgress, picturesNote } from '@/lib/marking/review-view';
import { indiaDate } from '@/lib/time/india';
import { ExceptionsList } from './ExceptionsList';
import { ProgressPanel } from './ProgressPanel';
import { problemWords, QuestionsEditor } from './QuestionsEditor';
import { ReviewList } from './ReviewList';
import { ScriptsUploader } from './ScriptsUploader';
import { ask } from './parts';

// A paper's AI marking, in four steps on one screen (docs/35, C347): 1 the questions, 2 the class's scripts, 3 how far
// marking has come, 4 the review list. It says in plain words when AI marking is off and why. While anything is being
// read or marked the screen asks again every few seconds, and stops when nothing is. Every list is in roll order.
// The server and the database decide who may do what; this screen only shows it.

const REFRESH_MS = 5000;

const WHY: Record<'no_limit' | 'switched_off' | 'no_provider', MessageKey> = {
  no_limit: 'mk.ai.no_limit',
  no_provider: 'mk.ai.no_provider',
  switched_off: 'mk.ai.switched_off',
};

function Step({ n, id, title, status, tip, children }: { n: number; id: string; title: string; status?: ReactNode; tip?: ReactNode; children: ReactNode }) {
  return (
    <section data-step={id} className={SECTION} aria-labelledby={`mk-step-${id}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span aria-hidden="true" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sapphire text-sm font-bold text-white">{n}</span>
        <h2 id={`mk-step-${id}`} className="text-base font-bold">{title}</h2>
        {status}
        {tip}
      </div>
      {children}
    </section>
  );
}

export function MarkingHubView({ paperId }: { paperId: string }) {
  const { t, lang } = useT();
  const [overview, setOverview] = useState<MarkingOverview | null>(null);
  const [setup, setSetup] = useState<SetupScreen | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [editing, setEditing] = useState<boolean | null>(null);
  // The paper's bubble sheets (C364), as the bubble panel last read them; it reads them again when the questions change.
  const [bubbles, setBubbles] = useState<BubbleScreen | null>(null);
  const seen = useRef(false);

  const loadOverview = useCallback(async () => {
    const r = await ask('GET', `/api/app/marking/papers/${paperId}`);
    setDenied(r.status === 403);
    if (r.ok) {
      setOverview(r.body as unknown as MarkingOverview);
      setFailed(false);
      seen.current = true;
    } else if (!seen.current) setFailed(true);
  }, [paperId]);
  const loadSetup = useCallback(async () => {
    const r = await ask('GET', `/api/app/marking/papers/${paperId}/setup`);
    if (r.ok) setSetup(r.body as unknown as SetupScreen);
  }, [paperId]);
  const reload = useCallback(async () => {
    await Promise.all([loadOverview(), loadSetup()]);
  }, [loadOverview, loadSetup]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId]);

  const working = overview ? inProgress(overview) : false;
  useEffect(() => {
    if (!working) return;
    const id = window.setInterval(() => {
      if (!document.hidden) void loadOverview();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [working, loadOverview]);

  if (denied) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('ex.denied')}</p>;
  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('mk.hub.failed')}</p>;
  if (!overview || !setup) return null;

  const { paper, ai } = overview;
  // When the answer-sheet pictures go (C230-AJ), as the sweep works it out; a warning in the last seven days.
  const pictures = overview.pictures ? picturesNote(overview.pictures, indiaDate()) : null;
  const mayChange = paper.mayMark && !paper.published;
  const questions = setup.questions;
  const noQuestions = questions.length === 0;
  const showEditor = editing ?? noQuestions;
  const mayUpload = mayChange && ai.on && overview.ready;
  const whyNot: MessageKey | null = !mayChange ? (paper.published ? 'mk.q.published' : 'mk.q.readOnly') : !ai.on && ai.why ? WHY[ai.why] : !overview.ready ? 'mk.up.needQuestions' : null;
  const bySubject = `${paper.className} · ${paper.subjectName}`;
  const partLine = paper.components.map((c) => t('ex.paper.partMax', { part: c.name, max: numberWords(c.max, lang) })).join(' · ');

  return (
    <div lang={lang} data-marking-hub={paperId} className="flex flex-col gap-4 text-sm text-slate">
      <section className={SECTION}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold">{bySubject}</h2>
            <p className="text-slate/70">{paper.examName} · {paper.date ? dayWords(paper.date, lang) : t('ex.paper.noDate')}</p>
            <p className="text-slate/70">{partLine}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/app/exams/papers/${paperId}`} className={TAP}>{t('mk.hub.byHand')}</a>
            <a href={`/app/exams/papers/${paperId}/insights`} data-insights-link className={TAP}>{t('mk.hub.insights')}</a>
          </div>
        </div>
        {!ai.on && ai.why && (
          <p data-ai-off={ai.why} role="status" className="flex items-start gap-2 rounded-md border border-amber/40 bg-amber/10 px-3 py-2 font-semibold text-amber-text">
            <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{t(WHY[ai.why])}</span>
          </p>
        )}
        {ai.on && ai.limit !== null && (
          <p data-ai-allowance className="text-slate/70">{t('mk.ai.allowance', { used: numberWords(ai.pagesThisMonth, lang), limit: numberWords(ai.limit, lang) })}</p>
        )}
        {pictures && (
          <p
            data-pictures-until={pictures.key}
            role={pictures.warn ? 'status' : undefined}
            className={pictures.warn ? 'flex items-start gap-2 rounded-md border border-amber/40 bg-amber/10 px-3 py-2 font-semibold text-amber-text' : 'text-slate/70'}
          >
            {pictures.warn && <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
            <span>{t(pictures.key, { date: pictures.date ? dayWords(pictures.date, lang) : '', n: numberWords(pictures.days, lang) })}</span>
          </p>
        )}
        {paper.published && <p data-hub-published className="rounded-md bg-off-white px-3 py-2">{t('mk.q.published')}</p>}
        {!paper.published && !paper.mayMark && <p className="rounded-md bg-off-white px-3 py-2">{t('mk.q.readOnly')}</p>}
      </section>

      <Step
        n={1}
        id="questions"
        title={t('mk.step.questions')}
        tip={<InfoTip>{t('mk.step.questionsHow')}</InfoTip>}
        status={noQuestions ? <Badge variant="warning">{t('mk.step.todo')}</Badge> : overview.ready ? <Badge variant="success">{t('mk.step.ready')}</Badge> : <Badge variant="warning">{t('mk.step.fix')}</Badge>}
      >
        {showEditor ? (
          <QuestionsEditor
            key={questions.map((q) => q.questionId).join(',') + String(setup.locked)}
            paperId={paperId}
            screen={setup}
            onSaved={(next) => {
              setSetup(next);
              setEditing(false);
              void loadOverview();
            }}
            onClose={() => setEditing(false)}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <p data-questions-summary>
              {t(questions.length === 1 ? 'mk.q.summaryOne' : 'mk.q.summary', { n: questions.length })} ·{' '}
              {setup.paper.components
                .filter((c) => questions.some((q) => q.component === c.key))
                .map((c) => t('ex.paper.partMax', { part: c.name, max: numberWords(c.max, lang) }))
                .join(' · ')}
            </p>
            {setup.paper.components.some((c) => !questions.some((q) => q.component === c.key)) && (
              <p className="text-slate/70">{t('mk.q.byHand', { parts: setup.paper.components.filter((c) => !questions.some((q) => q.component === c.key)).map((c) => c.name).join(', ') })}</p>
            )}
            {overview.problems.length > 0 && (
              <ul className="flex flex-col gap-1">
                {overview.problems.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-amber-text">
                    <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{problemWords(t, p, paper.components, lang)}</span>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" data-questions-open className={`${TAP} self-start`} onClick={() => setEditing(true)}>
              {mayChange ? t('mk.q.edit') : t('mk.q.view')}
            </button>
          </div>
        )}
      </Step>

      <Step n={2} id="scripts" title={t('mk.step.scripts')} tip={<InfoTip>{t('mk.step.scriptsHow')}</InfoTip>}>
        <BubblePanel key={questions.map((q) => `${q.questionId}:${q.options.length}`).join(',')} paperId={paperId} onScreen={setBubbles} onChanged={() => void loadOverview()} />
        <ScriptsUploader paperId={paperId} overview={overview} mayUpload={mayUpload} why={whyNot} bubbles={bubbles} onChanged={() => void loadOverview()} />
      </Step>

      <Step
        n={3}
        id="progress"
        title={t('mk.step.progress')}
        status={working ? <Badge variant="neutral">{t('mk.step.working')}</Badge> : undefined}
      >
        <ProgressPanel overview={overview} mayChange={mayChange} onChanged={() => void loadOverview()} />
      </Step>

      <Step n={4} id="review" title={t('mk.step.review')} tip={<InfoTip>{t('mk.step.reviewHow')}</InfoTip>}>
        <ExceptionsList paperId={paperId} overview={overview} mayChange={mayChange} onChanged={() => void loadOverview()} />
        <ReviewList paperId={paperId} overview={overview} mayChange={mayChange} onChanged={() => void loadOverview()} />
      </Step>

      <p className="flex items-start gap-2 text-slate/70"><Icon name="info" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />{t('mk.hub.noRank')}</p>
    </div>
  );
}
