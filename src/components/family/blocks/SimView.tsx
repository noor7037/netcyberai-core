'use client';

import { useState } from 'react';
import type { SimScene } from '@/lib/family/blocks';
import { SIM_TEMPLATES, simMax, simReadout, simStart, type SceneSim, type SimInput } from '@/lib/family/visuals/sims';
import { lessonColors, lessonTints } from '@/lib/design-tokens';
import { fill, type Words } from '@/lib/family/fill';
import { Card } from './BlockViews';
import { useReducedMotion } from './InteractiveViews';

// A Class 8 Science simulation in a scene block (W16-A2, docs/39 §6): the child taps a choice (a depth, a surface and a
// speed, a frequency and an amplitude) and sees what the chapter's formula gives, drawn and in words. Every value is a
// fixed choice from src/lib/family/visuals/sims.ts and every number is computed there. Its own chunk, loaded only when
// an answer carries a simulation. Motion (the sliding block, the vibrating string) is off under prefers-reduced-motion
// and on the first paint; the picture and the numbers are complete without it.

const W = 360;
const INK = lessonColors.ink;
const TEAL = lessonColors.teal;
const SAFFRON = lessonColors.saffronDeep;
const IN = 'en-IN';
const num = (v: number, places = 0) => v.toLocaleString(IN, { maximumFractionDigits: places, minimumFractionDigits: 0 });

function Choices({ sim, input, value, w, onPick }: { sim: SceneSim; input: SimInput; value: number; w: Words; onPick: (v: number) => void }) {
  const named = sim === 'friction_surface' && input.name === 'surface';
  return (
    <div role="radiogroup" aria-label={w[`fam.sim.${sim}.${input.name}`]} data-sim-input={input.name} className="flex flex-col gap-1.5">
      <span className="text-sm font-bold text-ink">{w[`fam.sim.${sim}.${input.name}`]}</span>
      <div className="flex flex-wrap gap-2">
        {input.choices.map((c) => {
          const on = c.value === value;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-sim-choice={c.id}
              onClick={() => onPick(c.value)}
              className={`fam-press min-h-[44px] min-w-[52px] rounded-full px-4 text-sm font-bold ${on ? 'bg-saffron text-ink' : 'bg-paper text-ink ring-1 ring-ink/15'}`}
            >
              {named ? fill(w[`fam.sim.${sim}.${c.id}`], { mu: c.value }) : `${num(c.value)}${input.unit ? ` ${input.unit}` : ''}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// A tank of water with depth marks 1 to 5 m; the hole at the chosen depth spurts water out, farther the deeper it is.
function PressurePicture({ depth, onPick, w }: { depth: number; onPick: (v: number) => void; w: Words }) {
  const top = 24;
  const metre = 34;
  const left = 40;
  const right = 190;
  const depths = SIM_TEMPLATES.pressure_depth[0].choices.map((c) => c.value);
  const bottom = top + metre * Math.max(...depths) + 8;
  const y = top + depth * metre;
  const r = simReadout('pressure_depth', { depth });
  const reach = (r.sim === 'pressure_depth' ? r.spurt : 0) * 14;
  return (
    <svg data-sim-picture viewBox={`0 0 ${W} ${bottom + 14}`} role="group" aria-label={fill(w['fam.sim.pressure_depth.picture'], { depth })} className="mx-auto w-full max-w-[480px]">
      <rect x={left} y={top} width={right - left} height={bottom - top} fill={lessonTints.sky.tint} stroke={INK} strokeWidth="2.5" />
      <line x1={left} y1={top} x2={right} y2={top} stroke={TEAL} strokeWidth="3" />
      {depths.map((d) => {
        const yy = top + d * metre;
        const on = d === depth;
        return (
          <g key={d} role="button" tabIndex={0} aria-pressed={on} aria-label={`${d} m`} data-sim-depth={d} onClick={() => onPick(d)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(d))} className="cursor-pointer outline-none">
            <rect x={0} y={yy - 17} width={right} height={34} fill="transparent" />
            <line x1={left} y1={yy} x2={right} y2={yy} stroke={on ? SAFFRON : INK} strokeOpacity={on ? 1 : 0.25} strokeWidth={on ? 2 : 1} strokeDasharray={on ? undefined : '4 4'} />
            <text x={left - 6} y={yy + 5} textAnchor="end" fontSize="14" fontWeight={on ? 800 : 600} fill={INK}>
              {d} m
            </text>
          </g>
        );
      })}
      <circle cx={right} cy={y} r="4" fill={SAFFRON} />
      <path data-sim-jet d={`M ${right} ${y} Q ${right + reach * 0.6} ${y} ${right + reach} ${Math.min(bottom + 10, y + 40 + reach * 0.15)}`} fill="none" stroke={TEAL} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

// A road strip in the surface's colour; a block slides from the left and stops at its stopping distance (to scale with
// the longest stop the choices give).
function FrictionPicture({ surface, metres, quiet, w, label }: { surface: string; metres: number; quiet: boolean; w: Words; label: string }) {
  const start = 24;
  const end = W - 16;
  const x = start + ((end - start - 30) * metres) / simMax('friction_surface');
  const road = surface === 'ice' ? lessonColors.card : surface === 'wet' ? lessonTints.sky.tint : lessonTints.butter.tint;
  return (
    <svg data-sim-picture viewBox={`0 0 ${W} 110`} role="img" aria-label={fill(w['fam.sim.friction_surface.picture'], { surface: label, d: num(metres, 1) })} className="mx-auto w-full max-w-[480px]">
      <rect x={start - 8} y={52} width={end - start + 16} height={34} rx="6" fill={road} stroke={INK} strokeWidth="2" />
      <line x1={start} y1={44} x2={start} y2={94} stroke={INK} strokeWidth="2" />
      <g data-sim-block style={{ transform: `translateX(${x - start}px)`, transition: quiet ? 'none' : 'transform 900ms cubic-bezier(0.2, 0.7, 0.3, 1)' }}>
        <rect x={start} y={30} width={30} height={22} rx="4" fill={lessonColors.saffron} stroke={INK} strokeWidth="2" />
      </g>
      <line x1={x + 15} y1={24} x2={x + 15} y2={96} stroke={SAFFRON} strokeWidth="2" strokeDasharray="4 3" />
      <text x={Math.min(x + 15, end - 40)} y={106} textAnchor="middle" fontSize="13" fontWeight={800} fill={INK}>
        {num(metres, 1)} m
      </text>
    </svg>
  );
}

// A string fixed at both ends, vibrating in as many loops as the frequency has hundreds of hertz, as high as the
// amplitude; it moves only when motion is allowed.
function SoundPicture({ hz, amplitude, quiet, w }: { hz: number; amplitude: number; quiet: boolean; w: Words }) {
  const x0 = 24;
  const x1 = W - 24;
  const mid = 70;
  const loops = Math.max(1, Math.round(hz / 100));
  const path = (sign: number) => {
    const seg = (x1 - x0) / loops;
    let d = `M ${x0} ${mid}`;
    // One quadratic curve a loop, each loop the other way up.
    for (let k = 0; k < loops; k++) d += ['', 'Q', x0 + seg * (k + 0.5), mid + sign * (k % 2 ? -1 : 1) * amplitude * 18, x0 + seg * (k + 1), mid].join(' ');
    return d;
  };
  const up = path(-1);
  const down = path(1);
  return (
    <svg data-sim-picture viewBox={`0 0 ${W} 140`} role="img" aria-label={fill(w['fam.sim.sound_wave.picture'], { f: hz, a: amplitude })} className="mx-auto w-full max-w-[480px]">
      <line x1={x0} y1={mid} x2={x1} y2={mid} stroke={INK} strokeOpacity="0.2" strokeWidth="1" strokeDasharray="4 4" />
      <path data-sim-string d={up} fill="none" stroke={TEAL} strokeWidth="3.5" strokeLinecap="round">
        {!quiet && <animate attributeName="d" values={`${up};${down};${up}`} dur={`${Math.max(0.12, 0.6 - loops * 0.06)}s`} repeatCount="indefinite" />}
      </path>
      <rect x={x0 - 10} y={mid - 26} width="10" height="52" rx="3" fill={INK} />
      <rect x={x1} y={mid - 26} width="10" height="52" rx="3" fill={INK} />
    </svg>
  );
}

export function SimView({ b, w, tone, still }: { b: SimScene; w: Words; tone: string; still?: boolean }) {
  const reduced = useReducedMotion();
  const quiet = still ?? reduced;
  const [values, setValues] = useState(() => simStart(b.sim, b.start));
  const pick = (name: string) => (v: number) => setValues((x) => ({ ...x, [name]: v }));
  const r = simReadout(b.sim, values);
  const inputs = SIM_TEMPLATES[b.sim];
  const say = (k: string, p: Record<string, string | number> = {}) => fill(w[`fam.sim.${b.sim}.${k}`], p);
  let picture: React.ReactNode = null;
  let lines: string[] = [];
  if (r.sim === 'pressure_depth') {
    picture = <PressurePicture depth={r.depth} onPick={pick('depth')} w={w} />;
    lines = [say('readout', { depth: num(r.depth), pa: num(r.pascals), kpa: num(r.pascals / 1000, 1) }), say('formula', { depth: num(r.depth) }), say('note')];
  } else if (r.sim === 'friction_surface') {
    const surface = inputs[0].choices.find((c) => c.value === r.mu)?.id ?? 'dry';
    const label = fill(w[`fam.sim.friction_surface.${surface}`], { mu: r.mu });
    picture = <FrictionPicture surface={surface} metres={r.metres} quiet={quiet} w={w} label={label} />;
    lines = [say('readout', { d: num(r.metres, 1), surface: label, v: num(r.speed) }), say('formula', { v: num(r.speed), mu: r.mu }), say('note')];
  } else {
    picture = <SoundPicture hz={r.hz} amplitude={r.amplitude} quiet={quiet} w={w} />;
    lines = [say('readoutPitch', { f: num(r.hz), t: num(r.period, 4) }), say('readoutLoud', { a: num(r.amplitude), x: num(r.loudness) }), say('note')];
  }
  return (
    <Card title={b.title} tone={tone} tag="scene">
      <div data-sim={b.sim} className="flex flex-col gap-3">
        {picture}
        {inputs.map((input) => (
          <Choices key={input.name} sim={b.sim} input={input} value={values[input.name]} w={w} onPick={pick(input.name)} />
        ))}
        <div data-sim-readout aria-live="polite" className="flex flex-col gap-1 rounded-2xl bg-paper p-3 ring-1 ring-ink/10">
          <p className="text-base font-extrabold text-ink">{lines[0]}</p>
          <p data-sim-formula className="text-base font-semibold text-ink">{lines[1]}</p>
          <p className="text-sm text-ink">{lines[2]}</p>
        </div>
      </div>
    </Card>
  );
}
