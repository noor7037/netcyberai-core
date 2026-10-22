'use client';

import { subjectColour } from '@/lib/family/subject-colours';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { colors, deepColors } from '@/lib/design-tokens';
import type { FractionModel, Geometry, Graph, Interactive, NumberLine, Simulation } from '@/lib/family/blocks';
import { fill, type Words } from '@/lib/family/fill';
import {
  G,
  SIM_INPUTS,
  angleKind,
  chord,
  circleArea,
  circumference,
  compareFractions,
  equationText,
  graphPoints,
  graphWindow,
  num,
  ohmsCurrent,
  pendulumPeriod,
  projectile,
  refraction,
  plotPoints,
  triangleAngles,
  type Fraction,
} from '@/lib/family/interactive';
import { Card } from './BlockViews';

// The interactive blocks (M2-8, C282): SVG drawn by React from the checked fields, every value computed by our code
// (src/lib/family/interactive.ts). No animation or charting library. Sliders are native range inputs with labels;
// the values are written beside the picture for screen readers. Motion only after the child presses play, and never
// under prefers-reduced-motion (a still picture with the same computed values).

const ink = colors.slate;
const accent = deepColors.tangerineDeep;
const toneColor = (tone: string) => subjectColour(tone).hex;
// SVG path data from its commands and numbers.
const svgPath = (...parts: (string | number)[]) => parts.join(' ');

// A 44 px target with a 24 px visible thumb (the transparent border is part of the target).
const SLIDER =
  'h-11 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal ' +
  '[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-slate/20 ' +
  '[&::-webkit-slider-thumb]:-mt-[18px] [&::-webkit-slider-thumb]:h-11 [&::-webkit-slider-thumb]:w-11 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[10px] [&::-webkit-slider-thumb]:border-solid [&::-webkit-slider-thumb]:border-transparent [&::-webkit-slider-thumb]:bg-royal [&::-webkit-slider-thumb]:bg-clip-padding ' +
  '[&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-slate/20 ' +
  '[&::-moz-range-thumb]:h-11 [&::-moz-range-thumb]:w-11 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[10px] [&::-moz-range-thumb]:border-solid [&::-moz-range-thumb]:border-transparent [&::-moz-range-thumb]:bg-royal [&::-moz-range-thumb]:bg-clip-padding';

export function useReducedMotion(): boolean {
  // Still until the browser says otherwise: the first paint never moves.
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}

// Seconds since play was pressed, while playing; 0 when stopped.
function useClock(playing: boolean): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!playing) {
      setT(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setT((now - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  return t;
}

function Slider({ label, value, min, max, step, onChange, unit = '' }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; unit?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="flex items-baseline justify-between gap-3 text-sm font-bold text-slate">
        <span>{label}</span>
        <span lang="en" className="font-mono">
          {num(value)}
          {unit}
        </span>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className={SLIDER} />
    </div>
  );
}

function Values({ lines }: { lines: string[] }) {
  return (
    <ul className="flex flex-col gap-1 rounded-2xl bg-off-white p-3 text-base text-slate" aria-live="polite">
      {lines.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}

function PlayButton({ playing, onToggle, w }: { playing: boolean; onToggle: () => void; w: Words }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={playing} className="flex min-h-[44px] items-center gap-2 self-start rounded-full bg-royal px-5 text-sm font-bold text-white">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        {playing ? <path d="M6 5h4v14H6zM14 5h4v14h-4z" /> : <path d="M7 4l13 8-13 8z" />}
      </svg>
      {playing ? w['fam.block.sim.pause'] : w['fam.block.sim.play']}
    </button>
  );
}

export function InteractiveView({ b, w, tone }: { b: Interactive; w: Words; tone: string }) {
  switch (b.type) {
    case 'graph':
      return <GraphView b={b} w={w} tone={tone} />;
    case 'number_line':
      return <NumberLineView b={b} w={w} tone={tone} />;
    case 'fraction_model':
      return <FractionModelView b={b} w={w} tone={tone} />;
    case 'geometry':
      return <GeometryView b={b} w={w} tone={tone} />;
    case 'simulation':
      return <SimulationView b={b} w={w} tone={tone} />;
  }
}

// ---- graph ----

export function GraphView({ b, w, tone }: { b: Graph; w: Words; tone: string }) {
  const [params, setParams] = useState(b.params);
  const win = useMemo(() => graphWindow(b.fn, b.params, b.xFrom, b.xTo), [b]);
  const W = 320;
  const H = 240;
  const pad = 24;
  const sx = (x: number) => pad + ((x - b.xFrom) / (b.xTo - b.xFrom)) * (W - 2 * pad);
  const sy = (y: number) => H - pad - ((y - win.yFrom) / (win.yTo - win.yFrom)) * (H - 2 * pad);
  // Broken where the function has no value, where it leaves the window far, and across x = 0 for y = k/x.
  let d = '';
  let pen = false;
  let lastX: number | null = null;
  for (const p of graphPoints(b.fn, params, b.xFrom, b.xTo)) {
    const jump = p !== null && b.fn === 'inverse' && lastX !== null && Math.sign(lastX) !== Math.sign(p.x);
    if (p === null || Math.abs(p.y) > 1000 || jump) {
      pen = false;
      lastX = p?.x ?? null;
      if (p === null || Math.abs(p.y) > 1000) continue;
    }
    d += `${pen ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)} `;
    pen = true;
    lastX = p.x;
  }
  const eq = equationText(b.fn, params);
  const color = toneColor(tone);
  const clip = useId().replace(/:/g, '');
  return (
    <Card title={b.title} tone={tone} tag="graph">
      <p lang="en" className="font-mono text-lg font-bold text-slate">
        {eq}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-md" role="img" aria-label={fill(w['fam.block.graph.picture'], { equation: eq })}>
        <defs>
          <clipPath id={clip}>
            <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} />
          </clipPath>
        </defs>
        <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} fill="none" stroke={ink} strokeOpacity="0.15" />
        {b.xFrom <= 0 && b.xTo >= 0 && <line x1={sx(0)} y1={pad} x2={sx(0)} y2={H - pad} stroke={ink} strokeOpacity="0.6" />}
        {win.yFrom <= 0 && win.yTo >= 0 && <line x1={pad} y1={sy(0)} x2={W - pad} y2={sy(0)} stroke={ink} strokeOpacity="0.6" />}
        <text x={pad} y={H - 6} fontSize="11" fill={ink}>
          {num(b.xFrom)}
        </text>
        <text x={W - pad} y={H - 6} fontSize="11" fill={ink} textAnchor="end">
          {num(b.xTo)}
        </text>
        <text x={4} y={pad + 4} fontSize="11" fill={ink}>
          {num(win.yTo)}
        </text>
        <text x={4} y={H - pad} fontSize="11" fill={ink}>
          {num(win.yFrom)}
        </text>
        <path d={d} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" clipPath={`url(#${clip})`} />
      </svg>
      {b.sliders.map((s) => (
        <Slider key={s.param} label={fill(w['fam.block.graph.slider'], { name: s.param })} value={params[s.param]} min={s.min} max={s.max} step={s.step} onChange={(v) => setParams((p) => ({ ...p, [s.param]: v }))} />
      ))}
      <Values
        lines={plotPoints(b.fn, params, b.xFrom, b.xTo).map((p) => (p.y === null ? fill(w['fam.block.graph.noValue'], { x: num(p.x) }) : fill(w['fam.block.graph.point'], { x: num(p.x), y: num(p.y) })))}
      />
    </Card>
  );
}

// ---- number line ----

export function NumberLineView({ b, w, tone }: { b: NumberLine; w: Words; tone: string }) {
  const W = 320;
  const pad = 20;
  const y = 56;
  const sx = (v: number) => pad + ((v - b.from) / (b.to - b.from)) * (W - 2 * pad);
  const count = Math.round((b.to - b.from) / b.step);
  const every = Math.ceil(count / 10);
  const color = toneColor(tone);
  const iv = b.interval;
  const lines = b.marks.map((m) => fill(w['fam.block.numberLine.mark'], { label: m.label ?? num(m.value), value: num(m.value) }));
  if (iv)
    lines.push(
      fill(w['fam.block.numberLine.interval'], {
        from: num(iv.from),
        to: num(iv.to),
        fromEnd: iv.closedFrom ? w['fam.block.numberLine.included'] : w['fam.block.numberLine.excluded'],
        toEnd: iv.closedTo ? w['fam.block.numberLine.included'] : w['fam.block.numberLine.excluded'],
      })
    );
  return (
    <Card title={b.title} tone={tone} tag="number_line">
      <svg viewBox={`0 0 ${W} 96`} className="mx-auto w-full max-w-xl" role="img" aria-label={fill(w['fam.block.numberLine.picture'], { from: num(b.from), to: num(b.to) })}>
        <line x1={pad - 10} y1={y} x2={W - pad + 10} y2={y} stroke={ink} strokeWidth="2" />
        {Array.from({ length: count + 1 }, (_, i) => {
          const v = b.from + i * b.step;
          return (
            <g key={i}>
              <line x1={sx(v)} y1={y - 6} x2={sx(v)} y2={y + 6} stroke={ink} strokeWidth="1.5" />
              {i % every === 0 && (
                <text x={sx(v)} y={y + 22} fontSize="11" textAnchor="middle" fill={ink}>
                  {num(v, 3)}
                </text>
              )}
            </g>
          );
        })}
        {iv && (
          <g>
            <line x1={sx(iv.from)} y1={y} x2={sx(iv.to)} y2={y} stroke={color} strokeWidth="6" strokeLinecap="butt" />
            {[
              [iv.from, iv.closedFrom],
              [iv.to, iv.closedTo],
            ].map(([v, closed], i) => (
              <circle key={i} cx={sx(v as number)} cy={y} r="6" fill={closed ? color : 'white'} stroke={color} strokeWidth="2.5" />
            ))}
          </g>
        )}
        {b.marks.map((m, i) => (
          <g key={i}>
            <circle cx={sx(m.value)} cy={y} r="5" fill={accent} />
            <text x={sx(m.value)} y={y - 14} fontSize="12" fontWeight="700" textAnchor="middle" fill={accent}>
              {m.label ?? num(m.value)}
            </text>
          </g>
        ))}
      </svg>
      {iv && (
        <p lang="en" className="font-mono text-base font-bold text-slate">
          {`${iv.closedFrom ? '[' : '('}${num(iv.from)}, ${num(iv.to)}${iv.closedTo ? ']' : ')'}`}
        </p>
      )}
      <Values lines={lines} />
    </Card>
  );
}

// ---- fraction model ----

function FractionPicture({ f, shape, color, label }: { f: Fraction; shape: 'bar' | 'circle'; color: string; label: string }) {
  if (shape === 'bar') {
    const wEach = 280 / f.d;
    return (
      <svg viewBox="0 0 300 56" className="w-full max-w-md" role="img" aria-label={label}>
        {Array.from({ length: f.d }, (_, i) => (
          <rect key={i} x={10 + i * wEach} y={8} width={wEach} height={40} fill={i < f.n ? color : 'white'} stroke={ink} strokeWidth="1.5" />
        ))}
      </svg>
    );
  }
  const r = 60;
  const c = 70;
  const pt = (k: number) => [c + r * Math.sin((2 * Math.PI * k) / f.d), c - r * Math.cos((2 * Math.PI * k) / f.d)];
  return (
    <svg viewBox="0 0 140 140" className="w-36" role="img" aria-label={label}>
      {f.d === 1 ? (
        <circle cx={c} cy={c} r={r} fill={f.n === 1 ? color : 'white'} stroke={ink} strokeWidth="1.5" />
      ) : (
        Array.from({ length: f.d }, (_, i) => {
          const [x1, y1] = pt(i);
          const [x2, y2] = pt(i + 1);
          return <path key={i} d={svgPath('M', c, c, 'L', x1.toFixed(2), y1.toFixed(2), 'A', r, r, 0, 0, 1, x2.toFixed(2), y2.toFixed(2), 'Z')} fill={i < f.n ? color : 'white'} stroke={ink} strokeWidth="1.5" />;
        })
      )}
    </svg>
  );
}

export function FractionModelView({ b, w, tone }: { b: FractionModel; w: Words; tone: string }) {
  const [fs, setFs] = useState(b.fractions);
  const color = toneColor(tone);
  const txt = (f: Fraction) => `${f.n}/${f.d}`;
  const lines = fs.map((f) => `${txt(f)}: ${fill(w['fam.block.fraction.picture'], { n: f.n, d: f.d })}`);
  if (fs.length === 2) {
    const [a, c] = fs;
    const cmp = compareFractions(a, c);
    lines.push(cmp === 0 ? fill(w['fam.block.fraction.equal'], { a: txt(a), b: txt(c) }) : fill(w['fam.block.fraction.larger'], cmp > 0 ? { a: txt(a), b: txt(c) } : { a: txt(c), b: txt(a) }));
    lines.push(fill(w['fam.block.fraction.why'], { left: `${a.n} × ${c.d} = ${a.n * c.d}`, right: `${c.n} × ${a.d} = ${c.n * a.d}` }));
  }
  return (
    <Card title={b.title} tone={tone} tag="fraction_model">
      <div className={`flex flex-col gap-4 ${b.shape === 'circle' ? 'sm:flex-row sm:justify-around' : ''}`}>
        {fs.map((f, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <p lang="en" className="font-mono text-xl font-bold text-slate">
              {txt(f)}
            </p>
            <FractionPicture f={f} shape={b.shape} color={i === 0 ? color : accent} label={fill(w['fam.block.fraction.picture'], { n: f.n, d: f.d })} />
            <div className="w-full max-w-md">
              <Slider label={fill(w['fam.block.fraction.slider'], { k: i + 1 })} value={f.n} min={0} max={f.d} step={1} onChange={(v) => setFs((all) => all.map((x, j) => (j === i ? { ...x, n: v } : x)))} />
            </div>
          </div>
        ))}
      </div>
      <Values lines={lines} />
    </Card>
  );
}

// ---- geometry ----

export function GeometryView({ b, w, tone }: { b: Geometry; w: Words; tone: string }) {
  const color = toneColor(tone);
  const [deg, setDeg] = useState(b.shape.kind === 'angle' ? b.shape.degrees : 60);
  const s = b.shape;
  if (s.kind === 'angle') {
    const vx = 160;
    const vy = 120;
    const len = 110;
    const rad = (deg * Math.PI) / 180;
    const ex = vx + len * Math.cos(rad);
    const ey = vy - len * Math.sin(rad);
    const ar = 32;
    const arc = svgPath('M', vx + ar, vy, 'A', ar, ar, 0, deg > 180 ? 1 : 0, 0, (vx + ar * Math.cos(rad)).toFixed(2), (vy - ar * Math.sin(rad)).toFixed(2));
    return (
      <Card title={b.title} tone={tone} tag="geometry">
        <svg viewBox="0 0 320 240" className="mx-auto w-full max-w-sm" role="img" aria-label={fill(w['fam.block.geo.anglePicture'], { deg: num(deg) })}>
          <line x1={vx} y1={vy} x2={vx + len} y2={vy} stroke={ink} strokeWidth="3" strokeLinecap="round" />
          <line x1={vx} y1={vy} x2={ex} y2={ey} stroke={color} strokeWidth="3" strokeLinecap="round" />
          {deg === 90 ? <path d={svgPath('M', vx + 16, vy, 'V', vy - 16, 'H', vx)} fill="none" stroke={accent} strokeWidth="2" /> : <path d={arc} fill="none" stroke={accent} strokeWidth="2.5" />}
          <text x={vx - 10} y={vy + 18} fontSize="13" fontWeight="700" fill={ink} textAnchor="end">
            {b.labels[0] ?? ''}
          </text>
        </svg>
        <Slider label={w['fam.block.geo.slider']} value={deg} min={1} max={359} step={1} unit="°" onChange={setDeg} />
        <Values lines={[fill(w['fam.block.geo.angle'], { deg: num(deg), kind: w[`fam.block.geo.kind.${angleKind(deg)}`] })]} />
      </Card>
    );
  }
  if (s.kind === 'triangle') {
    const [a, bb, c] = s.sides;
    const [A, B, C] = triangleAngles(a, bb, c);
    // A at the origin, B along the base (side c), C from the cosine rule; then fitted into the box.
    const cx = (bb * bb + c * c - a * a) / (2 * c);
    const cy = Math.sqrt(Math.max(0, bb * bb - cx * cx));
    const minX = Math.min(0, cx);
    const maxX = Math.max(c, cx);
    const k = Math.min(260 / (maxX - minX), 180 / Math.max(cy, 1e-9));
    const P = (x: number, y: number) => [30 + (x - minX) * k, 210 - y * k] as const;
    const pa = P(0, 0);
    const pb = P(c, 0);
    const pc = P(cx, cy);
    const [la, lb, lc] = [b.labels[0] ?? 'A', b.labels[1] ?? 'B', b.labels[2] ?? 'C'];
    return (
      <Card title={b.title} tone={tone} tag="geometry">
        <svg viewBox="0 0 320 240" className="mx-auto w-full max-w-sm" role="img" aria-label={fill(w['fam.block.geo.trianglePicture'], { a: num(a), b: num(bb), c: num(c) })}>
          <polygon points={`${pa.join(',')} ${pb.join(',')} ${pc.join(',')}`} fill={color} fillOpacity="0.12" stroke={color} strokeWidth="3" strokeLinejoin="round" />
          {[
            [pa, la, -12, 16],
            [pb, lb, 12, 16],
            [pc, lc, 0, -10],
          ].map(([p, l, dx, dy], i) => (
            <text key={i} x={(p as readonly number[])[0] + (dx as number)} y={(p as readonly number[])[1] + (dy as number)} fontSize="14" fontWeight="700" textAnchor="middle" fill={ink}>
              {l as string}
            </text>
          ))}
        </svg>
        <Values
          lines={[
            fill(w['fam.block.geo.sides'], { a: num(a), b: num(bb), c: num(c) }),
            fill(w['fam.block.geo.angles'], { A: la, B: lb, C: lc, x: num(A, 1), y: num(B, 1), z: num(C, 1), sum: num(A + B + C, 1) }),
          ]}
        />
      </Card>
    );
  }
  const r = s.radius;
  const scale = 90 / r;
  const ch = s.chord !== undefined ? chord(r, s.chord) : null;
  const half = s.chord !== undefined ? (s.chord / 2) * scale : 0;
  const dy = ch ? ch.fromCentre * scale : 0;
  const lines = [fill(w['fam.block.geo.circle'], { r: num(r), c: num(circumference(r)), area: num(circleArea(r)) })];
  if (ch && s.chord !== undefined) lines.push(fill(w['fam.block.geo.chord'], { c: num(s.chord), d: num(ch.fromCentre), t: num(ch.centralAngle, 1) }));
  return (
    <Card title={b.title} tone={tone} tag="geometry">
      <svg viewBox="0 0 320 220" className="mx-auto w-full max-w-sm" role="img" aria-label={fill(w['fam.block.geo.circlePicture'], { r: num(r) })}>
        <circle cx="160" cy="110" r="90" fill={color} fillOpacity="0.08" stroke={color} strokeWidth="3" />
        <circle cx="160" cy="110" r="3.5" fill={ink} />
        <line x1="160" y1="110" x2="250" y2="110" stroke={ink} strokeWidth="2" />
        <text x="205" y="104" fontSize="12" fontWeight="700" textAnchor="middle" fill={ink}>
          {`r = ${num(r)}`}
        </text>
        {ch && (
          <g>
            <line x1={160 - half} y1={110 + dy} x2={160 + half} y2={110 + dy} stroke={accent} strokeWidth="3" />
            <line x1="160" y1="110" x2="160" y2={110 + dy} stroke={accent} strokeWidth="1.5" strokeDasharray="4 4" />
          </g>
        )}
        <text x="152" y="104" fontSize="13" fontWeight="700" textAnchor="end" fill={ink}>
          {b.labels[0] ?? ''}
        </text>
      </svg>
      <Values lines={lines} />
    </Card>
  );
}

// ---- simulations ----

export function SimulationView({ b, w, tone }: { b: Simulation; w: Words; tone: string }) {
  const [v, setV] = useState(b.values);
  const [playing, setPlaying] = useState(false);
  const reduced = useReducedMotion();
  const moves = b.sim === 'pendulum' || b.sim === 'projectile';
  const t = useClock(playing && !reduced);
  const color = toneColor(tone);
  // A change of value starts the picture again from rest.
  const set = (name: string) => (x: number) => {
    setPlaying(false);
    setV((old) => ({ ...old, [name]: x }));
  };
  useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);
  const proj = b.sim === 'projectile' ? projectile(v.speed, v.angle) : null;
  // The ball lands: the flight is over.
  const landed = proj !== null && playing && t >= proj.flightTime;
  const stopped = useRef(false);
  useEffect(() => {
    if (landed && !stopped.current) {
      stopped.current = true;
      setPlaying(false);
    }
    if (!landed) stopped.current = false;
  }, [landed]);
  const inputs = SIM_INPUTS[b.sim];
  const label = (name: string) => w[`fam.block.sim.${b.sim}.${name}`];
  let picture: React.ReactNode = null;
  let lines: string[] = [];
  let formula = '';

  if (b.sim === 'pendulum') {
    const T = pendulumPeriod(v.length);
    const amp = 15;
    const angle = playing ? amp * Math.cos((2 * Math.PI * t) / T) : amp;
    const rod = 40 + (v.length / 5) * 150;
    picture = (
      <svg viewBox="0 0 320 220" className="mx-auto w-full max-w-sm" role="img" aria-label={fill(w['fam.block.sim.pendulum.picture'], { l: num(v.length) })}>
        <line x1="100" y1="16" x2="220" y2="16" stroke={ink} strokeWidth="4" strokeLinecap="round" />
        <line x1="160" y1="16" x2="160" y2={16 + rod} stroke={ink} strokeOpacity="0.25" strokeDasharray="4 5" />
        <g style={{ transform: `rotate(${angle.toFixed(2)}deg)`, transformOrigin: '160px 16px' }}>
          <line x1="160" y1="16" x2="160" y2={16 + rod} stroke={ink} strokeWidth="2" />
          <circle cx="160" cy={16 + rod} r="12" fill={color} />
        </g>
      </svg>
    );
    lines = [fill(w['fam.block.sim.pendulum.period'], { t: num(T) })];
    formula = w['fam.block.sim.pendulum.formula'];
  } else if (b.sim === 'projectile' && proj) {
    // Fitted to this throw: range across, peak up; the ball moves along the same path in real time when played.
    const W = 320;
    const H = 200;
    const pad = 20;
    const k = Math.min((W - 2 * pad) / proj.range, (H - 2 * pad) / Math.max(proj.peak, 1e-9));
    const rad = (v.angle * Math.PI) / 180;
    const at = (time: number) => [pad + v.speed * Math.cos(rad) * time * k, H - pad - (v.speed * Math.sin(rad) * time - (G * time * time) / 2) * k] as const;
    const path = Array.from({ length: 41 }, (_, i) => at((proj.flightTime * i) / 40))
      .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' ');
    const [bx, by] = at(playing ? Math.min(t, proj.flightTime) : 0);
    const [px, py] = at(proj.flightTime / 2);
    picture = (
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-md" role="img" aria-label={fill(w['fam.block.sim.projectile.picture'], { v: num(v.speed), a: num(v.angle) })}>
        <line x1="0" y1={H - pad} x2={W} y2={H - pad} stroke={ink} strokeWidth="2" />
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeDasharray="6 5" />
        <line x1={px} y1={py} x2={px} y2={H - pad} stroke={accent} strokeWidth="1.5" strokeDasharray="3 4" />
        <circle cx={pad} cy={H - pad} r="8" fill={accent} style={{ transform: `translate(${(bx - pad).toFixed(1)}px, ${(by - (H - pad)).toFixed(1)}px)` }} />
      </svg>
    );
    lines = [fill(w['fam.block.sim.projectile.range'], { r: num(proj.range) }), fill(w['fam.block.sim.projectile.peak'], { h: num(proj.peak) }), fill(w['fam.block.sim.projectile.time'], { t: num(proj.flightTime) }), w['fam.block.sim.noAir']];
    formula = w['fam.block.sim.projectile.formula'];
  } else if (b.sim === 'ohms_law') {
    const I = ohmsCurrent(v.voltage, v.resistance);
    picture = (
      <svg viewBox="0 0 320 180" className="mx-auto w-full max-w-sm" role="img" aria-label={fill(w['fam.block.sim.ohms_law.picture'], { v: num(v.voltage), r: num(v.resistance) })}>
        <rect x="40" y="30" width="240" height="120" rx="8" fill="none" stroke={ink} strokeWidth="2.5" />
        <rect x="30" y="74" width="20" height="32" fill="white" />
        <line x1="30" y1="80" x2="50" y2="80" stroke={ink} strokeWidth="4" />
        <line x1="34" y1="100" x2="46" y2="100" stroke={ink} strokeWidth="4" />
        <text x="62" y="95" fontSize="12" fontWeight="700" fill={ink}>{`${num(v.voltage)} V`}</text>
        <rect x="130" y="20" width="60" height="20" fill="white" stroke={accent} strokeWidth="2.5" />
        <text x="160" y="60" fontSize="12" fontWeight="700" textAnchor="middle" fill={ink}>{`${num(v.resistance)} Ω`}</text>
        <path d="M150 150 l10 -6 v12 z" fill={color} />
        <text x="160" y="172" fontSize="12" fontWeight="700" textAnchor="middle" fill={ink}>{`I = ${num(I, 4)} A`}</text>
      </svg>
    );
    lines = [fill(w['fam.block.sim.ohms_law.current'], { v: num(v.voltage), r: num(v.resistance), i: num(I, 4) })];
    formula = w['fam.block.sim.ohms_law.formula'];
  } else if (b.sim === 'refraction') {
    const res = refraction(v.n1, v.n2, v.incidence);
    const cx = 160;
    const cy = 110;
    const L = 100;
    const i = (v.incidence * Math.PI) / 180;
    const inX = cx - L * Math.sin(i);
    const inY = cy - L * Math.cos(i);
    const out = res.totalInternal ? [cx + L * Math.sin(i), cy - L * Math.cos(i)] : [cx + L * Math.sin(((res.refracted ?? 0) * Math.PI) / 180), cy + L * Math.cos(((res.refracted ?? 0) * Math.PI) / 180)];
    picture = (
      <svg viewBox="0 0 320 220" className="mx-auto w-full max-w-sm" role="img" aria-label={fill(w['fam.block.sim.refraction.picture'], { n1: num(v.n1), n2: num(v.n2) })}>
        <rect x="0" y="0" width="320" height={cy} fill={colors.cyan} fillOpacity={0.06 + (v.n1 - 1) * 0.12} />
        <rect x="0" y={cy} width="320" height={220 - cy} fill={colors.cyan} fillOpacity={0.06 + (v.n2 - 1) * 0.12} />
        <line x1="0" y1={cy} x2="320" y2={cy} stroke={ink} strokeWidth="2" />
        <line x1={cx} y1="4" x2={cx} y2="216" stroke={ink} strokeOpacity="0.5" strokeDasharray="5 5" />
        <text x="8" y="20" fontSize="12" fontWeight="700" fill={ink}>{`n₁ = ${num(v.n1)}`}</text>
        <text x="8" y={cy + 20} fontSize="12" fontWeight="700" fill={ink}>{`n₂ = ${num(v.n2)}`}</text>
        <line x1={inX} y1={inY} x2={cx} y2={cy} stroke={accent} strokeWidth="3" />
        <line x1={cx} y1={cy} x2={out[0]} y2={out[1]} stroke={res.totalInternal ? accent : color} strokeWidth="3" />
      </svg>
    );
    lines = res.totalInternal
      ? [fill(w['fam.block.sim.refraction.tir'], { i: num(v.incidence) })]
      : [fill(w['fam.block.sim.refraction.refracted'], { r: num(res.refracted ?? 0, 1) })];
    lines.push(res.critical !== null ? fill(w['fam.block.sim.refraction.critical'], { c: num(res.critical, 1) }) : w['fam.block.sim.refraction.noCritical']);
    formula = w['fam.block.sim.refraction.formula'];
  }

  return (
    <Card title={b.title} tone={tone} tag="simulation">
      {picture}
      {moves && !reduced && <PlayButton playing={playing} onToggle={() => setPlaying((p) => !p)} w={w} />}
      {moves && reduced && <p className="text-sm text-slate/80">{w['fam.block.sim.still']}</p>}
      {Object.entries(inputs).map(([name, r]) => (
        <Slider key={name} label={label(name)} value={v[name]} min={r.min} max={r.max} step={r.step} onChange={set(name)} />
      ))}
      <Values lines={lines} />
      <p className="font-mono text-sm text-slate/80">{formula}</p>
    </Card>
  );
}
