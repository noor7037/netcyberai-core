'use client';

import { useState } from 'react';
import type { SimScene } from '@/lib/family/blocks';
import { COIL_TURNS, MAX_CLIPS, SIM_TEMPLATES, simMax, simReadout, simStart, type SceneSim, type SimInput, type SimReadout, type Turning, type Vertical } from '@/lib/family/visuals/sims';
import { lessonColors, lessonTints } from '@/lib/design-tokens';
import { fill, type Words } from '@/lib/family/fill';
import { Card } from './BlockViews';
import { useReducedMotion } from './InteractiveViews';

// A Science simulation in a scene block (W16-A2, docs/39 §6; W18-P2 adds the circuit, the motor, the electromagnet and the
// magnet's field lines): the child taps a choice (a depth, a surface and a speed, a frequency and an amplitude, a battery and
// a bulb, a current direction, a number of turns, one magnet or two) and sees what the chapter's formula gives, drawn and in words. Every value is a
// fixed choice from src/lib/family/visuals/sims.ts and every number is computed there. Its own chunk, loaded only when
// an answer carries a simulation. Motion (the sliding block, the vibrating string) is off under prefers-reduced-motion
// and on the first paint; the picture and the numbers are complete without it. The four W18-P2 pictures never move: they
// are still drawings that change with the choices, so there is nothing to switch off.

const W = 360;
const INK = lessonColors.ink;
const TEAL = lessonColors.teal;
const SAFFRON = lessonColors.saffronDeep;
const IN = 'en-IN';
const num = (v: number, places = 0) => v.toLocaleString(IN, { maximumFractionDigits: places, minimumFractionDigits: 0 });
const PAPER = lessonColors.paper;
const CARD = lessonColors.card;

function Choices({ sim, input, value, w, onPick }: { sim: SceneSim; input: SimInput; value: number; w: Words; onPick: (v: number) => void }) {
  // Named choices: the road surfaces, and the choices that are words (series, forward, one magnet …).
  const named = (sim === 'friction_surface' && input.name === 'surface') || input.words === true;
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

// ---- W18-P2: electricity and magnets (still pictures) ----

// A tip pointing the way a field line or force goes, at (x, y); dir 1 right, -1 left.
function Head({ x, y, dir }: { x: number; y: number; dir: 1 | -1 }) {
  return <polygon points={`${x - 5 * dir},${y - 5} ${x + 6 * dir},${y} ${x - 5 * dir},${y + 5}`} fill={INK} />;
}
// A marker for the straight arrows of the motor picture.
function ArrowDefs() {
  return (
    <defs>
      <marker id="sim-head-ink" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill={INK} />
      </marker>
      <marker id="sim-head-saffron" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill={SAFFRON} />
      </marker>
      <marker id="sim-head-teal" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill={TEAL} />
      </marker>
    </defs>
  );
}

// A bulb whose fill opacity is its brightness (0 to 1), with the percentage under it as text.
function Bulb({ x, y, brightness, labelDy }: { x: number; y: number; brightness: number; labelDy: number }) {
  return (
    <g data-sim-bulb data-brightness={brightness.toFixed(3)}>
      <circle cx={x} cy={y} r="16" fill={CARD} stroke={INK} strokeWidth="2.5" />
      <circle cx={x} cy={y} r="16" fill={lessonColors.saffron} fillOpacity={0.1 + 0.9 * brightness} />
      <path d={`M ${x - 6} ${y + 7} L ${x - 3} ${y - 4} L ${x} ${y + 3} L ${x + 3} ${y - 4} L ${x + 6} ${y + 7}`} fill="none" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
      <text x={x} y={y + labelDy} textAnchor="middle" fontSize="13" fontWeight={800} fill={INK} stroke={PAPER} strokeWidth="4" paintOrder="stroke">
        {num(brightness * 100)}%
      </text>
    </g>
  );
}

// A battery on the left wire, then a loop: two bulbs in a row (series) or on two side-by-side branches (parallel).
function CircuitPicture({ r, label, w }: { r: Extract<SimReadout, { sim: 'circuit' }>; label: string; w: Words }) {
  const series = r.arrangement === 'series';
  const x0 = 80;
  const x1 = 280;
  const top = 30;
  const bottom = 140;
  const mid = 85;
  const branch = 180;
  return (
    <svg data-sim-picture viewBox={`0 0 ${W} 172`} role="img" aria-label={fill(w['fam.sim.circuit.picture'], { arr: label, v: num(r.volts), b: num(r.brightness * 100) })} className="mx-auto w-full max-w-[480px]">
      <path d={`M ${x0} ${mid - 14} V ${top} H ${x1} V ${bottom} H ${x0} V ${mid + 14}`} fill="none" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      {!series && <path d={`M ${branch} ${top} V ${bottom}`} fill="none" stroke={INK} strokeWidth="2.5" />}
      <line x1={x0 - 18} y1={mid - 8} x2={x0 + 18} y2={mid - 8} stroke={INK} strokeWidth="3" />
      <line x1={x0 - 9} y1={mid + 6} x2={x0 + 9} y2={mid + 6} stroke={INK} strokeWidth="7" />
      <text x={x0 - 24} y={mid + 5} textAnchor="end" fontSize="14" fontWeight={800} fill={INK}>
        {num(r.volts)} V
      </text>
      {series ? (
        <>
          <Bulb x={130} y={top} brightness={r.brightness} labelDy={34} />
          <Bulb x={230} y={top} brightness={r.brightness} labelDy={34} />
        </>
      ) : (
        <>
          <Bulb x={branch} y={mid} brightness={r.brightness} labelDy={34} />
          <Bulb x={x1} y={mid} brightness={r.brightness} labelDy={34} />
        </>
      )}
    </svg>
  );
}

// A symbol for a wire's cross-section: a dot when the current comes out of the page, a cross when it goes in.
function WireEnd({ x, y, out }: { x: number; y: number; out: boolean }) {
  return (
    <g data-sim-wire={out ? 'out' : 'in'}>
      <circle cx={x} cy={y} r="11" fill={CARD} stroke={INK} strokeWidth="2.5" />
      {out ? <circle cx={x} cy={y} r="3.5" fill={INK} /> : <path d={`M ${x - 5} ${y - 5} L ${x + 5} ${y + 5} M ${x + 5} ${y - 5} L ${x - 5} ${y + 5}`} stroke={INK} strokeWidth="2.2" strokeLinecap="round" />}
    </g>
  );
}

// A coil seen end-on between the poles: the current in its two sides (dot, cross), the force on each side, and the way
// it turns. N is on the left when the field runs left to right.
function MotorPicture({ forward, ltr, right, left, rotation, label }: { forward: boolean; ltr: boolean; right: Vertical; left: Vertical; rotation: Turning; label: string }) {
  const cy = 100;
  const lx = 130;
  const rx = 230;
  const force = (x: number, dir: Vertical) => (
    <g data-sim-force={dir}>
      <line x1={x} y1={dir === 'up' ? cy - 14 : cy + 14} x2={x} y2={dir === 'up' ? cy - 48 : cy + 48} stroke={SAFFRON} strokeWidth="3.5" markerEnd="url(#sim-head-saffron)" />
      <text x={x + 12} y={dir === 'up' ? cy - 32 : cy + 38} fontSize="14" fontWeight={800} fill={INK}>
        F
      </text>
    </g>
  );
  const anti = rotation === 'anticlockwise';
  const topArc = anti ? 'M 208 78 A 36 36 0 0 0 152 78' : 'M 152 78 A 36 36 0 0 1 208 78';
  const bottomArc = anti ? 'M 152 122 A 36 36 0 0 0 208 122' : 'M 208 122 A 36 36 0 0 1 152 122';
  return (
    <svg data-sim-picture viewBox={`0 0 ${W} 200`} role="img" aria-label={label} className="mx-auto w-full max-w-[480px]">
      <ArrowDefs />
      <rect x="10" y="36" width="56" height="128" rx="6" fill={ltr ? lessonColors.saffron : lessonColors.teal} stroke={INK} strokeWidth="2.5" />
      <rect x="294" y="36" width="56" height="128" rx="6" fill={ltr ? lessonColors.teal : lessonColors.saffron} stroke={INK} strokeWidth="2.5" />
      <text x="38" y="108" textAnchor="middle" fontSize="26" fontWeight={900} fill={ltr ? INK : CARD}>
        {ltr ? 'N' : 'S'}
      </text>
      <text x="322" y="108" textAnchor="middle" fontSize="26" fontWeight={900} fill={ltr ? CARD : INK}>
        {ltr ? 'S' : 'N'}
      </text>
      <line x1={ltr ? 76 : 284} y1="50" x2={ltr ? 284 : 76} y2="50" stroke={INK} strokeWidth="2.5" markerEnd="url(#sim-head-ink)" />
      <line x1={ltr ? 76 : 284} y1="150" x2={ltr ? 284 : 76} y2="150" stroke={INK} strokeWidth="2.5" markerEnd="url(#sim-head-ink)" />
      <line x1={lx} y1={cy} x2={rx} y2={cy} stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <WireEnd x={lx} y={cy} out={!forward} />
      <WireEnd x={rx} y={cy} out={forward} />
      {force(lx, left)}
      {force(rx, right)}
      <path data-sim-turn={rotation} d={topArc} fill="none" stroke={TEAL} strokeWidth="3.5" markerEnd="url(#sim-head-teal)" />
      <path d={bottomArc} fill="none" stroke={TEAL} strokeWidth="3.5" markerEnd="url(#sim-head-teal)" />
    </svg>
  );
}

// A coil of turns around an iron nail, a battery in the loop, the strength as a bar and the clips it lifts.
function ElectromagnetPicture({ turns, amps, strength, clips, w, label }: { turns: number; amps: number; strength: number; clips: number; w: Words; label: string }) {
  const cx = 110;
  const loops = Math.round(3 + (9 * Math.log(turns / COIL_TURNS[0])) / Math.log(COIL_TURNS[COIL_TURNS.length - 1] / COIL_TURNS[0]));
  const y0 = 52;
  const y1 = 122;
  const step = (y1 - y0) / (loops - 1);
  const barX = 215;
  const barW = 120;
  const cols = 4;
  const rows = Math.ceil(MAX_CLIPS / cols);
  return (
    <svg data-sim-picture viewBox={`0 0 ${W} ${150 + rows * 24 + 10}`} role="img" aria-label={label} className="mx-auto w-full max-w-[480px]">
      <rect x={cx - 8} y="40" width="16" height="100" fill={lessonColors.line} stroke={INK} strokeWidth="2.5" />
      <rect x={cx - 14} y="34" width="28" height="8" rx="2" fill={lessonColors.line} stroke={INK} strokeWidth="2.5" />
      {Array.from({ length: loops }, (_, k) => (
        <ellipse key={k} cx={cx} cy={y0 + k * step} rx="18" ry="5" fill="none" stroke={SAFFRON} strokeWidth="3" />
      ))}
      <path d={`M ${cx - 18} ${y0} H 46 V 78 M 46 92 V ${y1} H ${cx + 18}`} fill="none" stroke={INK} strokeWidth="2.5" />
      <line x1="36" y1="80" x2="56" y2="80" stroke={INK} strokeWidth="3" />
      <line x1="41" y1="90" x2="51" y2="90" stroke={INK} strokeWidth="7" />
      <text x="46" y="38" textAnchor="middle" fontSize="14" fontWeight={800} fill={INK}>
        {num(amps, 1)} A
      </text>
      <text x={barX} y="76" fontSize="14" fontWeight={800} fill={INK}>
        {w['fam.sim.electromagnet.strength']}
      </text>
      <rect x={barX} y="84" width={barW} height="20" rx="4" fill={CARD} stroke={INK} strokeWidth="2" />
      <rect data-sim-bar x={barX} y="84" width={Math.max(0, barW * strength)} height="20" rx="4" fill={TEAL} />
      <text x={barX} y="124" fontSize="14" fontWeight={800} fill={INK}>
        {num(strength * 100)}%
      </text>
      {Array.from({ length: clips }, (_, k) => (
        <rect key={k} data-sim-clip x={cx - (cols * 15) / 2 + (k % cols) * 15 + 2} y={150 + Math.floor(k / cols) * 24} width="10" height="19" rx="5" fill="none" stroke={INK} strokeWidth="2" />
      ))}
    </svg>
  );
}

// A bar magnet (N half saffron, S half teal) from x to x + 90, N on the left or the right.
function Bar({ x, nLeft }: { x: number; nLeft: boolean }) {
  const cy = 85;
  const half = 45;
  const leftN = nLeft;
  return (
    <g data-sim-magnet>
      <rect x={x} y={cy - 17} width={half} height="34" fill={leftN ? lessonColors.saffron : lessonColors.teal} stroke={INK} strokeWidth="2.5" />
      <rect x={x + half} y={cy - 17} width={half} height="34" fill={leftN ? lessonColors.teal : lessonColors.saffron} stroke={INK} strokeWidth="2.5" />
      <text x={x + half / 2} y={cy + 7} textAnchor="middle" fontSize="20" fontWeight={900} fill={leftN ? INK : CARD}>
        {leftN ? 'N' : 'S'}
      </text>
      <text x={x + half * 1.5} y={cy + 7} textAnchor="middle" fontSize="20" fontWeight={900} fill={leftN ? CARD : INK}>
        {leftN ? 'S' : 'N'}
      </text>
    </g>
  );
}

// Field lines from N to S: one magnet (arches over and under), unlike poles facing (join across the gap, and arch over
// both), like poles facing (each magnet's lines bend back on itself, away from the other).
function MagnetPicture({ pattern, label }: { pattern: 'around' | 'join' | 'apart'; label: string }) {
  const cy = 85;
  const line = { fill: 'none', stroke: INK, strokeWidth: 2, strokeLinecap: 'round' as const };
  const out: React.ReactNode[] = [];
  if (pattern === 'around') {
    // Magnet from 135 to 225, N on the left; every line leaves N and enters S, the arrow at the top and bottom middle.
    for (const h of [20, 38, 56]) {
      for (const sgn of [-1, 1]) {
        const k = 1.35 * h * sgn;
        out.push(<path key={`a${h}${sgn}`} d={`M 135 ${cy} C ${135 - 20 - h * 0.3} ${cy + k}, ${225 + 20 + h * 0.3} ${cy + k}, 225 ${cy}`} {...line} />);
        out.push(<Head key={`h${h}${sgn}`} x={180} y={cy + 0.75 * k} dir={1} />);
      }
    }
    out.push(<Bar key="m" x={135} nLeft />);
  } else if (pattern === 'join') {
    // Unlike poles facing: A is N-S, B is N-S, so A's S (x 115) faces B's N (x 245); the lines run from B's N to A's S.
    for (const o of [-24, 0, 24]) {
      out.push(<path key={`g${o}`} d={`M 245 ${cy + o} C 215 ${cy + o * 1.8}, 145 ${cy + o * 1.8}, 115 ${cy + o}`} {...line} />);
      out.push(<Head key={`gh${o}`} x={180} y={cy + o * 1.35} dir={-1} />);
    }
    for (const h of [46, 64]) {
      for (const sgn of [-1, 1]) {
        const k = 1.35 * h * sgn;
        out.push(<path key={`o${h}${sgn}`} d={`M 25 ${cy} C ${25 - 10} ${cy + k}, ${335 + 10} ${cy + k}, 335 ${cy}`} {...line} />);
        out.push(<Head key={`oh${h}${sgn}`} x={180} y={cy + 0.75 * k} dir={1} />);
      }
    }
    out.push(<Bar key="a" x={25} nLeft />, <Bar key="b" x={245} nLeft />);
    out.push(
      <line key="f1" x1="132" y1="156" x2="168" y2="156" stroke={SAFFRON} strokeWidth="3.5" markerEnd="url(#sim-head-saffron)" />,
      <line key="f2" x1="228" y1="156" x2="192" y2="156" stroke={SAFFRON} strokeWidth="3.5" markerEnd="url(#sim-head-saffron)" />
    );
  } else {
    // Like poles facing: A is S-N and B is N-S, so both N poles face each other; each magnet's lines return on its own side.
    for (const h of [22, 42]) {
      for (const sgn of [-1, 1]) {
        const k = 1.35 * h * sgn;
        out.push(<path key={`l${h}${sgn}`} d={`M 115 ${cy} C 130 ${cy + k}, 10 ${cy + k}, 25 ${cy}`} {...line} />);
        out.push(<Head key={`lh${h}${sgn}`} x={70} y={cy + 0.75 * k} dir={-1} />);
        out.push(<path key={`r${h}${sgn}`} d={`M 245 ${cy} C 230 ${cy + k}, 350 ${cy + k}, 335 ${cy}`} {...line} />);
        out.push(<Head key={`rh${h}${sgn}`} x={290} y={cy + 0.75 * k} dir={1} />);
      }
    }
    out.push(<Bar key="a" x={25} nLeft={false} />, <Bar key="b" x={245} nLeft />);
    out.push(
      <line key="f1" x1="168" y1="156" x2="132" y2="156" stroke={SAFFRON} strokeWidth="3.5" markerEnd="url(#sim-head-saffron)" />,
      <line key="f2" x1="192" y1="156" x2="228" y2="156" stroke={SAFFRON} strokeWidth="3.5" markerEnd="url(#sim-head-saffron)" />
    );
  }
  return (
    <svg data-sim-picture data-pattern={pattern} viewBox={`0 0 ${W} 172`} role="img" aria-label={label} className="mx-auto w-full max-w-[480px]">
      <ArrowDefs />
      {out}
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
  } else if (r.sim === 'circuit') {
    const arr = say(r.arrangement);
    picture = <CircuitPicture r={r} label={arr} w={w} />;
    lines = [
      say(r.arrangement === 'series' ? 'readoutSeries' : 'readoutParallel', { i: num(r.amps, 2), ib: num(r.bulbAmps, 2), vb: num(r.bulbVolts, 1) }),
      say('formula', { v: num(r.volts), rt: num(r.totalOhms, 1), i: num(r.amps, 2), r: num(r.ohms) }),
      say('bright', { p: num(r.bulbWatts, 2), b: num(r.brightness * 100) }),
      say('note'),
    ];
  } else if (r.sim === 'dc_motor') {
    const side = { r: say(r.right), l: say(r.left), rot: say(r.rotation) };
    picture = <MotorPicture forward={r.current === 'forward'} ltr={r.field === 'ltr'} right={r.right} left={r.left} rotation={r.rotation} label={say('picture', side)} />;
    lines = [say('readout', side), say('formula', side), say('note')];
  } else if (r.sim === 'electromagnet') {
    const label = say('picture', { n: num(r.turns), i: num(r.amps, 1), c: num(r.clips) });
    picture = <ElectromagnetPicture turns={r.turns} amps={r.amps} strength={r.strength} clips={r.clips} w={w} label={label} />;
    lines = [say('readout', { n: num(r.turns), i: num(r.amps, 1), at: num(r.ampereTurns, 1), pct: num(r.strength * 100) }), say('formula'), say('clips', { c: num(r.clips) }), say('note')];
  } else if (r.sim === 'magnet_field') {
    // The word-file ids for each pattern (keys, not words): what the picture shows and what the readout says.
    const ids = { around: { picture: 'pictureOne', readout: 'readoutOne' }, join: { picture: 'pictureUnlike', readout: 'readoutUnlike' }, apart: { picture: 'pictureLike', readout: 'readoutLike' } }[r.pattern];
    picture = <MagnetPicture pattern={r.pattern} label={say('picture', { what: say(ids.picture) })} />;
    lines = [say(ids.readout), say('formula'), say('note')];
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
          {lines.slice(2).map((l, k) => (
            <p key={k} className="text-sm text-ink">
              {l}
            </p>
          ))}
        </div>
      </div>
    </Card>
  );
}
