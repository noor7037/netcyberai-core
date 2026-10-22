'use client';

import { useEffect, useMemo, useState } from 'react';
import { normaliseSentence, shuffleByKey, tilesFor, type Option, type Step, type Track } from '@/lib/family/english/course';
import { fill, type Words } from '@/lib/family/fill';
import { Pic, SceneView, picName } from './Pictures';
import { speak, stopSpeaking, useRecorder } from './speech';
import { TRACK_THEME } from './theme';
import { PatternVisual } from './Visuals';

// One renderer per lesson step (docs/family-app/12 §4). Practice steps give feedback at once and are never scored:
// a wrong tap shows the right answer with its sound ("Almost!"), never "wrong" and never a cross. Only the lesson's
// check, sent at the end, is scored on the server.

type Props<T extends Step['type']> = { step: Extract<Step, { type: T }>; w: Words; hindi: boolean; track: Track };

const card = 'flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate/10';
const big = 'min-h-[44px] rounded-full px-5 font-bold';

function Listen({ text, w, lang = 'en', className = '' }: { text: string; w: Words; lang?: 'en' | 'hi'; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => void speak(text, lang)}
      aria-label={fill(w['fam.english.listenTo'], { text })}
      className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full bg-white text-xl text-slate shadow-sm ring-1 ring-slate/10 ${className}`}
    >
      <span aria-hidden="true">🔊</span>
    </button>
  );
}
const Hi = ({ text, show }: { text?: string; show: boolean }) =>
  text && show ? (
    <p lang="hi" className="text-base text-slate/80">
      {text}
    </p>
  ) : null;

function OptionFace({ o, size = 44 }: { o: Option; size?: number }) {
  return (
    <span className="flex flex-col items-center gap-1">
      {o.pic && <Pic pic={o.pic} size={size} />}
      {o.text && <span className="text-lg font-bold text-slate"><span lang="en">{o.text}</span></span>}
    </span>
  );
}

export function Feedback({ kind, w, answer }: { kind: 'right' | 'almost' | null; w: Words; answer?: React.ReactNode }) {
  if (!kind) return <p aria-live="polite" className="sr-only" />;
  return (
    <p aria-live="polite" className={`flex flex-wrap items-center gap-2 rounded-2xl p-3 text-base font-bold animate-pop-in motion-reduce:animate-none ${kind === 'right' ? 'bg-leaf/20 text-slate' : 'bg-sunshine/30 text-slate'}`}>
      <span aria-hidden="true">{kind === 'right' ? '🌟' : '💡'}</span>
      {kind === 'right' ? w['fam.english.great'] : w['fam.english.almost']}
      {kind === 'almost' && answer}
    </p>
  );
}

export function TipStep({ step, hindi }: Props<'tip'>) {
  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-sunshine/25 p-5 text-slate shadow-sm ring-1 ring-gold/40">
      <div className="flex items-start gap-4">
        <Pic pic={step.pic ?? '💡'} size={64} className="animate-bounce-once motion-reduce:animate-none" />
        <div className="flex flex-col gap-1">
          <p className="text-lg font-bold text-slate"><span lang="en">{step.text.en}</span></p>
          <Hi text={step.text.hi} show={hindi || !!step.text.hi} />
        </div>
      </div>
    </div>
  );
}

// Word cards in a swipeable row; a card flips to its Hindi meaning; the picture bounces when its sound plays.
export function WordsStep({ step, w, track }: Props<'words'>) {
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const theme = TRACK_THEME[track];
  const play = async (key: string, text: string) => {
    setPlaying(key);
    await speak(text, 'en', track === 'a' ? 0.75 : 0.9);
    setPlaying(null);
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-slate/70">{w['fam.english.flip']}</p>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
        {step.words.map((word, i) => (
          <li key={word.key} className="w-4/5 max-w-[300px] shrink-0 snap-center animate-rise-in motion-reduce:animate-none" style={{ animationDelay: `${i * 90}ms`, animationFillMode: 'both' }}>
            <div className={`flex h-full flex-col items-center gap-3 rounded-3xl p-5 text-center shadow-md ring-2 ${theme.ring} ${flipped[word.key] ? theme.soft : 'bg-white text-slate'}`}>
              <button
                type="button"
                onClick={() => setFlipped((f) => ({ ...f, [word.key]: !f[word.key] }))}
                aria-pressed={!!flipped[word.key]}
                className="flex w-full flex-col items-center gap-2 bg-transparent text-slate"
              >
                <span key={`${playing === word.key}`} className={playing === word.key ? 'animate-bounce-once motion-reduce:animate-none' : ''}>
                  <Pic pic={word.pic} size={88} />
                </span>
                <span className="text-3xl font-extrabold text-slate"><span lang="en">{word.en}</span></span>
                {flipped[word.key] && (
                  <span lang="hi" className="text-2xl font-bold text-slate animate-flip-in motion-reduce:animate-none">
                    {word.hi}
                  </span>
                )}
              </button>
              {word.example && flipped[word.key] && <p className="text-base text-slate"><span lang="en">{word.example.en}</span></p>}
              <button type="button" onClick={() => void play(word.key, word.example && flipped[word.key] ? word.example.en : word.en)} className={`${big} ${theme.button}`}>
                <span aria-hidden="true">🔊</span> {w['fam.english.listen']}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate/70">🔊 {w['fam.english.phoneVoice']}</p>
    </div>
  );
}

// Act it out, then say it (total physical response).
export function ActionStep({ step, w, hindi }: Props<'action'>) {
  const [on, setOn] = useState<number | null>(null);
  return (
    <ul className="grid grid-cols-2 gap-3">
      {step.prompts.map((p, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => {
              setOn(i);
              void speak(p.en, 'en', 0.8);
            }}
            className={`flex min-h-[132px] w-full flex-col items-center justify-center gap-2 rounded-3xl p-3 text-center shadow-sm ring-1 ring-slate/10 ${on === i ? 'bg-sunshine/30 text-slate' : 'bg-white text-slate'}`}
          >
            <span className={on === i ? 'animate-bounce-once motion-reduce:animate-none' : ''}>
              <Pic pic={p.pic} size={52} />
            </span>
            <span className="text-lg font-extrabold text-slate"><span lang="en">{p.en}</span></span>
            <Hi text={p.hi} show />
          </button>
        </li>
      ))}
      <li className="col-span-2 text-xs text-slate/70">🔊 {w['fam.english.phoneVoice']}</li>
    </ul>
  );
}

export function PatternStep({ step, w, hindi }: Props<'pattern'>) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-extrabold text-slate"><span lang="en">{step.title.en}</span></h3>
        <Hi text={step.title.hi} show={hindi} />
      </div>
      <PatternVisual step={step} w={w} hindi={hindi} />
      {step.note && (
        <div className="rounded-2xl bg-sunshine/20 p-3 text-slate">
          <p className="font-bold text-slate">💡 <span lang="en">{step.note.en}</span></p>
          <Hi text={step.note.hi} show={hindi || !!step.note.hi} />
        </div>
      )}
    </div>
  );
}

// A story or dialogue: lines appear in turn beside their speaker; the word being read lights up.
export function StoryStep({ step, w, hindi, track }: Props<'story'>) {
  const [shown, setShown] = useState(1);
  const [reading, setReading] = useState<{ line: number; char: number } | null>(null);
  const theme = TRACK_THEME[track];
  const readLine = async (i: number) => {
    setReading({ line: i, char: 0 });
    await speak(step.lines[i].en, 'en', track === 'a' || track === 'b' ? 0.8 : 0.9, (char) => setReading({ line: i, char }));
    setReading(null);
  };
  const readAll = async () => {
    setShown(step.lines.length);
    for (let i = 0; i < step.lines.length; i++) await readLine(i);
  };
  useEffect(() => () => stopSpeaking(), []);
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xl font-extrabold text-slate"><span lang="en">{step.title.en}</span></h3>
      <SceneView scene={step.scene} label={step.title.en} />
      <button type="button" onClick={() => void readAll()} className={`${big} self-start ${theme.button}`}>
        ▶ {w['fam.english.listen']}
      </button>
      <ol className="flex flex-col gap-2">
        {step.lines.slice(0, shown).map((l, i) => {
          const right = l.speaker !== undefined && step.lines.findIndex((x) => x.speaker === l.speaker) % 2 === 1;
          return (
            <li key={i} className={`flex items-end gap-2 animate-rise-in motion-reduce:animate-none ${right ? 'flex-row-reverse' : ''}`}>
              <Pic pic={l.pic} size={34} />
              <div className={`flex max-w-xs flex-col gap-1 rounded-3xl px-4 py-3 shadow-sm ${right ? 'rounded-br-md bg-cyan/20 text-slate' : 'rounded-bl-md bg-white text-slate'} ring-1 ring-slate/10`}>
                {l.speaker && <span lang="en" className="text-xs font-bold uppercase tracking-wide text-slate/70">{l.speaker}</span>}
                <p lang="en" className="text-lg text-slate">
                  {reading?.line === i ? <Karaoke text={l.en} at={reading.char} /> : l.en}
                </p>
                <Hi text={l.hi} show={hindi} />
                <Listen text={l.en} w={w} className="self-end" />
              </div>
            </li>
          );
        })}
      </ol>
      {shown < step.lines.length && (
        <button type="button" onClick={() => setShown(shown + 1)} className={`${big} self-center bg-white text-slate shadow-sm ring-1 ring-slate/10`}>
          {w['fam.english.next']} ↓
        </button>
      )}
    </div>
  );
}

function Karaoke({ text, at }: { text: string; at: number }) {
  const end = text.indexOf(' ', at);
  const stop = end < 0 ? text.length : end;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded bg-sunshine px-0.5 text-slate">{text.slice(at, stop)}</mark>
      {text.slice(stop)}
    </>
  );
}

// Practice: pick one. Feedback at once; the right answer is always shown.
export function ChooseStep({ step, w, hindi, track }: Props<'choose'>) {
  return (
    <div className="flex flex-col gap-4">
      {step.items.map((it) => (
        <ChooseOne key={it.key} prompt={it.prompt} options={it.options} answer={it.answer} why={it.why} w={w} hindi={hindi} track={track} />
      ))}
    </div>
  );
}

function ChooseOne(p: { prompt: Extract<Step, { type: 'choose' }>['items'][number]['prompt']; options: Option[]; answer: number; why?: { en: string; hi?: string }; w: Words; hindi: boolean; track: Track }) {
  const [picked, setPicked] = useState<number | null>(null);
  const right = picked !== null && picked === p.answer;
  return (
    <div className={card}>
      <div className="flex items-center gap-3">
        {p.prompt.pic && <Pic pic={p.prompt.pic} size={40} />}
        <div className="flex flex-1 flex-col">
          <p className="text-lg font-bold text-slate"><span lang="en">{p.prompt.en}</span></p>
          <Hi text={p.prompt.hi} show={p.hindi} />
        </div>
        {p.prompt.say && <Listen text={p.prompt.say} w={p.w} />}
      </div>
      <div className={`grid gap-2 ${p.options.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {p.options.map((o, i) => {
          const isRight = picked !== null && i === p.answer;
          return (
            <button
              key={i}
              type="button"
              aria-label={o.text ?? picName(o.pic)}
              disabled={right}
              onClick={() => {
                setPicked(i);
                // One line only: the right answer's word, so a miss always ends on what is right.
                const said = p.options[p.answer]?.text;
                if (said) void speak(said);
              }}
              className={`flex min-h-[72px] items-center justify-center rounded-2xl p-2 shadow-sm ring-2 ${isRight ? 'bg-leaf/20 text-slate ring-leaf animate-bounce-once motion-reduce:animate-none' : picked === i ? 'bg-sunshine/20 text-slate ring-gold animate-nudge motion-reduce:animate-none' : 'bg-white text-slate ring-slate/10'}`}
            >
              <OptionFace o={o} size={p.track === 'a' ? 56 : 44} />
            </button>
          );
        })}
      </div>
      <Feedback kind={picked === null ? null : right ? 'right' : 'almost'} w={p.w} answer={<OptionFace o={p.options[p.answer]} size={28} />} />
      {picked !== null && p.why && (
        <div className="text-base text-slate">
          <p><span lang="en">{p.why.en}</span></p>
          <Hi text={p.why.hi} show={p.hindi || !!p.why.hi} />
        </div>
      )}
    </div>
  );
}

// Practice: tap a left card, then its partner. Matched pairs lock in colour.
export function MatchStep({ step, w, track }: Props<'match'>) {
  const rights = useMemo(() => shuffleByKey(step.pairs.map((p) => p.key), step.pairs.map((p) => p.key).join('|')), [step.pairs]);
  const [left, setLeft] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [miss, setMiss] = useState<string | null>(null);
  const pair = (k: string) => step.pairs.find((p) => p.key === k)!;
  const pickRight = (k: string) => {
    if (!left) return;
    if (k === left) {
      setDone(new Set([...done, k]));
      const t = pair(k).left.text ?? pair(k).right.text;
      if (t) void speak(t);
      setLeft(null);
    } else {
      setMiss(k);
      window.setTimeout(() => setMiss(null), 350);
    }
  };
  const theme = TRACK_THEME[track];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg font-bold text-slate">{w['fam.english.match']}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          {step.pairs.map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={done.has(p.key)}
              aria-label={p.left.text ?? picName(p.left.pic)}
              onClick={() => setLeft(p.key)}
              aria-pressed={left === p.key}
              className={`min-h-[64px] rounded-2xl p-2 shadow-sm ring-2 ${done.has(p.key) ? 'bg-leaf/20 text-slate ring-leaf' : left === p.key ? `${theme.soft} ${theme.ring}` : 'bg-white text-slate ring-slate/10'}`}
            >
              <OptionFace o={p.left} />
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {rights.map((k) => (
            <button
              key={k}
              type="button"
              disabled={done.has(k)}
              aria-label={pair(k).right.text ?? picName(pair(k).right.pic)}
              onClick={() => pickRight(k)}
              className={`min-h-[64px] rounded-2xl p-2 shadow-sm ring-2 ${done.has(k) ? 'bg-leaf/20 text-slate ring-leaf animate-pop-in motion-reduce:animate-none' : miss === k ? 'bg-sunshine/20 text-slate ring-gold animate-nudge motion-reduce:animate-none' : 'bg-white text-slate ring-slate/10'}`}
            >
              <OptionFace o={pair(k).right} />
            </button>
          ))}
        </div>
      </div>
      <Feedback kind={done.size === step.pairs.length ? 'right' : null} w={w} />
    </div>
  );
}

// Tiles into a sentence. Used by build practice and the Hindi-to-English bridge.
export function TileBuilder({ id, tiles, answer, w, track, prompt }: { id: string; tiles: string[]; answer: string; w: Words; track: Track; prompt?: React.ReactNode }) {
  const order = useMemo(() => tilesFor(tiles, id, answer), [tiles, id, answer]);
  const [used, setUsed] = useState<number[]>([]);
  const [result, setResult] = useState<'right' | 'almost' | null>(null);
  const theme = TRACK_THEME[track];
  const sentence = used.map((i) => order[i]).join(' ');
  const check = () => {
    const ok = normaliseSentence(sentence) === normaliseSentence(answer);
    setResult(ok ? 'right' : 'almost');
    void speak(answer);
  };
  return (
    <div className={card}>
      {prompt}
      <div className="flex min-h-[56px] flex-wrap items-center gap-2 rounded-2xl border-2 border-dashed border-slate/20 bg-off-white p-2 text-slate">
        {used.map((i, k) => (
          <button key={k} type="button" onClick={() => { setUsed(used.filter((x) => x !== i)); setResult(null); }} className={`min-h-[44px] rounded-xl px-3 text-lg font-bold animate-pop-in motion-reduce:animate-none ${theme.button}`}>
            <span lang="en">{order[i]}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {order.map((t, i) =>
          used.includes(i) ? null : (
            <button key={i} type="button" onClick={() => { setUsed([...used, i]); setResult(null); }} className="min-h-[44px] rounded-xl bg-white px-3 text-lg font-bold text-slate shadow-sm ring-1 ring-slate/20">
              <span lang="en">{t}</span>
            </button>
          )
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={used.length !== order.length} onClick={check} className={`${big} ${theme.button} disabled:opacity-50`}>
          {w['fam.english.checkMine']}
        </button>
        <button type="button" onClick={() => { setUsed([]); setResult(null); }} className={`${big} bg-white text-slate ring-1 ring-slate/20`}>
          {w['fam.english.clear']}
        </button>
      </div>
      <Feedback kind={result} w={w} answer={<span lang="en" className="text-slate">{answer}</span>} />
    </div>
  );
}

export function BuildStep({ step, w, hindi, track }: Props<'build'>) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg font-bold text-slate">{w['fam.english.build']}</p>
      {step.items.map((it) => (
        <TileBuilder
          key={it.key}
          id={it.key}
          tiles={it.tiles}
          answer={it.answer}
          w={w}
          track={track}
          prompt={(it.hi || it.pic) && (
            <div className="flex items-center gap-3">
              <Pic pic={it.pic} size={36} />
              <Hi text={it.hi} show={hindi} />
            </div>
          )}
        />
      ))}
    </div>
  );
}

export function BridgeStep({ step, w, track }: Props<'bridge'>) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg font-bold text-slate">🌉 {w['fam.english.bridge']}</p>
      {step.items.map((it) => (
        <TileBuilder
          key={it.key}
          id={it.key}
          tiles={it.tiles}
          answer={it.answer}
          w={w}
          track={track}
          prompt={
            <p lang="hi" className="text-xl font-bold text-slate">
              {it.hi}
            </p>
          }
        />
      ))}
    </div>
  );
}

// Say it aloud: hear the model, record and hear yourself (kept on the phone only), then "I said it!".
export function SayLine({ model, hi, cue, pic, w, hindi, track }: { model: string; hi?: string; cue?: { en: string; hi?: string }; pic?: string; w: Words; hindi: boolean; track: Track }) {
  const rec = useRecorder();
  const [said, setSaid] = useState(false);
  const theme = TRACK_THEME[track];
  return (
    <div className={card}>
      {cue && (
        <div className="flex items-center gap-2">
          <Listen text={cue.en} w={w} />
          <div>
            <p className="text-lg font-bold text-slate"><span lang="en">{cue.en}</span></p>
            <Hi text={cue.hi} show={hindi} />
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 rounded-2xl bg-off-white p-3 text-slate">
        <Pic pic={pic} size={40} />
        <div className="flex flex-1 flex-col">
          <p className="text-xl font-extrabold text-slate"><span lang="en">{model}</span></p>
          <Hi text={hi} show={hindi || track === 'a' || track === 'b'} />
        </div>
        <Listen text={model} w={w} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {rec.supported && rec.state !== 'denied' && (
          <button
            type="button"
            onClick={() => (rec.state === 'recording' ? rec.stop() : void rec.start())}
            aria-pressed={rec.state === 'recording'}
            className={`${big} relative ${rec.state === 'recording' ? 'bg-coral text-slate' : 'bg-white text-slate ring-1 ring-slate/20'}`}
          >
            {rec.state === 'recording' && <span aria-hidden="true" className="absolute inset-0 rounded-full bg-coral animate-glow motion-reduce:animate-none" />}
            <span className="relative">🎙️ {rec.state === 'recording' ? w['fam.english.stop'] : w['fam.english.record']}</span>
          </button>
        )}
        {rec.hasClip && (
          <button type="button" onClick={rec.play} className={`${big} bg-white text-slate ring-1 ring-slate/20`}>
            🎧 {w['fam.english.hearYourself']}
          </button>
        )}
        <button type="button" onClick={() => setSaid(true)} className={`${big} ${theme.button}`}>
          ✅ {w['fam.english.iSaidIt']}
        </button>
      </div>
      {rec.state === 'denied' && <p className="text-sm text-slate/80">{w['fam.english.micOff']}</p>}
      {rec.supported && <p className="text-xs text-slate/70">{w['fam.english.recordNote']}</p>}
      {said && <Feedback kind="right" w={w} />}
    </div>
  );
}

export function SayStep({ step, w, hindi, track }: Props<'say'>) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg font-bold text-slate">🗣️ {w['fam.english.sayIt']}</p>
      {step.prompts.map((p) => (
        <SayLine key={p.key} model={p.model} hi={p.hi} cue={p.cue} pic={p.pic} w={w} hindi={hindi} track={track} />
      ))}
    </div>
  );
}

// A role-play: the partner's lines are spoken; at the learner's turns the child says the line (duet mode: a grown-up
// may take the partner's part).
export function RoleplayStep({ step, w, hindi, track }: Props<'roleplay'>) {
  const [at, setAt] = useState(0);
  const theme = TRACK_THEME[track];
  const partner = step.roles.find((_, i) => i !== step.learner);
  useEffect(() => {
    const t = step.turns[at];
    if (t && t.role !== step.learner) void speak(t.en, 'en', 0.9);
  }, [at, step]);
  useEffect(() => () => stopSpeaking(), []);
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xl font-extrabold text-slate"><span lang="en">{step.title.en}</span></h3>
      <Hi text={step.title.hi} show={hindi} />
      <SceneView scene={step.scene} label={step.title.en} />
      {partner && <p className="rounded-2xl bg-grape/10 p-3 text-sm font-semibold text-slate">👥 {w['fam.english.roleplay.duet'].replace('{role}', partner.name)}</p>}
      <ol className="flex flex-col gap-2">
        {step.turns.slice(0, at + 1).map((t, i) => {
          const mine = t.role === step.learner;
          const role = step.roles[t.role];
          return (
            <li key={i} className={`flex items-end gap-2 animate-rise-in motion-reduce:animate-none ${mine ? 'flex-row-reverse' : ''}`}>
              <Pic pic={role?.pic} size={34} />
              <div className={`flex max-w-xs flex-col gap-1 rounded-3xl px-4 py-3 shadow-sm ring-1 ring-slate/10 ${mine ? `rounded-br-md ${theme.soft}` : 'rounded-bl-md bg-white text-slate'}`}>
                <span className="text-xs font-bold uppercase tracking-wide text-slate/70">{mine && i === at ? w['fam.english.roleplay.turn'] : role?.name}</span>
                <p className="text-lg text-slate"><span lang="en">{t.en}</span></p>
                <Hi text={t.hi} show={hindi} />
                <Listen text={t.en} w={w} className="self-end" />
              </div>
            </li>
          );
        })}
      </ol>
      {at < step.turns.length - 1 && (
        <button type="button" onClick={() => setAt(at + 1)} className={`${big} self-center bg-white text-slate shadow-sm ring-2 ${theme.ring}`}>
          {step.turns[at].role === step.learner ? `✅ ${w['fam.english.iSaidIt']}` : `💬 ${w['fam.english.roleplay.nextLine']}`}
        </button>
      )}
    </div>
  );
}

// Look and talk: a scene and questions; the model answer is shown after the child has tried.
export function PictureStep({ step, w, hindi, track }: Props<'picture'>) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const theme = TRACK_THEME[track];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg font-bold text-slate">👀 {w['fam.english.picture']}</p>
      <SceneView scene={step.scene} label={w['fam.english.picture']} />
      {step.questions.map((q) => (
        <div key={q.key} className={card}>
          <div className="flex items-center gap-2">
            <Listen text={q.en} w={w} />
            <div>
              <p className="text-lg font-bold text-slate"><span lang="en">{q.en}</span></p>
              <Hi text={q.hi} show={hindi} />
            </div>
          </div>
          {open[q.key] ? (
            <div className="flex items-center gap-2 rounded-2xl bg-leaf/10 p-3 text-slate animate-rise-in motion-reduce:animate-none">
              <span className="text-sm font-bold text-slate/70">{w['fam.english.picture.model']}</span>
              <p className="flex-1 text-lg font-bold text-slate"><span lang="en">{q.model}</span></p>
              <Listen text={q.model} w={w} />
            </div>
          ) : (
            <button type="button" onClick={() => setOpen({ ...open, [q.key]: true })} className={`${big} self-start ${theme.button}`}>
              ✅ {w['fam.english.iSaidIt']}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// A short talk with a timer ring and its outline.
export function TalkStep({ step, w, hindi, track }: Props<'talk'>) {
  const [left, setLeft] = useState<number | null>(null);
  const [model, setModel] = useState(false);
  const theme = TRACK_THEME[track];
  useEffect(() => {
    if (left === null || left <= 0) return;
    const t = window.setTimeout(() => setLeft(left - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left]);
  const share = left === null ? 1 : left / step.seconds;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xl font-extrabold text-slate">🎤 <span lang="en">{step.topic.en}</span></h3>
      <Hi text={step.topic.hi} show={hindi} />
      <ol className="flex flex-col gap-2">
        {step.outline.map((o, i) => (
          <li key={i} className="flex items-start gap-2 rounded-2xl bg-white p-3 text-slate shadow-sm ring-1 ring-slate/10">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${theme.button}`}>{i + 1}</span>
            <div>
              <p className="font-bold text-slate"><span lang="en">{o.en}</span></p>
              <Hi text={o.hi} show={hindi} />
            </div>
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 44 44" className="h-20 w-20 -rotate-90" aria-hidden="true">
          <circle cx="22" cy="22" r="19" fill="none" stroke={theme.light} strokeOpacity="0.3" strokeWidth="5" />
          <circle cx="22" cy="22" r="19" fill="none" stroke={theme.hex} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${share * 119.4} 119.4`} />
        </svg>
        {left === null || left === 0 ? (
          <button type="button" onClick={() => setLeft(step.seconds)} className={`${big} ${theme.button}`}>
            ⏱️ {w['fam.english.talk.start']}
          </button>
        ) : (
          <p aria-live="polite" className="text-lg font-bold text-slate">
            {w['fam.english.talk.left'].replace('{s}', String(left))}
          </p>
        )}
      </div>
      <button type="button" onClick={() => setModel(!model)} className={`${big} self-start bg-white text-slate ring-1 ring-slate/20`}>
        {w['fam.english.talk.model']}
      </button>
      {model && (
        <div className="flex flex-col gap-1 rounded-2xl bg-off-white p-3 text-slate">
          {step.model.map((m, i) => (
            <p key={i} lang="en" className="text-base text-slate">
              {m}
            </p>
          ))}
          <Listen text={step.model.join(' ')} w={w} className="self-start" />
        </div>
      )}
    </div>
  );
}

export function StepView({ step, w, hindi, track }: { step: Step; w: Words; hindi: boolean; track: Track }) {
  const p = { w, hindi, track };
  switch (step.type) {
    case 'tip':
      return <TipStep step={step} {...p} />;
    case 'words':
      return <WordsStep step={step} {...p} />;
    case 'action':
      return <ActionStep step={step} {...p} />;
    case 'pattern':
      return <PatternStep step={step} {...p} />;
    case 'story':
      return <StoryStep step={step} {...p} />;
    case 'choose':
      return <ChooseStep step={step} {...p} />;
    case 'match':
      return <MatchStep step={step} {...p} />;
    case 'build':
      return <BuildStep step={step} {...p} />;
    case 'say':
      return <SayStep step={step} {...p} />;
    case 'roleplay':
      return <RoleplayStep step={step} {...p} />;
    case 'picture':
      return <PictureStep step={step} {...p} />;
    case 'bridge':
      return <BridgeStep step={step} {...p} />;
    case 'talk':
      return <TalkStep step={step} {...p} />;
    default:
      return null;
  }
}
