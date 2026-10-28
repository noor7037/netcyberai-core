'use client';
import { Picture } from '../Picture';

import { useState } from 'react';
import { colors } from '@/lib/design-tokens';
import type { Example, Step } from '@/lib/family/english/course';
import { fill, type Words } from '@/lib/family/fill';
import { Pic } from './Pictures';
import { speak } from './speech';
import { PART_STYLE } from './theme';

// The pattern lesson's visuals (docs/family-app/12 §10): grammar as moving pictures. Each draws itself once; under
// reduced motion it is simply there.

type PatternStep = Extract<Step, { type: 'pattern' }>;

function ListenButton({ text, label, className = '' }: { text: string; label: string; className?: string }) {
  return (
    <button type="button" onClick={() => void speak(text)} aria-label={fill(label, { text })} className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white text-xl text-slate shadow-sm ring-1 ring-slate/10 ${className}`}>
      <span aria-hidden="true"><Picture e="🔊" /></span>
    </button>
  );
}

function Hindi({ text, show }: { text?: string; show: boolean }) {
  if (!text || !show) return null;
  return (
    <p lang="hi" className="text-base text-slate/80">
      {text}
    </p>
  );
}

// Colour-coded sentence parts, snapping in one after another.
export function PartsLine({ ex, w }: { ex: Example; w: Words }) {
  if (!ex.parts) return <p className="text-xl font-bold text-slate"><span lang="en">{ex.en}</span></p>;
  return (
    <div className="flex flex-wrap items-end gap-2">
      {ex.parts.map((p, i) => (
        <span key={i} className="flex flex-col items-center gap-1 animate-pop-in motion-reduce:animate-none" style={{ animationDelay: `${i * 160}ms`, animationFillMode: 'both' }}>
          <span className={`rounded-2xl px-3 py-2 text-xl font-extrabold shadow-sm ${PART_STYLE[p.role]}`}><span lang="en">{p.text}</span></span>
          {p.role !== 'other' && <span className="text-xs font-bold uppercase tracking-wide text-slate/70">{w[`fam.english.part.${p.role}`]}</span>}
        </span>
      ))}
    </div>
  );
}

// Yesterday → now → tomorrow: the arrow draws itself; each example drops onto its time.
function Timeline({ step, w, hindi }: { step: PatternStep; w: Words; hindi: boolean }) {
  const slots: Record<string, number> = { past: 16, now: 50, future: 84 };
  return (
    <div className="flex flex-col gap-4">
      <svg viewBox="0 0 100 24" className="w-full" aria-hidden="true">
        <path d="M4 12 H94" stroke={colors.slate} strokeWidth="1.6" pathLength={1} strokeDasharray="1" className="animate-draw motion-reduce:animate-none" style={{ strokeDashoffset: 0 }} />
        <path d="M90 8 L96 12 L90 16" fill="none" stroke={colors.slate} strokeWidth="1.6" />
        {(['past', 'now', 'future'] as const).map((k) => (
          <g key={k}>
            {k === 'now' && <circle cx={slots[k]} cy="12" r="5" fill={colors.sunshine} className="animate-glow motion-reduce:animate-none" style={{ transformOrigin: `${slots[k]}px 12px` }} />}
            <circle cx={slots[k]} cy="12" r="3" fill={k === 'past' ? colors.grape : k === 'now' ? colors.tangerine : colors.turquoise} />
          </g>
        ))}
      </svg>
      <div className="grid grid-cols-3 text-center text-sm font-bold text-slate">
        <span>{w['fam.english.time.past']}</span>
        <span>{w['fam.english.time.now']}</span>
        <span>{w['fam.english.time.future']}</span>
      </div>
      <ul className="flex flex-col gap-3">
        {step.examples.map((ex, i) => (
          <li
            key={i}
            className={`flex items-center gap-3 rounded-2xl p-3 shadow-sm ring-1 ring-slate/10 animate-rise-in motion-reduce:animate-none ${ex.time === 'past' ? 'bg-grape/10' : ex.time === 'future' ? 'bg-turquoise/10' : 'bg-sunshine/20'}`}
            style={{ animationDelay: `${300 + i * 220}ms`, animationFillMode: 'both', marginLeft: ex.time === 'past' ? 0 : ex.time === 'now' ? '1.5rem' : '3rem' }}
          >
            <Pic pic={ex.pic} size={34} />
            <div className="flex flex-1 flex-col">
              <p className="text-lg font-bold text-slate"><span lang="en">{ex.en}</span></p>
              <Hindi text={ex.hi} show={hindi} />
            </div>
            <ListenButton text={ex.en} label={w['fam.english.listenTo']} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// A statement turns into a question: the first two words swap places.
function QuestionFlip({ step, w, hindi }: { step: PatternStep; w: Words; hindi: boolean }) {
  const [i, setI] = useState(0);
  const ex = step.examples[i];
  return (
    <div className="flex flex-col gap-3">
      <div key={i} className="flex flex-col gap-2 rounded-2xl bg-cyan/10 p-4 animate-flip-in motion-reduce:animate-none">
        {ex.pic && <Pic pic={ex.pic} size={40} />}
        <PartsLine ex={ex} w={w} />
        <Hindi text={ex.hi} show={hindi} />
        <ListenButton text={ex.en} label={w['fam.english.listenTo']} className="self-start" />
      </div>
      {step.examples.length > 1 && (
        <button type="button" onClick={() => setI((i + 1) % step.examples.length)} className="min-h-[44px] self-start rounded-full bg-cyan px-5 font-bold text-slate">
          ⇄ {w['fam.english.next']}
        </button>
      )}
    </div>
  );
}

// One thing becomes many: the picture multiplies as the -s appears.
function Plural({ step, w, hindi }: { step: PatternStep; w: Words; hindi: boolean }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {step.examples.map((ex, i) => {
        const many = /\b(two|three|four|five|six|seven|eight|nine|ten|many|some|\d+)\b/i.test(ex.en);
        return (
          <li key={i} className="flex flex-col gap-2 rounded-2xl bg-leaf/10 p-3 shadow-sm ring-1 ring-slate/10">
            <div className="flex gap-1">
              {Array.from({ length: many ? 3 : 1 }, (_, k) => (
                <span key={k} className="animate-pop-in motion-reduce:animate-none" style={{ animationDelay: `${k * 200}ms`, animationFillMode: 'both' }}>
                  <Pic pic={ex.pic} size={34} />
                </span>
              ))}
            </div>
            <p className="text-lg font-bold text-slate"><span lang="en">{ex.en}</span></p>
            <Hindi text={ex.hi} show={hindi} />
            <ListenButton text={ex.en} label={w['fam.english.listenTo']} className="self-start" />
          </li>
        );
      })}
    </ul>
  );
}

// Two things side by side, the bigger one growing.
function Compare({ step, w, hindi }: { step: PatternStep; w: Words; hindi: boolean }) {
  return (
    <ul className="flex flex-col gap-3">
      {step.examples.map((ex, i) => (
        <li key={i} className="flex items-center gap-3 rounded-2xl bg-sunshine/20 p-3 shadow-sm ring-1 ring-slate/10">
          <span className="animate-bounce-once motion-reduce:animate-none" style={{ animationDelay: `${i * 250}ms` }}>
            <Pic pic={ex.pic} size={28 + i * 10} />
          </span>
          <div className="flex flex-1 flex-col">
            <p className="text-lg font-bold text-slate"><span lang="en">{ex.en}</span></p>
            <Hindi text={ex.hi} show={hindi} />
          </div>
          <ListenButton text={ex.en} label={w['fam.english.listenTo']} />
        </li>
      ))}
    </ul>
  );
}

// Builder and cards: each example as colour-coded parts (or a plain card), one after another.
function Builder({ step, w, hindi }: { step: PatternStep; w: Words; hindi: boolean }) {
  return (
    <ul className="flex flex-col gap-4">
      {step.examples.map((ex, i) => (
        <li key={i} className="flex flex-col gap-2 fam-card bg-white p-4 animate-rise-in motion-reduce:animate-none" style={{ animationDelay: `${i * 260}ms`, animationFillMode: 'both' }}>
          <div className="flex items-center gap-3">
            <Pic pic={ex.pic} size={36} />
            <ListenButton text={ex.en} label={w['fam.english.listenTo']} className="ml-auto" />
          </div>
          <PartsLine ex={ex} w={w} />
          <Hindi text={ex.hi} show={hindi} />
        </li>
      ))}
    </ul>
  );
}

export function PatternVisual({ step, w, hindi }: { step: PatternStep; w: Words; hindi: boolean }) {
  switch (step.visual) {
    case 'timeline':
      return <Timeline step={step} w={w} hindi={hindi} />;
    case 'question_flip':
      return <QuestionFlip step={step} w={w} hindi={hindi} />;
    case 'plural':
      return <Plural step={step} w={w} hindi={hindi} />;
    case 'compare':
      return <Compare step={step} w={w} hindi={hindi} />;
    default:
      return <Builder step={step} w={w} hindi={hindi} />;
  }
}
