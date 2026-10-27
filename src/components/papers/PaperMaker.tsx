'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { dayWords, momentWords, numberWords } from '@/components/exams/exam-format';
import { PRIMARY, TAP } from '@/components/exams/SchemeParts';
import { ask } from '@/components/marking/parts';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/components/visual/Icons';
import { QUESTION_KINDS, type QuestionKind } from '@/lib/contracts/marking';
import type { MessageKey } from '@/lib/i18n';
import { toNumber } from '@/lib/marking/question-form';
import { blueprintTotal, SECTION_LETTERS, type BlueprintSection } from '@/lib/papers/blueprint';
import type { PlanProblem } from '@/lib/papers/scope';
import type { MakeScreen, PrintData } from '@/lib/papers/types';
import { refusalWords } from './BankTools';
import { downloadPaperPdf } from './paper-pdf';

// "Make the paper" on a paper's questions screen (docs/36 §1.1, C362, C363). Before making it says, in plain words,
// which rule chose the chapters (taught since the last test of the type, this session, or the whole syllabus map; and
// when nothing was logged, which fallback was used), each chapter's periods and marks (the teacher may type their own),
// and the exam type's blueprint (the teacher may change the sections for this paper). A plan that does not fit the
// paper's marks is said, never forced. While the job works the screen asks every few seconds; then the questions are
// the teacher's to edit. Keeping the paper is the teacher's act; it prints only once kept, and again after a change.

const REFRESH_MS = 5000;
const KIND_KEYS: Record<QuestionKind, MessageKey> = {
  objective: 'mk.kind.objective',
  short: 'mk.kind.short',
  long: 'mk.kind.long',
  numerical: 'mk.kind.numerical',
  diagram: 'mk.kind.diagram',
};
const WHY_KEYS: Record<string, MessageKey> = {
  closed: 'pp.refused.closed',
  not_allowed: 'pp.refused.not_allowed',
  locked: 'pp.refused.locked',
  busy: 'pp.refused.busy',
  no_blueprint: 'pp.refused.no_blueprint',
  blueprint: 'pp.refused.blueprint',
  plan: 'pp.refused.plan',
};
const PRINT_KEYS: Record<string, MessageKey> = {
  no_questions: 'pp.print.no_questions',
  busy: 'pp.print.busy',
  not_kept: 'pp.print.not_kept',
  changed: 'pp.print.changed',
  drafts: 'pp.print.drafts',
};
const FAILURE_KEYS: Record<string, MessageKey> = {
  closed: 'pp.failed.closed',
  locked: 'pp.failed.locked',
  has_questions: 'pp.failed.has_questions',
  no_answer: 'pp.failed.no_answer',
  ai_off: 'pp.failed.ai_off',
  stopped: 'pp.failed.stopped',
  error: 'pp.failed.stopped',
};

type SectionForm = { section: string; kind: QuestionKind; count: string; marksEach: string; answerAny: string };
const toForm = (s: BlueprintSection): SectionForm => ({ section: s.section, kind: s.kind, count: String(s.count), marksEach: String(s.marksEach), answerAny: String(s.answerAny) });
const fromForm = (s: SectionForm) => ({ section: s.section, kind: s.kind, count: toNumber(s.count), marksEach: toNumber(s.marksEach), answerAny: s.answerAny.trim() === '' ? 0 : toNumber(s.answerAny) });

// `refresh`: anything that changes when the paper's questions were saved elsewhere on the screen (the hub's setup), so
// whether the paper is kept and prints is read again.
export function PaperMaker({ paperId, refresh, onChanged }: { paperId: string; refresh?: unknown; onChanged: () => void }) {
  const { t, lang } = useT();
  const [screen, setScreen] = useState<MakeScreen | null>(null);
  const [applied, setApplied] = useState<{ sections?: ReturnType<typeof fromForm>[]; chapterMarks?: Record<string, number> }>({});
  const [sections, setSections] = useState<SectionForm[] | null>(null);
  const [marks, setMarks] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [sure, setSure] = useState(false);
  const wasRunning = useRef(false);

  const show = useCallback((next: MakeScreen) => {
    setScreen(next);
    setSections(next.plan ? next.plan.blueprint.sections.map(toForm) : null);
    setMarks(next.plan ? Object.fromEntries(next.plan.chapters.map((c) => [c.chapter, String(c.marks)])) : null);
  }, []);
  const load = useCallback(async () => {
    const r = await ask('GET', `/api/app/marking/papers/${paperId}/make`);
    if (r.ok) show(r.body as unknown as MakeScreen);
  }, [paperId, show]);
  useEffect(() => {
    void load();
  }, [load, refresh]);

  const running = !!screen?.generation && (screen.generation.state === 'waiting' || screen.generation.state === 'working');
  useEffect(() => {
    if (running) wasRunning.current = true;
    else if (wasRunning.current) {
      // A making just ended: the questions on the screen are stale.
      wasRunning.current = false;
      onChanged();
    }
    if (!running) return;
    const id = window.setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [running, load, onChanged]);

  if (!screen) return null;
  const plan = screen.plan;
  const g = screen.generation;
  const examType = lang === 'hi' ? screen.examType.hi : screen.examType.en;

  const preview = async (next: typeof applied) => {
    setBusy(true);
    setNote(null);
    const r = await ask('POST', `/api/app/marking/papers/${paperId}/make`, { preview: true, ...next });
    setBusy(false);
    if (!r.ok) return setNote({ ok: false, text: refusalWords(t, r) });
    setApplied(next);
    show(r.body as unknown as MakeScreen);
  };
  const make = async () => {
    setBusy(true);
    setNote(null);
    const r = await ask('POST', `/api/app/marking/papers/${paperId}/make`, { again: screen.questions > 0, ...applied });
    setBusy(false);
    setSure(false);
    if (!r.ok) return setNote({ ok: false, text: refusalWords(t, r) });
    setNote({ ok: true, text: t('pp.make.asked') });
    await load();
  };
  const keep = async () => {
    setBusy(true);
    setNote(null);
    const r = await ask('POST', `/api/app/marking/papers/${paperId}/keep`);
    setBusy(false);
    if (!r.ok) return setNote({ ok: false, text: refusalWords(t, r) });
    setNote({ ok: true, text: t('pp.keep.done') });
    if (r.body?.screen) show(r.body.screen as unknown as MakeScreen);
    onChanged();
  };
  const print = async (which: 'paper' | 'scheme') => {
    setBusy(true);
    setNote(null);
    const r = await ask('GET', `/api/app/marking/papers/${paperId}/print`);
    if (!r.ok) {
      setBusy(false);
      return setNote({ ok: false, text: refusalWords(t, r) });
    }
    try {
      await downloadPaperPdf(r.body as unknown as PrintData, which, lang);
    } catch {
      setNote({ ok: false, text: t('pp.print.failed') });
    }
    setBusy(false);
  };

  const scopeWords = (): string => {
    if (!plan) return '';
    const s = plan.scope;
    if (s.rule === 'whole_map') return t('pp.scope.wholeMap');
    if (s.used === 'paper_units') return t('pp.scope.paperUnits');
    if (s.used === 'whole_map') return t('pp.scope.mapFallback');
    if (s.rule === 'since_last_of_type' && s.after) return t('pp.scope.since', { date: dayWords(s.after, lang), type: examType });
    if (s.rule === 'since_last_of_type') return t('pp.scope.sinceStart', { type: examType });
    return t('pp.scope.session');
  };
  const problemWords = (p: PlanProblem): string => {
    if (p.kind === 'total') return t('pp.problem.total', { blueprint: numberWords(p.blueprint, lang), part: plan?.part?.name ?? p.part, max: numberWords(p.max, lang) });
    if (p.kind === 'no_map') return t('pp.problem.no_map');
    if (p.kind === 'typed') return t('pp.problem.typed', { total: numberWords(plan?.blueprint.totalMarks ?? 0, lang) });
    return t('pp.problem.blueprint');
  };
  const sectionTotal = sections ? blueprintTotal(sections.map(fromForm).map((s) => ({ ...s, count: Number.isFinite(s.count) ? s.count : 0, marksEach: Number.isFinite(s.marksEach) ? s.marksEach : 0, answerAny: Number.isFinite(s.answerAny) ? s.answerAny : 0 }))) : 0;
  const typedTotal = marks ? Object.values(marks).reduce((n, v) => n + (Number.isFinite(toNumber(v)) ? toNumber(v) : 0), 0) : 0;
  const mayChangePlan = !running && (screen.why === null || screen.why === 'plan' || screen.why === 'blueprint' || screen.why === 'has_questions');
  const setSection = (i: number, patch: Partial<SectionForm>) => setSections((sections ?? []).map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <section data-paper-maker={paperId} className="flex flex-col gap-3 rounded-md border border-sapphire/20 bg-off-white p-3" aria-labelledby="pp-title">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 id="pp-title" className="font-bold">{t('pp.title')}</h3>
        <InfoTip>{t('pp.how')}</InfoTip>
        {running && <Badge variant="neutral">{t('pp.making')}</Badge>}
        {screen.printable && <Badge variant="success">{t('pp.kept')}</Badge>}
      </div>

      {!screen.blueprint && <p data-no-blueprint>{t('pp.noBlueprint', { type: examType })}</p>}
      {screen.blueprint && !screen.ai && <p data-ai-writing-off className="text-slate/80">{t('pp.aiOff')}</p>}

      {running && (
        <p data-making role="status" className="flex items-start gap-2 font-semibold">
          <Icon name="sparkle" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{g?.kind === 'question' ? t('pp.makingOne') : t('pp.makingPaper')}</span>
        </p>
      )}
      {g && g.state === 'done' && !running && g.result && g.kind !== 'question' && (
        <p data-made className="text-slate/80">
          {t('pp.made', { when: g.finishedAt ? momentWords(g.finishedAt, lang) : '', bank: g.result.bank, ai: g.result.ai, empty: g.result.empty })}
          {g.result.empty > 0 && ` ${t('pp.madeEmpty')}`}
        </p>
      )}
      {g && g.state === 'failed' && <p data-make-failed className="text-amber-text">{t(FAILURE_KEYS[g.failure ?? 'stopped'] ?? 'pp.failed.stopped')}</p>}

      {plan && sections && marks && (
        <details className="group" open={screen.questions === 0 && !running}>
          <summary className="flex min-h-[44px] cursor-pointer items-center justify-between gap-2 font-semibold">
            {t('pp.plan.title', { type: examType })}
            <Icon name="chevronDown" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
          </summary>
          <div className="mt-2 flex flex-col gap-3">
            <p data-scope={`${plan.scope.rule}:${plan.scope.used}`}>{scopeWords()}</p>
            {plan.scope.unlinked > 0 && <p className="text-slate/70">{t('pp.scope.unlinked', { n: plan.scope.unlinked })}</p>}

            <div className="flex flex-col gap-2">
              <h4 className="flex flex-wrap items-center gap-x-1 font-semibold">
                {t('pp.chapters.title')}
                <InfoTip>{t(plan.weight === 'equal' ? 'pp.chapters.equal' : plan.weight === 'typed' ? 'pp.chapters.typed' : 'pp.chapters.periodsHow')}</InfoTip>
              </h4>
              <ul data-plan-chapters className="flex flex-col gap-2">
                {plan.chapters.map((c, i) => (
                  <li key={c.chapter} className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-2 rounded-md bg-white p-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{c.chapter}</p>
                      <p className="text-slate/70">
                        {t('pp.chapters.periods', { n: c.periods })} · {t('pp.chapters.planned', { n: numberWords(c.planned, lang) })}
                      </p>
                    </div>
                    <Input id={`pp-ch-${i}`} label={t('pp.chapters.marks')} inputMode="decimal" value={marks[c.chapter] ?? ''} disabled={!mayChangePlan} onChange={(e) => setMarks({ ...marks, [c.chapter]: e.target.value })} />
                  </li>
                ))}
              </ul>
              {mayChangePlan && (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" data-use-marks className={TAP} disabled={busy} onClick={() => void preview({ ...applied, chapterMarks: Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, toNumber(v)])) })}>
                    {t('pp.chapters.use')}
                  </button>
                  {applied.chapterMarks && (
                    <button type="button" className={TAP} disabled={busy} onClick={() => void preview({ sections: applied.sections })}>
                      {t('pp.chapters.reset')}
                    </button>
                  )}
                  <span className="text-slate/70">{t('pp.chapters.total', { n: numberWords(typedTotal, lang), total: numberWords(plan.blueprint.totalMarks, lang) })}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <h4 className="flex flex-wrap items-center gap-x-1 font-semibold">
                {t('pp.sections.title')}
                <InfoTip>{t('pp.sections.how')}</InfoTip>
              </h4>
              <ul data-plan-sections className="flex flex-col gap-2">
                {sections.map((s, i) => (
                  <li key={s.section} className="grid grid-cols-2 items-start gap-2 rounded-md bg-white p-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_6rem_6rem_6rem]">
                    <p className="col-span-2 flex min-h-[44px] items-center font-semibold sm:col-span-1">{t('pp.section', { section: s.section })}</p>
                    <Select id={`pp-sec-${i}-kind`} label={t('pp.sections.kind')} value={s.kind} disabled={!mayChangePlan} onChange={(e) => setSection(i, { kind: e.target.value as QuestionKind })}>
                      {QUESTION_KINDS.map((k) => (
                        <option key={k} value={k}>{t(KIND_KEYS[k])}</option>
                      ))}
                    </Select>
                    <Input id={`pp-sec-${i}-count`} label={t('pp.sections.count')} inputMode="numeric" value={s.count} disabled={!mayChangePlan} onChange={(e) => setSection(i, { count: e.target.value })} />
                    <Input id={`pp-sec-${i}-each`} label={t('pp.sections.each')} inputMode="decimal" value={s.marksEach} disabled={!mayChangePlan} onChange={(e) => setSection(i, { marksEach: e.target.value })} />
                    <Input id={`pp-sec-${i}-any`} label={t('pp.sections.any')} inputMode="numeric" value={s.answerAny} disabled={!mayChangePlan} onChange={(e) => setSection(i, { answerAny: e.target.value })} />
                  </li>
                ))}
              </ul>
              <p data-plan-total>
                {t('pp.sections.total', { n: numberWords(sectionTotal, lang) })}
                {plan.part ? ` · ${t('pp.sections.part', { part: plan.part.name, max: numberWords(plan.part.max, lang) })}` : ''}
                {screen.blueprint ? ` · ${t('pp.sections.minutes', { n: screen.blueprint.minutes })}` : ''}
              </p>
              {mayChangePlan && (
                <div className="flex flex-wrap gap-2">
                  {sections.length < SECTION_LETTERS.length && (
                    <button type="button" className={TAP} disabled={busy} onClick={() => setSections([...sections, { section: SECTION_LETTERS[sections.length], kind: 'short', count: '1', marksEach: '1', answerAny: '0' }])}>
                      {t('pp.sections.add')}
                    </button>
                  )}
                  {sections.length > 1 && (
                    <button type="button" className={TAP} disabled={busy} onClick={() => setSections(sections.slice(0, -1))}>
                      {t('pp.sections.remove')}
                    </button>
                  )}
                  <button type="button" data-use-sections className={TAP} disabled={busy} onClick={() => void preview({ ...applied, sections: sections.map(fromForm) })}>
                    {t('pp.sections.use')}
                  </button>
                  {applied.sections && (
                    <button type="button" className={TAP} disabled={busy} onClick={() => void preview({ chapterMarks: applied.chapterMarks })}>
                      {t('pp.sections.reset')}
                    </button>
                  )}
                </div>
              )}
            </div>

            {plan.problems.length > 0 && (
              <ul data-plan-problems role="status" className="flex flex-col gap-1">
                {plan.problems.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-amber-text">
                    <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{problemWords(p)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}

      {screen.why && screen.why !== 'has_questions' && screen.why !== 'plan' && WHY_KEYS[screen.why] && <p className="text-slate/80">{t(WHY_KEYS[screen.why])}</p>}

      {note && (
        <p role="status" data-maker-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {plan && (screen.mayMake || screen.why === 'has_questions') && !running && (
          screen.questions > 0 && !sure ? (
            <button type="button" data-make-again className={TAP} disabled={busy} onClick={() => setSure(true)}>
              {t('pp.make.again')}
            </button>
          ) : (
            <button type="button" data-make-paper className={PRIMARY} disabled={busy || plan.problems.length > 0} onClick={() => void make()}>
              {screen.questions > 0 ? t('pp.make.againSure', { n: screen.questions }) : t('pp.make.go')}
            </button>
          )
        )}
        {sure && (
          <button type="button" className={TAP} onClick={() => setSure(false)}>
            {t('pp.cancel')}
          </button>
        )}
      </div>

      {screen.questions > 0 && !running && (
        <div data-keep-print className="flex flex-col gap-2 border-t border-slate/10 pt-3">
          <p className="text-slate/80">
            {screen.kept && screen.printable
              ? t('pp.keep.keptBy', { when: momentWords(screen.kept.at, lang), name: screen.kept.by ?? '' })
              : screen.printWhy && PRINT_KEYS[screen.printWhy]
                ? t(PRINT_KEYS[screen.printWhy])
                : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {!screen.printable && screen.printWhy !== 'busy' && (
              <button type="button" data-keep-paper className={PRIMARY} disabled={busy} onClick={() => void keep()}>
                {t('pp.keep.go')}
              </button>
            )}
            <button type="button" data-print-paper className={TAP} disabled={busy || !screen.printable} onClick={() => void print('paper')}>
              <Icon name="download" className="h-4 w-4" aria-hidden="true" />
              {t('pp.print.paper')}
            </button>
            <button type="button" data-print-scheme className={TAP} disabled={busy || !screen.printable} onClick={() => void print('scheme')}>
              <Icon name="download" className="h-4 w-4" aria-hidden="true" />
              {t('pp.print.scheme')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
