'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FamilyOnlineQuestion, FamilyOnlineSitting, FamilyOnlineTest, OnlineAnswer, OptionKey } from '@/lib/contracts/marking';
import { fill, type Words } from '@/lib/family/fill';
import { FamIcon } from '../FamIcon';
import { schoolLang, SchoolText } from '../SchoolText';
import { clockWords, heldFrom, markOf, numberAnswer, SaveQueue, secondsLeft, type Held, type SaveItem, type SendResult } from './sitting';
import { sameInkOnBothSides } from '@/lib/family/day-text';

// Sitting a school's online test in child mode (AQ-4, C365; docs/36 §1.3). Start: the rules and the time. Then one
// question at a time, a palette (answered, not answered, marked to look at again), every answer saved as it is given
// (a queue that tries again through a brief loss of internet, "Saving…"), a countdown from the server's deadline, full
// screen asked for, and each time the screen is left told to the school. Submit with a confirmation; when the time
// runs out, what was saved goes in. Done: the school checks it, and the result comes when the school publishes it.
// No camera and no microphone. The server alone decides what is kept and when time is up.

type Phase = 'start' | 'starting' | 'sitting' | 'confirm' | 'sending' | 'done' | 'time_up' | 'not_yet' | 'closed' | 'gone';
const BTN = 'fam-press flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-5 py-2 text-base font-extrabold';
const CTA = `${BTN} fam-cta bg-saffron text-ink`;
const PLAIN = `${BTN} bg-white text-ink ring-1 ring-ink/25 hover:bg-off-white`;
const TEXT_MAX = 4000;
const NUMBER_SAVE_MS = 600;
const TEXT_SAVE_MS = 900;

const dateTime = (iso: string, lang: string) =>
  sameInkOnBothSides(new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)));

// `keepalive`: sent even as the page is hidden or closed (leaving the test screen).
async function post(url: string, body: unknown, keepalive = false): Promise<{ status: number; body: Record<string, unknown> | null }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', keepalive });
    return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
  } catch {
    return { status: 0, body: null };
  }
}

export function TestSitting({ w, lang, test, testId }: { w: Words; lang: string; test: FamilyOnlineTest | null; testId: string }) {
  const base = `/api/family/tests/${testId}`;
  const [phase, setPhase] = useState<Phase>(!test ? 'gone' : test.state === 'done' ? 'done' : 'start');
  const [sitting, setSitting] = useState<FamilyOnlineSitting | null>(null);
  const [held, setHeld] = useState<Record<string, Held>>({});
  const [at, setAt] = useState(0);
  const [left, setLeft] = useState<number | null>(null);
  const [save, setSave] = useState<'idle' | 'saving' | 'offline'>('idle');
  const [badQ, setBadQ] = useState<string | null>(null);
  const [leftNote, setLeftNote] = useState(false);
  const [full, setFull] = useState(false);
  const [problem, setProblem] = useState(false);
  const skew = useRef(0);
  const queue = useRef<SaveQueue | null>(null);
  const leaves = useRef(0);
  const ended = useRef(false);
  // The open question's answer still being typed: kept at once before submitting.
  const keepTyped = useRef<(() => void) | null>(null);
  const attemptId = sitting?.attemptId ?? null;
  const questions = useMemo(() => sitting?.questions ?? [], [sitting]);

  // ---- ending -------------------------------------------------------------------------------------------------------
  const end = useCallback((how: 'done' | 'time_up') => {
    ended.current = true;
    queue.current?.stop();
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    setPhase(how);
  }, []);

  // ---- starting (or coming back to the attempt) --------------------------------------------------------------------
  const start = async () => {
    setPhase('starting');
    setProblem(false);
    // Asked from the child's own tap, as browsers require; refused or not supported, the test goes on.
    void document.documentElement.requestFullscreen?.().catch(() => {});
    const phoneBefore = Date.now();
    const r = await post(`${base}/start`, {});
    if (r.status === 0 || r.status >= 500) {
      setProblem(true);
      return setPhase('start');
    }
    const s = r.body as unknown as FamilyOnlineSitting | null;
    if (r.status === 404 || !s) return setPhase('gone');
    skew.current = new Date(s.serverNow).getTime() - Math.round((phoneBefore + Date.now()) / 2);
    if (s.outcome === 'done') return end('done');
    if (s.outcome === 'not_yet' || s.outcome === 'closed') return setPhase(s.outcome);
    if (!s.attemptId || !s.deadlineAt || !s.questions.length) return setPhase('gone');
    setSitting(s);
    setHeld(heldFrom(s.questions));
    setAt(0);
    setPhase('sitting');
  };

  // ---- the save queue ------------------------------------------------------------------------------------------------
  useEffect(() => {
    if (!attemptId) return;
    const send = async (item: SaveItem): Promise<SendResult> => {
      const r = await post(`${base}/answer`, { attemptId, ...item });
      if (r.status === 0 || r.status >= 500) return 'network';
      if (r.status === 200) return 'saved';
      const code = r.body?.error;
      if (code === 'closed') return 'closed';
      if (code === 'bad_answer' || r.status === 400) return 'bad_answer';
      return 'not_found';
    };
    const q = new SaveQueue(send, (e) => {
      if (e.kind === 'saving') setSave('saving');
      else if (e.kind === 'offline') setSave('offline');
      else if (e.kind === 'idle') setSave('idle');
      else if (e.kind === 'bad_answer') setBadQ(e.questionId);
      else if (e.kind === 'saved') setBadQ((b) => (b === e.questionId ? null : b));
      else if (e.kind === 'closed') end('time_up');
      else if (e.kind === 'not_found') setPhase('gone');
    });
    queue.current = q;
    const online = () => q.wake();
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('online', online);
      q.stop();
    };
  }, [attemptId, base, end]);

  // Each change is one more save of its question (its count goes up by one), kept on the phone and queued at once.
  const heldNow = useRef(held);
  heldNow.current = held;
  const give = useCallback((questionId: string, change: Partial<Pick<Held, 'answer' | 'flagged'>>) => {
    if (ended.current) return;
    const before = heldNow.current[questionId] ?? { answer: null, flagged: false, seq: 0 };
    const next: Held = { ...before, ...change, seq: before.seq + 1 };
    heldNow.current = { ...heldNow.current, [questionId]: next };
    setHeld(heldNow.current);
    queue.current?.put({ questionId, answer: next.answer, flagged: next.flagged, seq: next.seq });
  }, []);

  // ---- the clock, from the server's deadline -----------------------------------------------------------------------
  const sendSubmit = useCallback(
    async (how: 'done' | 'time_up') => {
      if (!attemptId || ended.current) return;
      keepTyped.current?.();
      await queue.current?.flush(how === 'time_up' ? 2000 : 8000);
      for (let i = 0; i < 6; i++) {
        const r = await post(`${base}/submit`, { attemptId });
        if (r.status === 200 || r.status === 404) break;
        await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
      }
      end(how);
    },
    [attemptId, base, end]
  );
  useEffect(() => {
    if (phase !== 'sitting' && phase !== 'confirm') return;
    const deadline = sitting?.deadlineAt;
    if (!deadline) return;
    const tick = () => {
      const s = secondsLeft(deadline, skew.current);
      setLeft(s);
      if (s === 0) {
        setPhase('sending');
        void sendSubmit('time_up');
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [phase, sitting, sendSubmit]);

  // ---- leaving the test screen ---------------------------------------------------------------------------------------
  useEffect(() => {
    if (!attemptId || (phase !== 'sitting' && phase !== 'confirm')) return;
    let sending = false;
    const sendLeaves = async () => {
      if (sending) return;
      sending = true;
      while (leaves.current > 0 && !ended.current) {
        const r = await post(`${base}/left`, { attemptId }, true);
        if (r.status === 0 || r.status >= 500) {
          await new Promise((res) => setTimeout(res, 3000));
          continue;
        }
        leaves.current -= 1;
        if (r.status !== 200) leaves.current = 0;
      }
      sending = false;
    };
    const seen = () => {
      if (document.visibilityState === 'hidden') {
        leaves.current += 1;
        void sendLeaves();
      } else {
        setLeftNote(true);
        void sendLeaves();
      }
    };
    const fs = () => setFull(!!document.fullscreenElement);
    fs();
    document.addEventListener('visibilitychange', seen);
    document.addEventListener('fullscreenchange', fs);
    const online = () => void sendLeaves();
    window.addEventListener('online', online);
    return () => {
      document.removeEventListener('visibilitychange', seen);
      document.removeEventListener('fullscreenchange', fs);
      window.removeEventListener('online', online);
    };
  }, [attemptId, phase, base]);

  // Answers still on their way: the browser asks before the page is closed.
  useEffect(() => {
    if (save === 'idle') return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [save]);

  // ---- the screens ---------------------------------------------------------------------------------------------------
  const backLink = (
    <Link href="/family/study" className={PLAIN}>
      <FamIcon name="back" className="h-5 w-5" />
      {w['fam.test.backToStudy']}
    </Link>
  );
  const card = 'fam-card flex flex-col gap-4 bg-white p-5';

  if (phase === 'gone' || phase === 'closed' || phase === 'not_yet') {
    const text = phase === 'gone' ? w['fam.test.gone'] : phase === 'closed' ? w['fam.test.closedNow'] : fill(w['fam.test.notYet'], { when: test ? dateTime(test.opensAt, lang) : '' });
    return (
      <section data-test-phase={phase} className={card}>
        <p role="status" className="text-base font-semibold text-slate">{text}</p>
        {backLink}
      </section>
    );
  }
  if (phase === 'done' || phase === 'time_up') {
    return (
      <section data-test-phase={phase} className={card} aria-labelledby="test-done-title">
        <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-text text-white shadow-md">
          <FamIcon name="check" className="h-8 w-8" />
        </span>
        <h2 id="test-done-title" className="text-xl font-extrabold text-slate">{w['fam.test.doneTitle']}</h2>
        {phase === 'time_up' && <p role="status" className="text-base font-semibold text-slate">{w['fam.test.timeUp']}</p>}
        <p className="text-base text-slate">{w['fam.test.doneLead']}</p>
        {backLink}
      </section>
    );
  }
  if (phase === 'start' || phase === 'starting' || !sitting) {
    const resumed = test?.state === 'in_progress';
    return (
      <section data-test-phase="start" className={card} aria-labelledby="test-start-title">
        {test && (
          <p className="text-base font-bold text-slate">
            <SchoolText text={test.subject} /> · <SchoolText text={test.exam} />
          </p>
        )}
        <h2 id="test-start-title" className="text-xl font-extrabold text-slate">{w['fam.test.startTitle']}</h2>
        {test && (
          <p className="text-base font-semibold text-slate">
            {fill(w['fam.test.minutes'], { n: test.minutes })} · {fill(w['fam.test.questions'], { n: test.questions })}
          </p>
        )}
        <ul className="flex flex-col gap-2 text-base text-slate">
          {[w['fam.test.rule.once'], fill(w['fam.test.rule.time'], { n: test?.minutes ?? '' }), w['fam.test.rule.saved'], w['fam.test.rule.leave'], w['fam.test.rule.alone']].map((line, i) => (
            <li key={i} className="flex items-start gap-2">
              <FamIcon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-text" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        {test?.state === 'upcoming' && <p className="text-base text-slate">{fill(w['fam.test.notYet'], { when: dateTime(test.opensAt, lang) })}</p>}
        {problem && (
          <p role="alert" className="flex items-center gap-2 text-base font-semibold text-slate">
            <FamIcon name="offline" className="h-5 w-5 shrink-0" />
            {w['fam.test.offline']}
          </p>
        )}
        <button type="button" data-test-start className={CTA} disabled={phase === 'starting' || test?.state === 'upcoming'} onClick={() => void start()}>
          {resumed ? w['fam.test.continue'] : problem ? w['fam.test.tryAgain'] : w['fam.test.start']}
        </button>
        {backLink}
      </section>
    );
  }

  const q = questions[Math.min(at, questions.length - 1)];
  const h = held[q.questionId] ?? { answer: null, flagged: false, seq: 0 };
  const answered = questions.filter((x) => markOf(held[x.questionId]) === 'answered').length;
  const low = left !== null && left <= 60;

  return (
    <div data-test-phase={phase} className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 bg-off-white/95 px-4 py-2 backdrop-blur" role="group" aria-label={w['fam.test.timeLeft']}>
        <p className={`text-lg font-black tabular-nums ${low ? 'text-red-800' : 'text-slate'}`} data-test-clock aria-live={low ? 'polite' : 'off'}>
          <span className="sr-only">{w['fam.test.timeLeft']}: </span>
          {left === null ? '' : clockWords(left)}
        </p>
        <p data-test-save={save} aria-live="polite" className="flex items-center gap-1 text-sm font-semibold text-slate">
          {save === 'offline' ? (
            <>
              <FamIcon name="offline" className="h-4 w-4" />
              {w['fam.test.offline']}
            </>
          ) : save === 'saving' ? (
            w['fam.test.saving']
          ) : (
            <>
              <FamIcon name="check" className="h-4 w-4 text-emerald-text" />
              {w['fam.test.saved']}
            </>
          )}
        </p>
        {!full && (
          <button type="button" className="fam-press min-h-[44px] rounded-xl px-3 text-sm font-bold text-ink ring-1 ring-ink/25" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => {})}>
            {w['fam.test.fullscreen']}
          </button>
        )}
      </div>

      {leftNote && (
        <p role="status" className="fam-card flex items-start gap-2 bg-sunshine/30 p-3 text-sm font-semibold text-slate">
          {w['fam.test.leftNote']}
          <button type="button" className="ml-auto flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-ink" onClick={() => setLeftNote(false)} aria-label={w['fam.test.keepGoing']}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </p>
      )}

      <QuestionCard key={q.questionId} w={w} q={q} index={at} count={questions.length} held={h} bad={badQ === q.questionId} keepRef={keepTyped} onGive={(change) => give(q.questionId, change)} />

      <div className="flex gap-2">
        <button type="button" className={`${PLAIN} flex-1`} disabled={at === 0} onClick={() => setAt(at - 1)}>
          <FamIcon name="back" className="h-5 w-5" />
          {w['fam.test.prev']}
        </button>
        {at < questions.length - 1 ? (
          <button type="button" data-test-next className={`${CTA} flex-1`} onClick={() => setAt(at + 1)}>
            {w['fam.test.next']}
            <FamIcon name="next" className="h-5 w-5" />
          </button>
        ) : (
          <button type="button" data-test-submit className={`${CTA} flex-1`} onClick={() => {
            keepTyped.current?.();
            setPhase('confirm');
          }}>
            {w['fam.test.submit']}
          </button>
        )}
      </div>

      <nav aria-label={w['fam.test.palette']} className="fam-card flex flex-col gap-3 bg-white p-4" data-test-palette>
        <h2 className="text-base font-extrabold text-slate">{w['fam.test.palette']}</h2>
        <ol className="grid grid-cols-6 gap-2 sm:grid-cols-8">
          {questions.map((x, i) => {
            const mark = markOf(held[x.questionId]);
            const flagged = held[x.questionId]?.flagged;
            return (
              <li key={x.questionId}>
                <button
                  type="button"
                  data-palette={mark}
                  data-flagged={flagged ? 'yes' : undefined}
                  aria-current={i === at ? 'step' : undefined}
                  aria-label={`${fill(w['fam.test.go'], { n: i + 1 })}: ${mark === 'answered' ? w['fam.test.legend.answered'] : w['fam.test.legend.notAnswered']}${flagged ? `, ${w['fam.test.legend.review']}` : ''}`}
                  onClick={() => setAt(i)}
                  className={`fam-press relative flex h-11 w-full min-w-[44px] items-center justify-center rounded-xl text-base font-black ${
                    mark === 'answered' ? 'bg-emerald-text text-white' : 'bg-white text-slate ring-1 ring-slate/30'
                  } ${i === at ? 'outline outline-2 outline-offset-2 outline-ink' : ''}`}
                >
                  {i + 1}
                  {flagged && <span aria-hidden="true" className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-sunshine ring-2 ring-white" />}
                </button>
              </li>
            );
          })}
        </ol>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate">
          <li className="flex items-center gap-2"><span aria-hidden="true" className="h-4 w-4 rounded bg-emerald-text" />{w['fam.test.legend.answered']}</li>
          <li className="flex items-center gap-2"><span aria-hidden="true" className="h-4 w-4 rounded bg-white ring-1 ring-slate/30" />{w['fam.test.legend.notAnswered']}</li>
          <li className="flex items-center gap-2"><span aria-hidden="true" className="h-3.5 w-3.5 rounded-full bg-sunshine" />{w['fam.test.legend.review']}</li>
        </ul>
        <button type="button" data-test-submit-open className={PLAIN} onClick={() => {
            keepTyped.current?.();
            setPhase('confirm');
          }}>
          {w['fam.test.submit']}
        </button>
      </nav>

      {(phase === 'confirm' || phase === 'sending') && (
        <div role="dialog" aria-modal="true" aria-labelledby="test-submit-title" data-test-confirm className="fixed inset-0 z-20 flex items-end justify-center bg-ink/60 p-4 sm:items-center">
          <div className="fam-card flex w-full max-w-md flex-col gap-3 bg-white p-5">
            <h2 id="test-submit-title" className="text-lg font-extrabold text-slate">{w['fam.test.submitSure']}</h2>
            <p className="text-base text-slate">{fill(w['fam.test.submitCount'], { n: answered, all: questions.length })}</p>
            {save !== 'idle' && <p role="status" className="text-base font-semibold text-slate">{w['fam.test.submitWait']}</p>}
            <button
              type="button"
              data-test-submit-yes
              className={CTA}
              disabled={phase === 'sending'}
              onClick={() => {
                setPhase('sending');
                void sendSubmit('done');
              }}
            >
              {phase === 'sending' ? w['fam.test.saving'] : w['fam.test.submitYes']}
            </button>
            <button type="button" className={PLAIN} disabled={phase === 'sending'} onClick={() => setPhase('sitting')} autoFocus>
              {w['fam.test.keepGoing']}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// One question: its number, section, marks and internal choice, its words, and the way it is answered.
function QuestionCard({
  w,
  q,
  index,
  count,
  held,
  bad,
  keepRef,
  onGive,
}: {
  w: Words;
  q: FamilyOnlineQuestion;
  index: number;
  count: number;
  held: Held;
  bad: boolean;
  keepRef: { current: (() => void) | null };
  onGive: (change: Partial<Pick<Held, 'answer' | 'flagged'>>) => void;
}) {
  const keys = held.answer && 'keys' in held.answer ? held.answer.keys : [];
  const [numberText, setNumberText] = useState(held.answer && 'value' in held.answer ? String(held.answer.value) : '');
  const [text, setText] = useState(held.answer && 'text' in held.answer ? held.answer.text : '');
  const [numberBad, setNumberBad] = useState(false);
  const timer = useRef<number | null>(null);
  const later = (ms: number, fn: () => void) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, ms);
  };
  // A number or words are kept a moment after the last key; leaving the question keeps them at once.
  const pendingKeep = useRef<(() => void) | null>(null);
  const keepSoon = (ms: number, keep: () => void) => {
    const once = () => {
      pendingKeep.current = null;
      keep();
    };
    pendingKeep.current = once;
    later(ms, once);
  };
  useEffect(() => {
    keepRef.current = () => pendingKeep.current?.();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      pendingKeep.current?.();
      keepRef.current = null;
    };
  }, [keepRef]);

  const choose = (key: OptionKey) => {
    const next = q.multi ? (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]) : [key];
    onGive({ answer: next.length ? ({ keys: next } as OnlineAnswer) : null });
  };
  const marks = q.maxMarks === 1 ? w['fam.test.markOne'] : fill(w['fam.test.marks'], { n: q.maxMarks });
  const letter = (i: number) => String.fromCharCode(65 + i);
  const name = `q-${q.questionId}`;

  return (
    <section data-test-question={q.n} className="fam-card flex flex-col gap-4 bg-white p-5" aria-labelledby={`${name}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-slate">
        <span>{fill(w['fam.test.question'], { n: index + 1, all: count })}</span>
        <span className="flex flex-wrap gap-2">
          {q.section && <span className="rounded-full bg-off-white px-3 py-1">{fill(w['fam.test.section'], { s: q.section })}</span>}
          <span className="rounded-full bg-off-white px-3 py-1">{marks}</span>
        </span>
      </div>
      {q.choiceGroup && q.groupCount !== null && <p className="text-sm font-semibold text-slate">{fill(w['fam.test.group'], { n: q.groupCount, group: q.choiceGroup })}</p>}
      <h2 id={`${name}-title`} className="whitespace-pre-wrap break-words text-lg font-bold text-slate">
        <span className="mr-1">{q.label}.</span>
        <span lang={schoolLang(q.prompt)}>{q.prompt}</span>
      </h2>

      {q.input === 'choice' && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-slate">{q.multi ? w['fam.test.chooseAll'] : w['fam.test.chooseOne']}</legend>
          {q.options.map((o, i) => {
            const on = keys.includes(o.key);
            return (
              <label key={o.key} className={`fam-press flex min-h-[52px] cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 text-base text-slate ring-1 ${on ? 'bg-lesson-sky ring-2 ring-ink' : 'bg-white ring-slate/20'}`}>
                <input type={q.multi ? 'checkbox' : 'radio'} name={name} checked={on} onChange={() => choose(o.key)} className="h-5 w-5 shrink-0 accent-saffron-deep" />
                <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-black ${on ? 'bg-ink text-white' : 'bg-off-white text-slate'}`}>
                  {on ? <FamIcon name="check" className="h-5 w-5" /> : letter(i)}
                </span>
                <span lang={schoolLang(o.text)} className="min-w-0 break-words">
                  {o.text}
                </span>
              </label>
            );
          })}
          {keys.length > 0 && (
            <button type="button" className="min-h-[44px] self-start rounded-xl px-2 text-sm font-bold text-ink" onClick={() => onGive({ answer: null })}>
              {w['fam.test.clear']}
            </button>
          )}
        </fieldset>
      )}

      {q.input === 'number' && (
        <label className="flex flex-col gap-2 text-sm font-semibold text-slate">
          {w['fam.test.number']}
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={numberText}
            aria-invalid={numberBad || undefined}
            onChange={(e) => {
              const v = e.target.value.slice(0, 40);
              setNumberText(v);
              const a = numberAnswer(v);
              setNumberBad(a === 'bad');
              if (a !== 'bad') keepSoon(NUMBER_SAVE_MS, () => onGive({ answer: a }));
            }}
            className="min-h-[52px] rounded-2xl bg-white px-4 text-lg text-slate ring-1 ring-slate/30 focus:ring-2 focus:ring-ink"
          />
        </label>
      )}

      {q.input === 'text' && (
        <label className="flex flex-col gap-2 text-sm font-semibold text-slate">
          {w['fam.test.text']}
          <textarea
            value={text}
            maxLength={TEXT_MAX}
            rows={6}
            onChange={(e) => {
              const v = e.target.value;
              setText(v);
              keepSoon(TEXT_SAVE_MS, () => onGive({ answer: v.trim() ? { text: v } : null }));
            }}
            className="min-h-[160px] rounded-2xl bg-white p-3 text-base text-slate ring-1 ring-slate/30 focus:ring-2 focus:ring-ink"
          />
          <span className="text-xs font-normal text-slate">{fill(w['fam.test.textLeft'], { n: TEXT_MAX - text.length })}</span>
        </label>
      )}

      {bad && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {w['fam.test.notSaved']}
        </p>
      )}

      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-base font-semibold text-slate">
        <input type="checkbox" checked={held.flagged} onChange={(e) => onGive({ flagged: e.target.checked })} className="h-5 w-5 accent-saffron-deep" />
        {w['fam.test.review']}
      </label>
    </section>
  );
}
