'use client';

import { useMemo, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { numberWords } from '@/components/exams/exam-format';
import { PRIMARY, TAP } from '@/components/exams/SchemeParts';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Icon } from '@/components/visual/Icons';
import { MARKING_LANGUAGES, MAX_QUESTIONS, QUESTION_KINDS, type SetupScreen, type StructureProblem } from '@/lib/contracts/marking';
import type { MessageKey } from '@/lib/i18n';
import { firstProblem, formFromQuestion, groupsOf, move, newQuestion, partsWithoutQuestions, problemsOf, sameAsSaved, toNumber, toSaveBody, type QuestionForm, type StepForm } from '@/lib/marking/question-form';
import { ask, errorWords } from './parts';

// Step 1 of a paper's AI marking: its questions (C347). The teacher lists them once, each with its number, the part of
// the paper it counts to, its marks, its kind, its chapter and topic, the question, the answer key and the steps
// that earn marks; questions with internal choice share a group. As they type, the paper's structure is checked in
// plain words (a part that adds up to 78 when it must be 80). Once a script is approved the numbers, parts, marks and
// groups are fixed (the database holds it): only the words change. A part with no question is typed by hand, as before.

export function problemWords(t: (k: MessageKey, p?: Record<string, string | number>) => string, p: StructureProblem, parts: { key: string; name: string }[], lang: 'en' | 'hi'): string {
  const name = (key: string) => parts.find((x) => x.key === key)?.name ?? key;
  if (p.kind === 'part_total') return t('mk.problem.part_total', { part: name(p.component), counted: numberWords(p.counted, lang), max: numberWords(p.max, lang) });
  if (p.kind === 'group_count') return t('mk.problem.group_count', { group: p.group });
  if (p.kind === 'group_parts') return t('mk.problem.group_parts', { group: p.group });
  return t('mk.problem.no_questions');
}

const KIND_KEYS: Record<(typeof QUESTION_KINDS)[number], MessageKey> = {
  objective: 'mk.kind.objective',
  short: 'mk.kind.short',
  long: 'mk.kind.long',
  numerical: 'mk.kind.numerical',
  diagram: 'mk.kind.diagram',
};
const LANGUAGE_KEYS: Record<(typeof MARKING_LANGUAGES)[number], MessageKey> = { en: 'mk.lang.en', hi: 'mk.lang.hi', mixed: 'mk.lang.mixed' };
const FIELD_KEYS: Record<string, MessageKey> = {
  label: 'mk.field.label',
  component: 'mk.field.component',
  maxMarks: 'mk.field.maxMarks',
  choiceGroup: 'mk.field.choiceGroup',
  unitId: 'mk.field.unitId',
  kind: 'mk.field.kind',
  prompt: 'mk.field.prompt',
  answerKey: 'mk.field.answerKey',
  steps: 'mk.field.steps',
  twice: 'mk.field.twice',
  question: 'mk.field.question',
};

export function QuestionsEditor({ paperId, screen, onSaved, onClose }: { paperId: string; screen: SetupScreen; onSaved: (screen: SetupScreen) => void; onClose: () => void }) {
  const { t, lang } = useT();
  const { paper } = screen;
  const mayChange = paper.mayMark && !paper.published;
  const [forms, setForms] = useState<QuestionForm[]>(() => screen.questions.map(formFromQuestion));
  const [counts, setCounts] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(screen.setup.choiceCounts).map(([g, n]) => [g, String(n)])));
  const [language, setLanguage] = useState(screen.setup.language);
  const [guidance, setGuidance] = useState(screen.setup.guidance);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string; at?: number } | null>(null);
  const parts = useMemo(() => paper.components.map((c) => c.key), [paper.components]);
  const locked = screen.locked;
  const groups = groupsOf(forms);
  // A new group has no count yet: one, until the teacher says otherwise.
  const countOf = (g: string) => counts[g] ?? '1';
  const effectiveCounts = Object.fromEntries(groups.map((g) => [g, countOf(g)]));
  const problems = problemsOf(forms, paper.components, effectiveCounts);
  const byHand = partsWithoutQuestions(forms, paper.components);
  const dirty = !sameAsSaved(forms, effectiveCounts, { questions: screen.questions, choiceCounts: screen.setup.choiceCounts }, { language, guidance }, screen.setup);

  const set = (i: number, patch: Partial<QuestionForm>) => setForms(forms.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const setStep = (i: number, s: number, patch: Partial<StepForm>) => set(i, { steps: forms[i].steps.map((x, k) => (k === s ? { ...x, ...patch } : x)) });

  const save = async () => {
    const wrong = firstProblem(forms, parts, effectiveCounts);
    if (wrong) {
      const where = wrong.at >= 0 ? t('mk.err.question_n', { n: wrong.at + 1 }) : '';
      const what = wrong.field === 'too_many' ? t('mk.err.too_many') : wrong.field === 'group_count' ? t('mk.err.group_count') : t(FIELD_KEYS[wrong.field] ?? 'mk.field.question');
      return setNote({ ok: false, text: `${where} ${what}`.trim(), at: wrong.at >= 0 ? wrong.at : undefined });
    }
    setBusy(true);
    setNote(null);
    const r = await ask('POST', `/api/app/marking/papers/${paperId}/setup`, toSaveBody(forms, effectiveCounts, { language, guidance }));
    setBusy(false);
    if (!r.ok) {
      const at = typeof r.body?.at === 'number' ? r.body.at : undefined;
      const field = typeof r.body?.field === 'string' ? r.body.field : '';
      const where = at !== undefined ? t('mk.err.question_n', { n: at + 1 }) : '';
      const what = r.body?.code === 'question' && field && FIELD_KEYS[field] ? t(FIELD_KEYS[field]) : errorWords(t, r);
      return setNote({ ok: false, text: `${where} ${what}`.trim(), at });
    }
    const next = (r.body?.screen ?? null) as SetupScreen | null;
    setNote({ ok: true, text: t('mk.q.saved') });
    if (next) onSaved(next);
  };

  return (
    <div data-questions-editor className="flex flex-col gap-4">
      {locked && <p data-questions-locked className="rounded-md bg-off-white px-3 py-2">{t('mk.q.locked')}</p>}
      {!mayChange && <p className="rounded-md bg-off-white px-3 py-2">{paper.published ? t('mk.q.published') : t('mk.q.readOnly')}</p>}

      <details className="rounded-md border border-slate/10 p-3">
        <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold">{t('mk.setup.title')}</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Select id="mk-language" label={t('mk.setup.language')} value={language} disabled={!mayChange} onChange={(e) => setLanguage(e.target.value as typeof language)}>
            {MARKING_LANGUAGES.map((l) => (
              <option key={l} value={l}>{t(LANGUAGE_KEYS[l])}</option>
            ))}
          </Select>
          <Textarea id="mk-guidance" label={t('mk.setup.guidance')} rows={3} maxLength={2000} value={guidance} disabled={!mayChange} onChange={(e) => setGuidance(e.target.value)} helperText={t('mk.setup.guidanceHow')} />
        </div>
      </details>

      {!forms.length && <p className="rounded-md bg-off-white px-3 py-2">{t('mk.q.none')}</p>}

      <ol className="flex flex-col gap-3">
        {forms.map((f, i) => {
          const id = (what: string) => `mk-q-${i}-${what}`;
          const maxOk = f.maxMarks.trim() !== '' && Number.isFinite(toNumber(f.maxMarks)) && toNumber(f.maxMarks) > 0 && toNumber(f.maxMarks) <= 100 && Math.round(toNumber(f.maxMarks) * 10) === toNumber(f.maxMarks) * 10;
          const given = f.steps.reduce((s, x) => s + (Number.isFinite(toNumber(x.marks)) ? toNumber(x.marks) : 0), 0);
          return (
            <li key={f.key} data-question={f.label} className={`flex flex-col gap-3 rounded-lg border p-3 ${note?.at === i && !note.ok ? 'border-red-800/50' : 'border-slate/15'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold">{t('mk.q.n', { n: i + 1 })}</h3>
                {mayChange && !locked && (
                  <div className="flex flex-wrap gap-1">
                    <button type="button" className={TAP} aria-label={t('mk.q.up')} disabled={i === 0} onClick={() => setForms(move(forms, i, -1))}>
                      <Icon name="chevronLeft" className="h-4 w-4 rotate-90" aria-hidden="true" />
                      <span className="sr-only">{t('mk.q.up')}</span>
                    </button>
                    <button type="button" className={TAP} aria-label={t('mk.q.down')} disabled={i === forms.length - 1} onClick={() => setForms(move(forms, i, 1))}>
                      <Icon name="chevronRight" className="h-4 w-4 rotate-90" aria-hidden="true" />
                      <span className="sr-only">{t('mk.q.down')}</span>
                    </button>
                    <button type="button" className={TAP} data-question-remove onClick={() => setForms(forms.filter((_, j) => j !== i))}>
                      {t('mk.q.remove')}
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Input id={id('label')} label={t('mk.q.label')} maxLength={12} value={f.label} disabled={!mayChange || locked} onChange={(e) => set(i, { label: e.target.value })} />
                <Select id={id('part')} label={t('mk.q.part')} value={f.component} disabled={!mayChange || locked} onChange={(e) => set(i, { component: e.target.value })}>
                  {paper.components.map((c) => (
                    <option key={c.key} value={c.key}>{c.name}</option>
                  ))}
                </Select>
                <Input id={id('marks')} label={t('mk.q.marks')} inputMode="decimal" value={f.maxMarks} error={f.maxMarks.trim() !== '' && !maxOk ? t('mk.q.marksBad') : undefined} disabled={!mayChange || locked} onChange={(e) => set(i, { maxMarks: e.target.value })} />
                <Select id={id('kind')} label={t('mk.q.kind')} value={f.kind} disabled={!mayChange} onChange={(e) => set(i, { kind: e.target.value as QuestionForm['kind'] })}>
                  {QUESTION_KINDS.map((k) => (
                    <option key={k} value={k}>{t(KIND_KEYS[k])}</option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem]">
                <Select id={id('unit')} label={t('mk.q.topic')} value={f.unitId} disabled={!mayChange} onChange={(e) => set(i, { unitId: e.target.value })}>
                  <option value="">{paper.units.length ? t('mk.q.noTopic') : t('mk.q.noMap')}</option>
                  {paper.units.map((u) => (
                    <option key={u.unitId} value={u.unitId}>{u.chapter}: {u.topic}</option>
                  ))}
                </Select>
                <Input id={id('group')} label={t('mk.q.group')} maxLength={2} value={f.choiceGroup} disabled={!mayChange || locked} onChange={(e) => set(i, { choiceGroup: e.target.value.toUpperCase() })} helperText={t('mk.q.groupHow')} />
              </div>
              <Textarea id={id('prompt')} label={t('mk.q.prompt')} rows={3} maxLength={4000} value={f.prompt} disabled={!mayChange} onChange={(e) => set(i, { prompt: e.target.value })} />
              <Textarea id={id('key')} label={t('mk.q.key')} rows={3} maxLength={8000} value={f.answerKey} disabled={!mayChange} onChange={(e) => set(i, { answerKey: e.target.value })} />
              <fieldset className="flex flex-col gap-2">
                <legend className="flex flex-wrap items-center gap-x-1 text-sm font-semibold">
                  {t('mk.q.steps')}
                  <InfoTip>{t('mk.q.stepsHow')}</InfoTip>
                </legend>
                {f.steps.map((s, k) => (
                  <div key={k} className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-start gap-2">
                    <Input id={id(`step-${k}`)} label={t('mk.q.step')} maxLength={300} value={s.step} disabled={!mayChange} onChange={(e) => setStep(i, k, { step: e.target.value })} />
                    <Input id={id(`step-${k}-marks`)} label={t('mk.q.stepMarks')} inputMode="decimal" value={s.marks} disabled={!mayChange} onChange={(e) => setStep(i, k, { marks: e.target.value })} />
                    {mayChange && (
                      <button type="button" className={TAP} aria-label={t('mk.q.stepRemove')} onClick={() => set(i, { steps: f.steps.filter((_, m) => m !== k) })}>
                        <span aria-hidden="true">×</span>
                        <span className="sr-only">{t('mk.q.stepRemove')}</span>
                      </button>
                    )}
                  </div>
                ))}
                {maxOk && given > toNumber(f.maxMarks) + 1e-9 && <p role="alert" className="text-red-800">{t('mk.q.stepsOver', { given: numberWords(given, lang), max: numberWords(toNumber(f.maxMarks), lang) })}</p>}
                {mayChange && f.steps.length < 12 && (
                  <button type="button" className={`${TAP} self-start`} onClick={() => set(i, { steps: [...f.steps, { step: '', marks: '' }] })}>
                    {t('mk.q.stepAdd')}
                  </button>
                )}
              </fieldset>
            </li>
          );
        })}
      </ol>

      {groups.length > 0 && (
        <fieldset data-choice-groups className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
          <legend className="flex flex-wrap items-center gap-x-1 px-1 text-sm font-semibold">
            {t('mk.group.title')}
            <InfoTip>{t('mk.group.how')}</InfoTip>
          </legend>
          {groups.map((g) => {
            const size = forms.filter((f) => f.choiceGroup.trim().toUpperCase() === g).length;
            return (
              <div key={g} className="flex flex-wrap items-center gap-3">
                <div className="w-28">
                  <Input id={`mk-group-${g}`} label={t('mk.group.count', { group: g })} inputMode="numeric" floating={false} value={countOf(g)} disabled={!mayChange} onChange={(e) => setCounts({ ...counts, [g]: e.target.value })} />
                </div>
                <p>{t('mk.group.of', { group: g, size })}</p>
              </div>
            );
          })}
        </fieldset>
      )}

      {byHand.length > 0 && forms.length > 0 && (
        <p data-typed-by-hand className="rounded-md bg-off-white px-3 py-2">{t('mk.q.byHand', { parts: byHand.map((p) => p.name).join(', ') })}</p>
      )}

      {problems.length > 0 && forms.length > 0 && (
        <ul data-structure-problems className="flex flex-col gap-1" role="status">
          {problems.map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-amber-text">
              <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{problemWords(t, p, paper.components, lang)}</span>
            </li>
          ))}
        </ul>
      )}
      {problems.length === 0 && forms.length > 0 && <p data-structure-ok className="flex items-center gap-2 text-emerald-text"><Icon name="check" className="h-5 w-5" aria-hidden="true" />{t('mk.q.adds')}</p>}

      {note && (
        <p role="status" data-questions-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {mayChange && !locked && forms.length < MAX_QUESTIONS && (
          <button type="button" data-question-add className={TAP} onClick={() => setForms([...forms, newQuestion(forms, parts)])}>
            <Icon name="plus" className="h-4 w-4" aria-hidden="true" />
            {t('mk.q.add')}
          </button>
        )}
        {mayChange && (
          <button type="button" data-questions-save className={PRIMARY} disabled={busy || !dirty} onClick={() => void save()}>
            {t('mk.q.save')}
          </button>
        )}
        <button type="button" className={TAP} onClick={onClose}>{dirty && mayChange ? t('mk.q.discard') : t('mk.q.close')}</button>
      </div>
    </div>
  );
}
