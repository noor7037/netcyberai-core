'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon } from '@/components/visual/Icons';
import { LESSON_EXAMPLE } from '@/demo-fixture/lesson-plan-example';
import {
  LIMITS,
  MAX,
  PHASES,
  PHASE_PARTS,
  QUESTION_TYPES,
  balancePhases,
  blankLesson,
  blankQuestion,
  cleanLesson,
  lessonErrors,
  lessonReport,
  mcqChoices,
  periodMinutes,
  phaseMinutes,
  phaseTotal,
  phasesFromMinutes,
  splitPeriod,
  worksheetErrors,
  worksheetOf,
  type Lesson,
  type LessonQuestion,
  type PhaseId,
  type QuestionType,
  type Worksheet,
} from '@/lib/free-tools/lesson-plan';
import { withSchool, type ReportSchool } from '@/lib/free-tools/report';
import { downloadBlob, safeFilename, shareFile } from '@/lib/pdf/browser';
import { usePrint } from './PrintPortal';
import { UI } from '@/lib/free-tools/engine';
import { ReportActions, btn, btnLine, btnQuiet, btnSolid, useToday } from './ReportActions';
import { ReportView } from './ReportView';
import { SchoolProfilePanel } from './SchoolProfilePanel';
import { useSchoolProfile } from './useSchoolProfile';

// The lesson plan and worksheet maker. It lays out what the teacher types
// into a timed plan (a ToolReport, so it prints, downloads and exports like
// every other free tool) and a worksheet with an answer key on its own
// page. A lesson holds no one's personal details, so the teacher may keep
// it in this browser. Nothing is sent anywhere.

const KEY = 'nca-free-tool:lesson-plan-worksheet-maker';
const RULES_UPDATED = '14 October 2026';
const PATH = '/free-tools/lesson-plan-worksheet-maker';
const inputCls =
  'min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire';
const areaCls = `${inputCls} py-2`;
const removeCls =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-red-800 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal disabled:cursor-not-allowed disabled:opacity-40';
const btnRemove = `${btn} border border-slate/20 bg-white text-red-800 hover:bg-red-50`;
const panel = 'flex flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-5';
const sectionTitle = 'text-lg font-extrabold text-sapphire';

const clone = (l: Lesson): Lesson => JSON.parse(JSON.stringify(l));

// The teacher's balance between the phases, used when the period changes.
function partsOf(l: Lesson): Record<PhaseId, number> {
  const m = phaseMinutes(l.phases);
  return m && Object.values(m).some((x) => x > 0) ? m : { ...PHASE_PARTS };
}

function Field({ id, label, help, children }: { id: string; label: string; help?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate">
        {label}
      </label>
      {children}
      {help && (
        <p id={`${id}-help`} className="text-xs text-slate/70">
          {help}
        </p>
      )}
    </div>
  );
}

// The worksheet as it prints: school header, title, lines for the student,
// numbered questions, then the answer key on a page of its own.
function WorksheetView({ ws, school, forPrint = false }: { ws: Worksheet; school?: ReportSchool; forPrint?: boolean }) {
  const H = forPrint ? 'h1' : 'h3';
  return (
    <div className={forPrint ? '' : 'flex flex-col gap-4'}>
      <article className="nca-report flex flex-col gap-5 rounded-3xl border border-slate/10 bg-white p-5 sm:p-8" aria-label={ws.title}>
        <header className="flex flex-col gap-1 border-b border-slate/10 pb-4">
          {school && (
            <div className="mb-3 flex items-center gap-3">
              {school.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={school.logo} alt="" className="h-14 w-auto max-w-[7rem] object-contain" />
              )}
              <div className="min-w-0">
                <p className="text-lg font-extrabold text-slate">{school.name}</p>
                {school.lines.map((l) => (
                  <p key={l} className="text-xs text-slate/70">
                    {l}
                  </p>
                ))}
              </div>
            </div>
          )}
          <H className="text-2xl font-extrabold text-sapphire">{ws.title}</H>
          {ws.subtitle && <p className="text-slate/70">{ws.subtitle}</p>}
        </header>
        <div className="grid grid-cols-1 gap-4 text-sm text-slate sm:grid-cols-[2fr_1fr_1fr]">
          {['Name', 'Roll No.', 'Date'].map((f) => (
            <p key={f} className="flex items-end gap-2">
              <span className="font-semibold">{f}:</span>
              <span aria-hidden="true" className="h-6 flex-1 border-b border-slate/60" />
            </p>
          ))}
        </div>
        <ol className="flex flex-col gap-6">
          {ws.items.map((it) => (
            <li key={it.no} className="flex break-inside-avoid gap-3 text-slate">
              <span className="w-6 shrink-0 font-bold">{it.no}.</span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="whitespace-pre-line break-words">{it.text}</p>
                {it.type === 'mcq' && (
                  <ul className="flex flex-col gap-1 pl-2">
                    {it.options.map((o) => (
                      <li key={o.label}>
                        ({o.label}) {o.text}
                      </li>
                    ))}
                  </ul>
                )}
                {it.type === 'truefalse' && <p className="pl-2 text-slate/70">True / False (circle one)</p>}
                {it.type === 'short' && (
                  <div aria-hidden="true" className="flex flex-col gap-1">
                    <span className="block h-8 border-b border-slate/60" />
                    <span className="block h-8 border-b border-slate/60" />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </article>
      <article className="nca-report flex break-before-page flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-5 sm:p-8" aria-label={`Answer key: ${ws.title}`}>
        <header className="flex flex-col gap-1 border-b border-slate/10 pb-4">
          {school && <p className="text-sm font-bold text-slate">{school.name}</p>}
          <H className="text-xl font-extrabold text-sapphire">Answer key</H>
          <p className="text-sm text-slate/70">{[ws.title, ws.subtitle].filter(Boolean).join(' · ')}</p>
        </header>
        <ol className="flex flex-col gap-2 text-slate">
          {ws.items.map((it) => (
            <li key={it.no} className="flex gap-3">
              <span className="w-6 shrink-0 font-bold">{it.no}.</span>
              <span className="min-w-0 break-words">{it.answer}</span>
            </li>
          ))}
        </ol>
      </article>
    </div>
  );
}

function QuestionEditor({ q, i, onChange, onRemove }: { q: LessonQuestion; i: number; onChange: (q: LessonQuestion) => void; onRemove: () => void }) {
  const id = `lp-q${i}`;
  const choices = mcqChoices(q);
  return (
    <fieldset className="flex flex-col gap-3 rounded-2xl border border-slate/10 p-4">
      <legend className="px-1 text-sm font-bold text-slate">Question {i + 1}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <Field id={`${id}-type`} label="Type">
          <select id={`${id}-type`} className={inputCls} value={q.type} onChange={(e) => onChange({ ...q, type: e.target.value as QuestionType, answer: '' })}>
            {QUESTION_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${id}-text`} label="Question" help={q.type === 'blank' ? 'Type ___ (three underscores) where the blank goes, or it is put at the end.' : undefined}>
          <textarea
            id={`${id}-text`}
            className={areaCls}
            rows={2}
            maxLength={MAX.question}
            aria-describedby={q.type === 'blank' ? `${id}-text-help` : undefined}
            value={q.text}
            onChange={(e) => onChange({ ...q, text: e.target.value })}
          />
        </Field>
      </div>
      {q.type === 'mcq' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {q.options.map((o, oi) => (
            <Field key={oi} id={`${id}-o${oi}`} label={`Option ${oi + 1}`}>
              <input id={`${id}-o${oi}`} className={inputCls} maxLength={MAX.option} value={o} onChange={(e) => onChange({ ...q, options: q.options.map((x, j) => (j === oi ? e.target.value : x)) })} />
            </Field>
          ))}
          <Field id={`${id}-answer`} label="Correct option (for the key)" help="Filled options are lettered (a) to (d) in order on the worksheet.">
            <select id={`${id}-answer`} className={inputCls} aria-describedby={`${id}-answer-help`} value={choices.some((c) => c.slot === q.answer) ? q.answer : ''} onChange={(e) => onChange({ ...q, answer: e.target.value })}>
              <option value="">Choose…</option>
              {choices.map((c) => (
                <option key={c.slot} value={c.slot}>
                  ({c.label}) {c.text}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {q.type === 'truefalse' && (
        <div className="max-w-xs">
          <Field id={`${id}-answer`} label="Answer (for the key)">
            <select id={`${id}-answer`} className={inputCls} value={q.answer} onChange={(e) => onChange({ ...q, answer: e.target.value })}>
              <option value="">Choose…</option>
              <option value="True">True</option>
              <option value="False">False</option>
            </select>
          </Field>
        </div>
      )}
      {(q.type === 'short' || q.type === 'blank') && (
        <Field id={`${id}-answer`} label="Answer (for the key)">
          <input id={`${id}-answer`} className={inputCls} maxLength={MAX.answer} value={q.answer} onChange={(e) => onChange({ ...q, answer: e.target.value })} />
        </Field>
      )}
      <button type="button" className={`${btnRemove} w-fit`} onClick={onRemove}>
        Remove question {i + 1}
      </button>
    </fieldset>
  );
}

export function LessonPlanTool() {
  const [lesson, setLesson] = useState<Lesson>(blankLesson);
  const [parts, setParts] = useState<Record<PhaseId, number>>({ ...PHASE_PARTS });
  const [isExample, setIsExample] = useState(false);
  const [msg, setMsg] = useState('');
  const [wsBusy, setWsBusy] = useState(false);
  const [wsMsg, setWsMsg] = useState('');
  const today = useToday();
  const { profile } = useSchoolProfile();
  const { print, portal } = usePrint();

  // A lesson saved earlier in this browser opens where the teacher left it.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const saved = cleanLesson(JSON.parse(raw));
        setLesson(saved);
        setParts(partsOf(saved));
      }
    } catch {
      /* nothing saved, or storage is off */
    }
  }, []);

  const load = (l: Lesson, example: boolean) => {
    setLesson(l);
    setParts(partsOf(l));
    setIsExample(example);
  };
  const update = (patch: Partial<Lesson>) => {
    setLesson((l) => ({ ...l, ...patch }));
    setIsExample(false);
  };

  function setPeriod(v: string) {
    const next = { ...lesson, period: v };
    const p = periodMinutes(next);
    // A valid period re-splits the phases in the teacher's own balance.
    update(p === null ? { period: v } : { period: v, phases: phasesFromMinutes(splitPeriod(p, parts), lesson.phases) });
  }

  function setMinutes(id: PhaseId, v: string) {
    const phases = balancePhases({ ...lesson.phases, [id]: { ...lesson.phases[id], minutes: v } }, periodMinutes(lesson), id);
    const m = phaseMinutes(phases);
    if (m && Object.values(m).some((x) => x > 0)) setParts(m);
    update({ phases });
  }

  function resplit() {
    const p = periodMinutes(lesson);
    if (p === null) return;
    setParts({ ...PHASE_PARTS });
    update({ phases: phasesFromMinutes(splitPeriod(p), lesson.phases) });
  }

  function save() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(lesson));
      setMsg('Lesson saved in this browser only.');
    } catch {
      setMsg('This browser does not allow saving.');
    }
  }

  function forget() {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* nothing saved */
    }
    setMsg('Saved lesson removed from this browser.');
  }

  const errors = useMemo(() => lessonErrors(lesson), [lesson]);
  const report = useMemo(() => (errors.length ? null : withSchool(lessonReport(lesson), profile)), [errors, lesson, profile]);
  const wsErrors = useMemo(() => worksheetErrors(lesson), [lesson]);
  const ws = useMemo(() => worksheetOf(lesson), [lesson]);
  // The same school header as the plan, for the worksheet.
  const school = useMemo(() => withSchool({ title: '', sections: [], assumptions: [], disclaimer: '' }, profile).school, [profile]);
  const worksheetReady = wsErrors.length === 0 && lesson.topic.trim().length > 0;
  const total = phaseTotal(lesson.phases);
  const period = periodMinutes(lesson);

  async function worksheetPdfDownload() {
    setWsBusy(true);
    setWsMsg('');
    try {
      const { worksheetPdf } = await import('@/lib/pdf/worksheet-canvas');
      const blob = await worksheetPdf(ws, school);
      const name = safeFilename(`Worksheet ${lesson.topic}`, 'pdf');
      const shared = window.matchMedia('(pointer: coarse)').matches && (await shareFile(blob, name, ws.title));
      if (!shared) downloadBlob(blob, name);
      setWsMsg('Worksheet PDF ready: the questions, then the answer key on its own page.');
    } catch (e) {
      setWsMsg((e as Error).message || 'The PDF could not be made in this browser. Try Print worksheet and choose “Save as PDF”.');
    } finally {
      setWsBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <SchoolProfilePanel compact />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnQuiet} onClick={() => load(clone(LESSON_EXAMPLE), true)}>
          <Icon name="sparkle" className="h-4 w-4" /> Try an example
        </button>
        <button type="button" className={btnQuiet} onClick={() => load(blankLesson(), false)}>
          New lesson
        </button>
        <button type="button" className={btnQuiet} onClick={save}>
          <Icon name="check" className="h-4 w-4" /> Save lesson in this browser
        </button>
        <button type="button" className={btnQuiet} onClick={forget}>
          Clear saved lesson
        </button>
        <span role="status" className="text-sm font-semibold text-emerald-text">
          {msg}
        </span>
      </div>
      {isExample && <p className="rounded-xl border border-amber bg-white p-3 text-sm font-semibold text-amber-text">Example lesson. Change anything to make it your own.</p>}

      <form className="flex min-w-0 flex-col gap-6" onSubmit={(e) => e.preventDefault()} noValidate aria-label="Lesson details">
        <section className={panel} aria-labelledby="lp-step-1">
          <h2 id="lp-step-1" className={sectionTitle}>
            1. The lesson
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="lp-class" label="Class">
              <input id="lp-class" className={inputCls} maxLength={MAX.className} value={lesson.className} onChange={(e) => update({ className: e.target.value })} />
            </Field>
            <Field id="lp-subject" label="Subject">
              <input id="lp-subject" className={inputCls} maxLength={MAX.subject} value={lesson.subject} onChange={(e) => update({ subject: e.target.value })} />
            </Field>
            <Field id="lp-date" label="Date (optional)">
              <input id="lp-date" type="date" className={inputCls} value={lesson.date} onChange={(e) => update({ date: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field id="lp-topic" label="Topic">
                <input id="lp-topic" className={inputCls} maxLength={MAX.topic} value={lesson.topic} onChange={(e) => update({ topic: e.target.value })} />
              </Field>
            </div>
            <Field id="lp-period" label="Period length (minutes)">
              <input
                id="lp-period"
                type="number"
                inputMode="numeric"
                min={LIMITS.minPeriod}
                max={LIMITS.maxPeriod}
                className={inputCls}
                value={lesson.period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </Field>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-bold text-slate">Learning objectives: by the end of the lesson, students can…</legend>
            {lesson.objectives.map((o, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_44px] items-end gap-2">
                <Field id={`lp-obj${i}`} label={`Objective ${i + 1}`}>
                  <input id={`lp-obj${i}`} className={inputCls} maxLength={MAX.objective} value={o} onChange={(e) => update({ objectives: lesson.objectives.map((x, j) => (j === i ? e.target.value : x)) })} />
                </Field>
                <button type="button" aria-label={`Remove objective ${i + 1}`} className={removeCls} disabled={lesson.objectives.length <= 1} onClick={() => update({ objectives: lesson.objectives.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className={`${btnQuiet} w-fit`} disabled={lesson.objectives.length >= LIMITS.objectives} onClick={() => update({ objectives: [...lesson.objectives, ''] })}>
              + Add objective
            </button>
            <p className="text-xs text-slate/70">One to {LIMITS.objectives} objectives.</p>
          </fieldset>
          <Field id="lp-materials" label="Materials (optional)">
            <textarea id="lp-materials" className={areaCls} rows={2} maxLength={MAX.materials} value={lesson.materials} onChange={(e) => update({ materials: e.target.value })} />
          </Field>
        </section>

        <section className={panel} aria-labelledby="lp-step-2">
          <h2 id="lp-step-2" className={sectionTitle}>
            2. Timings
          </h2>
          <p className="text-sm text-slate/70">Change any phase and the review takes up the difference, so the minutes always add up to the period.</p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {PHASES.map((p) => (
              <fieldset key={p.id} className="flex flex-col gap-3 rounded-2xl border border-slate/10 p-4">
                <legend className="px-1 text-sm font-bold text-slate">{p.label}</legend>
                <div className="max-w-[10rem]">
                  <Field id={`lp-${p.id}-min`} label="Minutes">
                    <input id={`lp-${p.id}-min`} type="number" inputMode="numeric" min={0} className={inputCls} value={lesson.phases[p.id].minutes} onChange={(e) => setMinutes(p.id, e.target.value)} />
                  </Field>
                </div>
                <Field id={`lp-${p.id}-act`} label="Activity" help={p.hint}>
                  <textarea
                    id={`lp-${p.id}-act`}
                    className={areaCls}
                    rows={3}
                    maxLength={MAX.activity}
                    aria-describedby={`lp-${p.id}-act-help`}
                    value={lesson.phases[p.id].activity}
                    onChange={(e) => update({ phases: { ...lesson.phases, [p.id]: { ...lesson.phases[p.id], activity: e.target.value } } })}
                  />
                </Field>
              </fieldset>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p aria-live="polite" className={`text-sm font-semibold ${total !== null && period !== null && total === period ? 'text-emerald-text' : 'text-red-800'}`}>
              {total === null ? 'Every phase needs whole minutes.' : period === null ? `The phases add up to ${total} minutes.` : `The phases add up to ${total} of ${period} minutes.`}
            </p>
            <button type="button" className={btnQuiet} disabled={period === null} onClick={resplit}>
              Split the period again
            </button>
          </div>
        </section>

        <section className={panel} aria-labelledby="lp-step-3">
          <h2 id="lp-step-3" className={sectionTitle}>
            3. Questions and homework
          </h2>
          <p className="text-sm text-slate/70">
            Short answer, fill in the blank, multiple choice with up to four options, or true or false, each with its answer for the key. They become the worksheet
            and the checks for understanding in the plan.
          </p>
          {lesson.questions.map((q, i) => (
            <QuestionEditor
              key={i}
              q={q}
              i={i}
              onChange={(nq) => update({ questions: lesson.questions.map((x, j) => (j === i ? nq : x)) })}
              onRemove={() => update({ questions: lesson.questions.filter((_, j) => j !== i) })}
            />
          ))}
          <button type="button" className={`${btnQuiet} w-fit`} disabled={lesson.questions.length >= LIMITS.questions} onClick={() => update({ questions: [...lesson.questions, blankQuestion()] })}>
            + Add question
          </button>
          <Field id="lp-homework" label="Homework (optional)">
            <textarea id="lp-homework" className={areaCls} rows={2} maxLength={MAX.homework} value={lesson.homework} onChange={(e) => update({ homework: e.target.value })} />
          </Field>
        </section>
      </form>
      <p className="flex items-start gap-2 text-sm text-slate/70">
        <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" /> Runs in your browser. Nothing you type is sent to NetCyberAI. The lesson is kept in this browser only
        if you save it.
      </p>

      {/* Only the short status above each output is live, so screen readers
          hear "ready" or what is missing, not the whole plan on every key. */}
      <section className="flex min-w-0 flex-col gap-4" aria-labelledby="lp-plan">
        <h2 id="lp-plan" className="text-2xl font-extrabold text-slate">
          Lesson plan
        </h2>
        <div aria-live="polite">
          {report ? (
            <p className="text-sm font-semibold text-emerald-text">The plan is ready. Download it as a PDF or CSV, or print it.</p>
          ) : (
            <div className="rounded-3xl border border-slate/10 bg-white p-6">
              <p className="font-bold text-slate">To see the plan, fill in:</p>
              <ul className="mt-2 list-disc pl-5 text-slate">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {report && (
          <>
            <ReportActions report={report} lang="en" fileBase={`Lesson plan ${lesson.topic}`} rulesUpdated={RULES_UPDATED} sourcePath={PATH} />
            <ReportView report={report} headingLevel={3} meta={{ generatedOn: today, rulesUpdated: RULES_UPDATED, rulesLabel: UI.lastUpdated.en, assumptionsLabel: UI.assumptions.en }} />
          </>
        )}
      </section>

      <section className="flex min-w-0 flex-col gap-4" aria-labelledby="lp-ws">
        <h2 id="lp-ws" className="text-2xl font-extrabold text-slate">
          Worksheet
        </h2>
        <div aria-live="polite">
          {worksheetReady ? (
            <p className="text-sm font-semibold text-emerald-text">The worksheet is ready, with the answer key on a page of its own.</p>
          ) : (
            <div className="rounded-3xl border border-slate/10 bg-white p-6">
              <p className="font-bold text-slate">To see the worksheet, fill in:</p>
              <ul className="mt-2 list-disc pl-5 text-slate">
                {[...(lesson.topic.trim() ? [] : ['Type the topic.']), ...wsErrors].map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {worksheetReady && (
          <>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnSolid} disabled={wsBusy} onClick={() => void worksheetPdfDownload()}>
                <Icon name="download" className="h-4 w-4" /> {wsBusy ? 'Making PDF…' : 'Download worksheet PDF'}
              </button>
              <button type="button" className={btnLine} onClick={() => print(<WorksheetView ws={ws} school={school} forPrint />)}>
                <Icon name="reports" className="h-4 w-4" /> Print worksheet
              </button>
            </div>
            <p role="status" className="text-sm font-semibold text-emerald-text empty:hidden">
              {wsMsg}
            </p>
            <WorksheetView ws={ws} school={school} />
          </>
        )}
      </section>
      {portal}
    </div>
  );
}
