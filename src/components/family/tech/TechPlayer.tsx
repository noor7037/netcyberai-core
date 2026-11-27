'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { speak } from '@/components/family/english/speech';
import type { Words } from '@/lib/family/fill';
import { rememberLab, rememberPass } from '@/lib/family/tech/local-progress';
import { pick, TECH_LANGS, voiceLang, type TechLang } from '@/lib/family/tech/text';
import type { FinishResult, StrandInfo, TechLesson, TechQuestion } from '@/lib/family/tech/types';
import { tw } from '@/lib/family/tech/words';
import { named, rightLine, toPlayLine, type TechPersonal } from '@/lib/family/tech/personal';
import type { VoiceMode } from '@/components/family/voice/lineVoice';
import { stopLine } from '@/components/family/voice/lineVoice';
import { SeeVisual } from './SeeVisual';
import { TechRead } from './TechRead';

const PHASES = [
  { id: 'see', icon: '👀', word: 'see' },
  { id: 'play', icon: '🕹️', word: 'play' },
  { id: 'understand', icon: '💡', word: 'understand' },
  { id: 'try', icon: '🎯', word: 'try' },
] as const;

type Phase = (typeof PHASES)[number]['id'];

function shuffled(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index).sort((left, right) => ((left * 7 + 3) % Math.max(count, 1)) - ((right * 7 + 3) % Math.max(count, 1)));
}

function matchColumns(question: TechQuestion): { lefts: unknown[]; rights: unknown[] } | null {
  const options = question.options;
  if (options && !Array.isArray(options) && typeof options === 'object' && Array.isArray((options as { left?: unknown }).left)) {
    const row = options as { left: unknown[]; right?: unknown[] };
    return { lefts: row.left, rights: row.right ?? [] };
  }
  return null;
}

function Burst() {
  const bits = Array.from({ length: 18 }, (_, index) => {
    const angle = (index / 18) * Math.PI * 2;
    return { id: index, dx: Math.cos(angle) * (70 + (index % 4) * 28), dy: Math.sin(angle) * (60 + (index % 3) * 26), colour: ['#FFD23F', '#02CFF9', '#FF7A1A', '#8B3DFF', '#22C55E', '#FF6B57'][index % 6] };
  });
  return (
    <div className="tl-burst" aria-hidden="true">
      {bits.map((bit) => <span key={bit.id} style={{ background: bit.colour, ['--dx' as string]: `${bit.dx}px`, ['--dy' as string]: `${bit.dy}px` }} />)}
    </div>
  );
}

// One lesson, for one child (C555): `personal` carries the child's first name and where this lesson sits in their path;
// the lesson file stays the same copy for every child.
export function TechPlayer({ lesson, strand, nextKey, backHref, initialLang, voice, words, labLevel, childId, personal, passPercent }: { lesson: TechLesson; strand?: StrandInfo; nextKey: string | null; backHref: string; initialLang: TechLang; voice: VoiceMode; words: Words; labLevel: string | null; childId: string; personal: TechPersonal; passPercent: number }) {
  const [lang, setLang] = useState<TechLang>(initialLang);
  const [phase, setPhase] = useState<Phase>('see');
  const [seen, setSeen] = useState<Phase[]>(['see']);
  const [step, setStep] = useState(0);
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [results, setResults] = useState<Record<string, { right: boolean; explain: string; mark: unknown }>>({});
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [labOpen, setLabOpen] = useState(false);
  const [finished, setFinished] = useState<FinishResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [burst, setBurst] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const questions = lesson.try?.questions ?? [];
  const level = lesson.level === 1 || lesson.level === 2 || lesson.level === 3 ? lesson.level : 2;
  const say = (value: unknown) => named(pick(lang, value), personal.name);
  const rightSoFar = (id: string) => Object.entries(results).filter(([key, row]) => row.right && key !== id).length;

  useEffect(() => () => stopLine(), []);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const box = frame.current;
      if (!box || event.source !== box.contentWindow || event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      const message = data as Record<string, unknown>;
      if (!(message.type === 'nca-lab-event' || message.type === 'techlab:lab-complete' || message.source === 'nca-techlab' || message.source === 'nca-labs')) return;
      setEvents((current) => current.length >= 40 ? current : [...current, message]);
      const done = (message.source === 'nca-techlab' && (message.type === 'done' || message.type === 'mission:complete')) || (message.source === 'nca-labs' && message.type === 'done') || message.type === 'techlab:lab-complete';
      if (done && lesson.play?.lab) {
        rememberLab(childId, lesson.play.lab);
        void fetch(`/api/family/tech/labs/${lesson.play.lab}/done`, { method: 'POST', credentials: 'same-origin' });
        setToast('🧪 ✓');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [lesson.play?.lab, childId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const go = (next: Phase) => {
    stopLine();
    setPhase(next);
    setSeen((current) => current.includes(next) ? current : [...current, next]);
  };

  const note = (text: string) => setToast(text);
  const cheer = () => setBurst((value) => value + 1);

  const check = async (question: TechQuestion) => {
    const given = answers[question.id];
    if (question.type !== 'lab-check' && (given == null || given === '' || (Array.isArray(given) && given.length === 0))) {
      note(tw(lang, 'answerFirst'));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/family/tech/lessons/${lesson.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'check', questionId: question.id, answer: given, events, lang }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body) {
        note(tw(lang, 'couldNot'));
        return;
      }
      setResults((current) => ({ ...current, [question.id]: { right: body.right === true, explain: String(body.explain ?? ''), mark: body.mark } }));
      if (body.right === true) cheer();
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/family/tech/lessons/${lesson.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'finish', answers, events, lang }),
      });
      const body = (await response.json().catch(() => null)) as FinishResult | null;
      if (!response.ok || !body) {
        note(tw(lang, 'couldNot'));
        return;
      }
      setFinished(body);
      if (body.passed) {
        cheer();
        if (!body.saved) rememberPass(childId, lesson.id, body.stars, body.total ? Math.round((body.right / body.total) * 100) : 100, body.xp, body.gain, body.badges.map((badge) => badge.id));
      }
    } finally {
      setBusy(false);
    }
  };

  const steps = lesson.see ?? [];
  const current = steps[Math.min(step, Math.max(steps.length - 1, 0))];
  const question = questions[qi];
  const orderSeed = useMemo(() => (question?.type === 'order' && Array.isArray(question.options) ? shuffled(question.options.length) : []), [question]);

  useEffect(() => {
    if (!question || answers[question.id] != null) return;
    if (question.type === 'order') setAnswers((currentAnswers) => ({ ...currentAnswers, [question.id]: orderSeed }));
    if (question.type === 'match') {
      const columns = matchColumns(question);
      if (columns) setAnswers((currentAnswers) => ({ ...currentAnswers, [question.id]: columns.lefts.map(() => -1) }));
    }
  }, [question, orderSeed, answers]);

  const labConfirmed = (item: TechQuestion) => {
    if (item.type !== 'lab-check' || !item.id) return false;
    return results[item.id]?.right === true;
  };

  return (
    <div className="tl tl-player" lang={lang === 'hi' ? 'hi' : 'en'}>
      <header className={`tl-band l${level}${level === 1 ? '' : ' on-dark'} tl-band-player`}>
        <div className="tl-wrap tl-player-head">
          <div className="tl-title-row">
            <Link href={backHref} className="tl-iconbtn" aria-label={tw(lang, 'close')}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </Link>
            <div className="tl-seg" role="group" aria-label={tw(lang, 'language')}>
              {TECH_LANGS.map((item) => (
                <button key={item.id} type="button" aria-pressed={lang === item.id} onClick={() => { stopLine(); setLang(item.id); }}>{item.label}</button>
              ))}
            </div>
          </div>
          <span className="tl-kicker">{`${tw(lang, 'level')} ${level} · ${lesson.minutes || 8} min · ${lesson.xp || 20} XP`}</span>
          <h1>{pick(lang, lesson.title)}</h1>
          <nav className="tl-phases" aria-label={tw(lang, 'lessons')}>
            {PHASES.map((item) => (
              <button key={item.id} type="button" className="tl-phase tl-press" aria-current={phase === item.id ? 'step' : undefined} onClick={() => go(item.id)}>
                <span aria-hidden="true">{item.icon}</span>
                {tw(lang, item.word)}
                {seen.includes(item.id) && phase !== item.id ? ' ✓' : ''}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="tl-wrap tl-player-main">
        {phase === 'see' && (
          <>
            {step === 0 && (
              <section className="tl-card tl-pad tl-intro" data-intro>
                <span className="tl-pill tl-pill-go">{`👋 ${tw(lang, 'hey')}`}</span>
                <TechRead lesson={lesson} blockId={`${lesson.id}.intro`} lang={lang} label={tw(lang, 'listen')} words={words} voice={voice} personal={personal} />
              </section>
            )}
            {step === 0 && (lesson.outcomes ?? []).length > 0 && (
              <section className="tl-card tl-pad">
                <h3>{tw(lang, 'outcomes')}</h3>
                <ul className="tl-outcomes">{(lesson.outcomes ?? []).map((outcome, index) => <li key={index}>{say(outcome)}</li>)}</ul>
              </section>
            )}
            <div className="tl-see">
              {current ? <SeeVisual spec={String(current.visual || '')} level={level} strand={strand} lang={lang} /> : <SeeVisual spec="" level={level} strand={strand} lang={lang} />}
              {current && <TechRead lesson={lesson} blockId={`${lesson.id}.see.${step + 1}`} lang={lang} label={tw(lang, 'listen')} words={words} voice={voice} personal={personal} />}
            </div>
            <div className="tl-footer">
              <button type="button" className="tl-btn tl-btn-soft" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>{`← ${tw(lang, 'back')}`}</button>
              <button type="button" className="tl-btn tl-btn-go" onClick={() => { if (step < steps.length - 1) setStep((value) => value + 1); else go('play'); }}>{`${step < steps.length - 1 ? tw(lang, 'next') : tw(lang, 'play')} →`}</button>
            </div>
          </>
        )}
        {phase === 'play' && (
          <>
            <section className="tl-card tl-pad">
              <span className="tl-pill tl-pill-lab">{`🧪 ${lesson.play?.lab || '—'}`}</span>
              {lesson.play?.lab && <p className="tl-analogy" data-to-play>{toPlayLine(lesson.id, lang, personal.name)}</p>}
              <h3>{say(lesson.play?.goal) || tw(lang, 'play')}</h3>
              {lesson.play?.lab && labLevel ? (
                labOpen ? (
                  <>
                    <iframe ref={frame} className="tl-labframe" title={lesson.play.lab} sandbox="allow-scripts allow-same-origin allow-forms" allow="fullscreen" src={`/family/tech/labs/${labLevel || `L${level}`}/${lesson.play.lab}.html?lesson=${encodeURIComponent(`/family/tech/play/${lesson.id}.json`)}&lang=${lang}&embed=1`} />
                    <button type="button" className="tl-btn tl-btn-soft" onClick={() => setLabOpen(false)}>{tw(lang, 'closeLab')}</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="tl-btn tl-btn-go" onClick={() => setLabOpen(true)}>{tw(lang, 'openLab')}</button>
                    <p className="tl-quiet">{tw(lang, 'labData')}</p>
                  </>
                )
              ) : <p className="tl-note">{tw(lang, 'noLab')}</p>}
            </section>
            <div className="tl-footer">
              <button type="button" className="tl-btn tl-btn-soft" onClick={() => go('see')}>{`← ${tw(lang, 'see')}`}</button>
              <button type="button" className="tl-btn tl-btn-go" onClick={() => go('understand')}>{`${tw(lang, 'understand')} →`}</button>
            </div>
          </>
        )}
        {phase === 'understand' && (
          <>
            {(lesson.understand ?? []).map((card, index) => (
              <section key={index} className="tl-card tl-pad">
                <h3>{say(card.heading)}</h3>
                {say(card.analogy) && <p className="tl-analogy">{say(card.analogy)}</p>}
                {say(card.body) && <p>{say(card.body)}</p>}
                {say(card.realExample) && <p className="tl-real">{say(card.realExample)}</p>}
                <TechRead lesson={lesson} blockId={`${lesson.id}.understand.${index + 1}`} lang={lang} label={tw(lang, 'listen')} words={words} voice={voice} personal={personal} showText={false} />
              </section>
            ))}
            <section className="tl-card tl-pad tl-wrap-card" data-summary>
              <h3>{tw(lang, 'summary')}</h3>
              <TechRead lesson={lesson} blockId={`${lesson.id}.wrap`} lang={lang} label={tw(lang, 'listen')} words={words} voice={voice} personal={personal} />
            </section>
            {(lesson.vocab ?? []).length > 0 && (
              <section className="tl-card tl-pad">
                <h3>{tw(lang, 'words')}</h3>
                <div className="tl-terms">
                  {(lesson.vocab ?? []).map((word) => (
                    <button key={word.term} type="button" className="tl-term tl-press" onClick={() => void speak(word.term, voiceLang(lang))}>
                      <b>{word.term}</b>
                      <span>{lang === 'en' ? word.en : lang === 'hi' ? word.hi || word.hinglish : word.hinglish || word.en}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {(lesson.sources ?? []).length > 0 && (
              <details className="tl-card tl-pad">
                <summary>{tw(lang, 'sources')}</summary>
                <ul className="tl-outcomes">
                  {(lesson.sources ?? []).map((source, index) => (
                    <li key={index}>{source.url ? <a href={source.url} rel="noopener noreferrer" target="_blank">{source.title}</a> : source.title}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="tl-footer">
              <button type="button" className="tl-btn tl-btn-soft" onClick={() => go('play')}>{`← ${tw(lang, 'play')}`}</button>
              <button type="button" className="tl-btn tl-btn-go" onClick={() => go('try')}>{`${tw(lang, 'try')} →`}</button>
            </div>
          </>
        )}
        {phase === 'try' && !finished && question && (
          <QuestionCard
            lang={lang}
            question={question}
            index={qi}
            total={questions.length}
            mission={qi === 0 ? say(lesson.try?.mission) : ''}
            name={personal.name}
            praise={rightLine(lesson.id, lang, personal.name, rightSoFar(question.id))}
            answer={answers[question.id]}
            result={results[question.id]}
            confirmed={labConfirmed(question)}
            busy={busy}
            onAnswer={(value) => setAnswers((currentAnswers) => ({ ...currentAnswers, [question.id]: value }))}
            onCheck={() => void check(question)}
            onNext={() => { if (qi < questions.length - 1) setQi((value) => value + 1); else void finish(); }}
          />
        )}
        {phase === 'try' && finished && (
          <section className="tl-card tl-pad tl-finish">
            <div className="tl-trophy">{finished.passed ? '🏆' : '🔁'}</div>
            <h2>{finished.passed ? tw(lang, 'done') : tw(lang, 'wrong').replace(/:$/, '')}</h2>
            {finished.passed && personal.name && <p className="tl-analogy">{rightLine(lesson.id, lang, personal.name, 0)}</p>}
            <p>{tw(lang, 'score', { r: finished.right, n: finished.total })}</p>
            {finished.passed ? (
              <>
                <div className="tl-stars" aria-label={tw(lang, 'starsLabel', { n: finished.stars })}>{`${'⭐'.repeat(finished.stars)}${'☆'.repeat(3 - finished.stars)}`}</div>
                <span className="tl-xp">⚡ <b>{tw(lang, 'xpLine', { gain: finished.gain, total: finished.totalXp })}</b></span>
              </>
            ) : <p>{tw(lang, 'pass', { n: passPercent })}</p>}
            {!finished.saved && finished.passed && <p className="tl-quiet">{tw(lang, 'savedLater')}</p>}
            {finished.badges.map((badge) => (
              <div key={badge.id} className="tl-badge"><span className="tl-badge-disc">{badge.emoji}</span><b>{tw(lang, 'newBadge')}</b><span>{badge.name}</span></div>
            ))}
            <div className="tl-finish-actions">
              {!finished.passed && <button type="button" className="tl-btn tl-btn-go" onClick={() => { setFinished(null); setQi(0); setAnswers({}); setResults({}); }}>{tw(lang, 'again')}</button>}
              {finished.passed && nextKey && <Link className="tl-btn tl-btn-go" href={`/family/tech/lesson/${nextKey}?lang=${lang}`}>{`${tw(lang, 'nextLesson')} →`}</Link>}
              <Link className="tl-btn tl-btn-soft" href={backHref}>{tw(lang, 'toCourse')}</Link>
            </div>
          </section>
        )}
      </main>
      {toast && <div className="tl-toast" role="status">{toast}</div>}
      {burst > 0 && <Burst key={burst} />}
    </div>
  );
}

function QuestionCard({ lang, question, index, total, mission, name, praise, answer, result, confirmed, busy, onAnswer, onCheck, onNext }: {
  lang: TechLang;
  name: string;
  praise: string | null;
  question: TechQuestion;
  index: number;
  total: number;
  mission: string;
  answer: unknown;
  result?: { right: boolean; explain: string; mark: unknown };
  confirmed: boolean;
  busy: boolean;
  onAnswer: (value: unknown) => void;
  onCheck: () => void;
  onNext: () => void;
}) {
  const checked = !!result;
  const options = Array.isArray(question.options) ? question.options : [];
  const columns = matchColumns(question);
  const perm = columns ? shuffled(columns.rights.length) : [];
  return (
    <>
      {mission && (
        <section className="tl-card tl-pad tl-mission">
          <span className="tl-pill tl-pill-go">{`🎯 ${tw(lang, 'mission')}`}</span>
          <p>{mission}</p>
        </section>
      )}
      <section className="tl-card tl-pad">
        <div className="tl-qhead">
          <span className="tl-pill">{tw(lang, 'qOf', { a: index + 1, b: total })}</span>
          <span aria-hidden="true">{`${'●'.repeat(question.difficulty || 1)}${'○'.repeat(Math.max(0, 3 - (question.difficulty || 1)))}`}</span>
        </div>
        <h3>{named(pick(lang, question.prompt), name)}</h3>
        <div className="tl-options">
          {question.type === 'order' && <p className="tl-quiet">{tw(lang, 'orderHint')}</p>}
          {question.type === 'multi' && <p className="tl-quiet">{tw(lang, 'pick')}</p>}
          {question.type === 'order' && Array.isArray(answer) && (answer as number[]).map((optionIndex, position) => (
            <div key={`${optionIndex}-${position}`} className="tl-order">
              <span className="tl-k">{position + 1}</span>
              <span>{pick(lang, options[optionIndex])}</span>
              {!checked && (
                <>
                  <button type="button" aria-label={tw(lang, 'up')} disabled={position === 0} onClick={() => { const next = (answer as number[]).slice(); [next[position - 1], next[position]] = [next[position], next[position - 1]]; onAnswer(next); }}>↑</button>
                  <button type="button" aria-label={tw(lang, 'down')} disabled={position === (answer as number[]).length - 1} onClick={() => { const next = (answer as number[]).slice(); [next[position + 1], next[position]] = [next[position], next[position + 1]]; onAnswer(next); }}>↓</button>
                </>
              )}
            </div>
          ))}
          {question.type === 'short' && (
            <input className="tl-input" value={typeof answer === 'string' ? answer : ''} placeholder={tw(lang, 'typeHere')} disabled={checked} autoComplete="off" onChange={(event) => onAnswer(event.target.value)} />
          )}
          {question.type === 'lab-check' && <p className={`tl-opt${confirmed || result?.right ? ' right' : ''}`}>{`🧪 ${confirmed || result?.right ? tw(lang, 'labConfirmed') : tw(lang, 'labWait')}`}</p>}
          {question.type === 'match' && columns && columns.lefts.map((left, leftIndex) => {
            const chosen = Array.isArray(answer) ? Number(answer[leftIndex]) : -1;
            const mark = Array.isArray(result?.mark) ? Number(result?.mark[leftIndex]) : null;
            const tone = checked && mark != null ? (chosen === mark ? ' right' : ' wrong') : '';
            return (
              <div key={leftIndex} className={`tl-order${tone}`}>
                <span>{pick(lang, left)}</span>
                <select className="tl-input" disabled={checked} value={chosen} aria-label={pick(lang, left)} onChange={(event) => { const next = (Array.isArray(answer) ? (answer as number[]).slice() : columns.lefts.map(() => -1)); next[leftIndex] = Number(event.target.value); onAnswer(next); }}>
                  <option value={-1}>…</option>
                  {perm.map((rightIndex) => <option key={rightIndex} value={rightIndex}>{pick(lang, columns.rights[rightIndex])}</option>)}
                </select>
              </div>
            );
          })}
          {(question.type === 'mcq' || question.type === 'multi') && options.map((option, optionIndex) => {
            const on = question.type === 'multi' ? Array.isArray(answer) && (answer as number[]).includes(optionIndex) : answer === optionIndex;
            const correct = question.type === 'multi' ? Array.isArray(result?.mark) && (result?.mark as number[]).includes(optionIndex) : result?.mark === optionIndex;
            const tone = checked ? (correct ? ' right' : on ? ' wrong' : '') : '';
            return (
              <button key={optionIndex} type="button" className={`tl-opt tl-press${tone}`} aria-pressed={on} disabled={checked} onClick={() => {
                if (question.type === 'multi') {
                  const set = new Set<number>(Array.isArray(answer) ? (answer as number[]) : []);
                  if (set.has(optionIndex)) set.delete(optionIndex); else set.add(optionIndex);
                  onAnswer([...set].sort((left, right) => left - right));
                } else onAnswer(optionIndex);
              }}>
                <span className="tl-k">{String.fromCharCode(65 + optionIndex)}</span>
                <span>{pick(lang, option)}</span>
              </button>
            );
          })}
        </div>
        {result && <div className={`tl-feedback ${result.right ? 'ok' : 'no'}`} role="status"><b>{result.right ? praise || tw(lang, 'right') : tw(lang, 'wrong')}</b> {named(result.explain, name)}</div>}
      </section>
      <div className="tl-footer">
        {checked ? (
          <button type="button" className="tl-btn tl-btn-go" onClick={onNext}>{`${index < total - 1 ? tw(lang, 'next') : tw(lang, 'finish')} →`}</button>
        ) : (
          <button type="button" className="tl-btn tl-btn-ink" disabled={busy} onClick={onCheck}>{busy ? tw(lang, 'checking') : tw(lang, 'check')}</button>
        )}
      </div>
    </>
  );
}
