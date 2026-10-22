'use client';
import { Picture } from '../Picture';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { colors } from '@/lib/design-tokens';
import type { Bi, ChildCheckItem, Lesson, Track } from '@/lib/family/english/course';
import { fill, type Words } from '@/lib/family/fill';
import { familyApi } from '@/components/family/client';
import { Pic, picName } from './Pictures';
import { speak, stopSpeaking } from './speech';
import { StepView } from './Steps';
import { TRACK_THEME } from './theme';

// A lesson from start to finish (docs/family-app/12 §4): the warm-up, the steps on full-screen cards with a progress
// bar, the check (answered here, scored on the server), and the results. Track A ends with the grown-up's "We did it!".

type LessonForChild = Omit<Lesson, 'check'> & { check: ChildCheckItem[] };
type Loaded = { track: Track; day: string; lesson: LessonForChild; warmup: ChildCheckItem[] };
type Result = {
  score: number;
  stars: number;
  passed: boolean;
  results: { key: string; correct: boolean; answer: string; why?: Bi }[];
  warmup: { key: string; correct: boolean; answer: string }[];
  next: { key: string; state: string } | null;
};

export function Burst() {
  const bits = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2;
        return { x: Math.cos(a) * (90 + (i % 3) * 30), y: Math.sin(a) * (90 + (i % 3) * 30), c: [colors.sunshine, colors.coral, colors.grape, colors.turquoise, colors.tangerine, colors.leaf][i % 6] };
      }),
    []
  );
  return (
    <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-16 motion-reduce:hidden">
      {bits.map((b, i) => (
        <span key={i} className="absolute h-3 w-3 rounded-full animate-burst" style={{ background: b.c, ['--bx' as string]: `${b.x}px`, ['--by' as string]: `${b.y}px`, animationDelay: `${(i % 4) * 40}ms` }} />
      ))}
    </div>
  );
}

function Stars({ n, total = 3 }: { n: number; total?: number }) {
  return (
    <span className="flex gap-1" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`text-4xl ${i < n ? 'animate-pop-in motion-reduce:animate-none' : 'opacity-25'}`} style={{ animationDelay: `${i * 220}ms`, animationFillMode: 'both' }}>
          <Picture e="⭐" />
        </span>
      ))}
    </span>
  );
}

// A check item: chosen or built, never marked here.
export function CheckItemView({ item, value, onChange, w, track, hindi }: { item: ChildCheckItem; value: unknown; onChange: (v: unknown) => void; w: Words; track: Track; hindi: boolean }) {
  const theme = TRACK_THEME[track];
  if (item.type === 'choose') {
    return (
      <div className="flex flex-col gap-3 rounded-3xl bg-white p-4 text-slate shadow-sm ring-1 ring-slate/10">
        <div className="flex items-center gap-3">
          {item.prompt.pic && <Pic pic={item.prompt.pic} size={40} />}
          <div className="flex flex-1 flex-col">
            <p className="text-lg font-bold text-slate"><span lang="en">{item.prompt.en}</span></p>
            {item.prompt.hi && hindi && (
              <p lang="hi" className="text-base text-slate/80">
                {item.prompt.hi}
              </p>
            )}
          </div>
          {item.prompt.say && (
            <button type="button" onClick={() => void speak(item.prompt.say as string, 'en', 0.85)} aria-label={fill(w['fam.english.listenTo'], { text: item.prompt.say })} className="min-h-[44px] min-w-[44px] rounded-full bg-white text-xl text-slate shadow-sm ring-1 ring-slate/10">
              <Picture e="🔊" />
            </button>
          )}
        </div>
        <div className={`grid gap-2 ${item.options.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {item.options.map((o, i) => (
            <button key={i} type="button" aria-label={o.text ?? picName(o.pic)} aria-pressed={value === i} onClick={() => onChange(i)} className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl p-2 shadow-sm ring-2 ${value === i ? `${theme.soft} ${theme.ring}` : 'bg-white text-slate ring-slate/10'}`}>
              {o.pic && <Pic pic={o.pic} size={40} />}
              {o.text && <span className="text-lg font-bold text-slate"><span lang="en">{o.text}</span></span>}
            </button>
          ))}
        </div>
      </div>
    );
  }
  const used = Array.isArray(value) ? (value as number[]) : [];
  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-white p-4 text-slate shadow-sm ring-1 ring-slate/10">
      <div className="flex items-center gap-3">
        <Pic pic={item.pic} size={36} />
        {item.hi && (
          <p lang="hi" className="text-lg font-bold text-slate">
            {item.hi}
          </p>
        )}
      </div>
      <div className="flex min-h-[56px] flex-wrap items-center gap-2 rounded-2xl border-2 border-dashed border-slate/20 bg-off-white p-2 text-slate">
        {used.map((i, k) => (
          <button key={k} type="button" onClick={() => onChange(used.filter((x) => x !== i))} className={`min-h-[44px] rounded-xl px-3 text-lg font-bold ${theme.button}`}>
            <span lang="en">{item.tiles[i]}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {item.tiles.map((t, i) =>
          used.includes(i) ? null : (
            <button key={i} type="button" onClick={() => onChange([...used, i])} className="min-h-[44px] rounded-xl bg-white px-3 text-lg font-bold text-slate shadow-sm ring-1 ring-slate/20">
              <span lang="en">{t}</span>
            </button>
          )
        )}
      </div>
    </div>
  );
}
// What the server gets for an item: the choice, or the sentence the tiles make.
export const answerOf = (item: ChildCheckItem, v: unknown) => (item.type === 'choose' ? v : Array.isArray(v) ? (v as number[]).map((i) => item.tiles[i]).join(' ') : '');

// `startAt` opens the lesson at a card (from ?at=, for a parent showing a step again); practice is never required.
export function LessonPlayer({ lessonKey, w, lang, startAt = 0 }: { lessonKey: string; w: Words; lang: 'en' | 'hi'; startAt?: number }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState(startAt);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [hindiOn, setHindiOn] = useState(lang === 'hi');

  useEffect(() => {
    void familyApi<Loaded>(`/api/family/english/lessons/${lessonKey}`, 'GET').then((r) => (r.ok ? setData(r.data) : setError(r.error)));
    return () => stopSpeaking();
  }, [lessonKey]);

  if (error) {
    return (
      <div className="flex flex-col gap-3 rounded-3xl bg-white p-5 text-slate shadow-sm ring-1 ring-slate/10">
        <p className="text-lg font-bold text-slate">{error === 'rest' ? w['fam.english.rest'] : error === 'locked' ? w['fam.english.locked'] : w['fam.english.error']}</p>
        <Link href="/family/english" className="min-h-[44px] self-start rounded-full bg-royal px-5 py-3 font-bold text-white">
          {w['fam.english.results.map']}
        </Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <p className="text-base text-slate">{w['fam.english.loading']}</p>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-3xl bg-slate/10 motion-reduce:animate-none" />
        ))}
      </div>
    );
  }

  const { lesson, track, warmup } = data;
  const theme = TRACK_THEME[track];
  const hindi = hindiOn || track === 'a' || track === 'b';
  const reads = track !== 'a';
  // The cards: warm-up (if any), every step, then the check (B–D) or the grown-up's tap (A).
  const pages = (warmup.length > 0 ? 1 : 0) + lesson.steps.length + 1;
  const stepIndex = at - (warmup.length > 0 ? 1 : 0);
  const onLast = at >= pages - 1;
  const checkItems = [...lesson.check];
  const allAnswered = checkItems.every((c) => answers[c.key] !== undefined && !(Array.isArray(answers[c.key]) && (answers[c.key] as unknown[]).length === 0));

  const send = async () => {
    setSending(true);
    const body = {
      day: data.day,
      done: !reads ? true : undefined,
      answers: Object.fromEntries(checkItems.map((c) => [c.key, answerOf(c, answers[c.key])])),
      warmup: Object.fromEntries(warmup.map((c) => [c.key, answerOf(c, answers[`warm:${c.key}`])])),
    };
    const r = await familyApi<Result>(`/api/family/english/lessons/${lessonKey}`, 'POST', body);
    setSending(false);
    // A failed send keeps every answer on the screen: the child sends again.
    if (r.ok) {
      setSendError(false);
      setResult(r.data);
    } else if (r.status === 0 || r.status >= 500) setSendError(true);
    else setError(r.error);
  };

  if (result) {
    const unitDone = result.passed && lesson.kind === 'review';
    return (
      <section className="relative flex flex-col items-center gap-4 rounded-3xl bg-white p-6 text-center text-slate shadow-md ring-1 ring-slate/10">
        {result.passed && <Burst />}
        <Pic pic={result.passed ? (unitDone ? '🏆' : '🎉') : '💪'} size={72} className="animate-pop-in motion-reduce:animate-none" />
        <h2 className="text-2xl font-extrabold text-slate">{result.passed ? (unitDone ? w['fam.english.results.unit'] : w['fam.english.results.done']) : w['fam.english.results.notYet']}</h2>
        {result.passed && (
          <>
            <Stars n={result.stars} />
            <p className="text-sm font-semibold text-slate/80">{w['fam.english.results.stars'].replace('{n}', String(result.stars))}</p>
          </>
        )}
        {reads && result.results.length > 0 && (
          <ul className="flex w-full flex-col gap-2 text-left">
            {result.results.map((r) => (
              <li key={r.key} className={`flex flex-col gap-1 rounded-2xl p-3 text-slate ${r.correct ? 'bg-leaf/15' : 'bg-sunshine/25'}`}>
                <span className="text-sm font-bold text-slate">
                  {r.correct ? (
                    <>
                      <Picture e="🌟" /> {w['fam.english.results.right']}
                    </>
                  ) : (
                    <>
                      <Picture e="💡" /> {w['fam.english.results.learn']}
                    </>
                  )}
                  :{' '}
                  {/[A-Za-z0-9\u0900-\u097F]/.test(r.answer) ? <span lang="en">{r.answer}</span> : <Pic pic={r.answer} size={22} />}
                </span>
                {!r.correct && r.why && (
                  <span className="text-sm text-slate">
                    <span lang="en">{r.why.en}</span>
                    {hindi && r.why.hi ? ` · ${r.why.hi}` : ''}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {result.passed && (
          <div className="w-full rounded-2xl bg-grape/10 p-4 text-left text-slate">
            <p className="text-sm font-bold uppercase tracking-wide text-slate/70"><Picture e="🏡" /> {w['fam.english.results.home']}</p>
            <p className="text-lg font-bold text-slate"><span lang="en">{lesson.home.en}</span></p>
            {lesson.home.hi && (
              <p lang="hi" className="text-base text-slate/80">
                {lesson.home.hi}
              </p>
            )}
          </div>
        )}
        <div className="flex w-full flex-wrap justify-center gap-2">
          {!result.passed && (
            <button type="button" onClick={() => { setResult(null); setAt(0); setAnswers({}); }} className={`min-h-[44px] rounded-full px-5 font-bold ${theme.button}`}>
              {w['fam.english.again']}
            </button>
          )}
          {result.passed && result.next?.state === 'open' && (
            <a href={`/family/english/lesson/${result.next.key}`} className={`flex min-h-[44px] items-center rounded-full px-5 font-bold ${theme.button}`}>
              {w['fam.english.results.next']} →
            </a>
          )}
          {result.passed && result.next?.state === 'rest' && <p className="w-full text-base font-semibold text-slate">{w['fam.english.results.tomorrow']}</p>}
          <Link href="/family/english" className="flex min-h-[44px] items-center rounded-full bg-white px-5 font-bold text-slate ring-1 ring-slate/20">
            {w['fam.english.results.map']}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link href="/family/english" aria-label={w['fam.english.close']} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white text-xl text-slate shadow-sm ring-1 ring-slate/10">
          ✕
        </Link>
        <div className="h-4 flex-1 overflow-hidden rounded-full bg-slate/10" role="progressbar" aria-valuemin={0} aria-valuemax={pages} aria-valuenow={at + 1} aria-label={lesson.title.en}>
          <div className="h-full rounded-full transition-all duration-300 motion-reduce:transition-none" style={{ width: `${((at + 1) / pages) * 100}%`, background: `linear-gradient(90deg, ${theme.light}, ${theme.hex})` }} />
        </div>
        {(track === 'c' || track === 'd') && (
          <button type="button" aria-pressed={hindiOn} onClick={() => setHindiOn(!hindiOn)} className={`min-h-[44px] rounded-full px-3 text-sm font-bold ${hindiOn ? theme.button : 'bg-white text-slate ring-1 ring-slate/20'}`}>
            {w['fam.english.showHindi']}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${theme.button}`}>{w[`fam.english.kind.${lesson.kind}`]}</span>
        <h1 className="text-lg font-extrabold leading-tight text-slate">{lang === 'hi' && lesson.title.hi ? lesson.title.hi : lesson.title.en}</h1>
      </div>
      <div key={at} className="flex flex-col gap-4 pb-24 animate-rise-in motion-reduce:animate-none">
        {at === 0 && warmup.length > 0 && (
          <>
            <h2 className="text-xl font-extrabold text-slate"><Picture e="🔁" /> {w['fam.english.warmup']}</h2>
            {warmup.map((c) => (
              <CheckItemView key={c.key} item={c} value={answers[`warm:${c.key}`]} onChange={(v) => setAnswers({ ...answers, [`warm:${c.key}`]: v })} w={w} track={track} hindi={hindi} />
            ))}
          </>
        )}
        {stepIndex >= 0 && stepIndex < lesson.steps.length && <StepView step={lesson.steps[stepIndex]} w={w} hindi={hindi} track={track} />}
        {onLast && reads && (
          <>
            <h2 className="text-xl font-extrabold text-slate"><Picture e="✍️" /> {w['fam.english.check.title']}</h2>
            <p className="text-base text-slate">{w['fam.english.check.intro']}</p>
            {checkItems.map((c, i) => (
              <div key={c.key} className="flex flex-col gap-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate/70">{w['fam.english.question'].replace('{n}', String(i + 1)).replace('{total}', String(checkItems.length))}</span>
                <CheckItemView item={c} value={answers[c.key]} onChange={(v) => setAnswers({ ...answers, [c.key]: v })} w={w} track={track} hindi={hindi} />
              </div>
            ))}
          </>
        )}
        {onLast && !reads && (
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-sunshine/20 p-6 text-center text-slate">
            <Pic pic="🤝" size={64} />
            <p className="text-base text-slate">{w['fam.english.grownupNote']}</p>
          </div>
        )}
      </div>
      {sendError && (
        <p role="alert" className="rounded-2xl bg-sunshine/30 p-3 text-base font-bold text-slate">
          {w['fam.english.error']}
        </p>
      )}
      <div className="fixed inset-x-0 bottom-[60px] z-20 flex justify-end bg-gradient-to-t from-off-white px-4 pb-3 pt-6">
        <div className="mx-auto flex w-full max-w-xl justify-end">
        {!onLast ? (
          <button type="button" onClick={() => { stopSpeaking(); setAt(at + 1); }} className={`min-h-[52px] rounded-full px-8 text-lg font-extrabold shadow-md ${theme.button}`}>
            {w['fam.english.next']} →
          </button>
        ) : (
          <button type="button" disabled={sending || (reads && !allAnswered)} onClick={() => void send()} className={`min-h-[52px] rounded-full px-8 text-lg font-extrabold shadow-md disabled:opacity-50 ${theme.button}`}>
            {reads ? (
              w['fam.english.check.send']
            ) : (
              <>
                <Picture e="🎉" /> {w['fam.english.grownup']}
              </>
            )}
          </button>
        )}
        </div>
      </div>
    </section>
  );
}
