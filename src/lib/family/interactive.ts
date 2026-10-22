// The interactive blocks' maths and physics (M2-8, C282; docs/family-app/02 §4 "Graph or construction", "Simulation").
// The model chooses a function, a construction or a simulation and its starting values; every number a child sees is
// computed here, by our code. Nothing here is a third-party simulation (gate L7). Pure: no DOM, no network, no message
// file, so the phone, the server and the tests share it.

// ---- shared ----

export const round = (x: number, places: number): number => {
  const f = 10 ** places;
  const r = Math.round(x * f) / f;
  return Object.is(r, -0) ? 0 : r;
};

// A number as a child reads it: at most `places` decimals, no trailing zeros, a proper minus sign.
export const num = (x: number, places = 2): string => String(round(x, places)).replace('-', '−');

const DEG = Math.PI / 180;

// ---- graph ----

export type GraphFn = 'linear' | 'quadratic' | 'inverse';
export const GRAPH_FNS: readonly GraphFn[] = ['linear', 'quadratic', 'inverse'];
export const GRAPH_PARAMS: Record<GraphFn, readonly string[]> = { linear: ['m', 'c'], quadratic: ['a', 'b', 'c'], inverse: ['k'] };
// Every parameter and every slider end stays within ±PARAM_LIMIT; the x window within ±X_LIMIT.
export const PARAM_LIMIT = 20;
export const X_LIMIT = 20;
// The plotted window never goes beyond ±Y_LIMIT, whatever the parameters.
export const Y_LIMIT = 100;

export function graphY(fn: GraphFn, p: Record<string, number>, x: number): number | null {
  switch (fn) {
    case 'linear':
      return p.m * x + p.c;
    case 'quadratic':
      return p.a * x * x + p.b * x + p.c;
    case 'inverse':
      return x === 0 ? null : p.k / x;
  }
}

// Points across [from, to]; null where the function has no value (x = 0 for y = k/x), which breaks the line there.
export function graphPoints(fn: GraphFn, p: Record<string, number>, from: number, to: number, n = 161): ({ x: number; y: number } | null)[] {
  const out: ({ x: number; y: number } | null)[] = [];
  for (let i = 0; i < n; i++) {
    const x = from + ((to - from) * i) / (n - 1);
    const y = graphY(fn, p, Math.abs(x) < 1e-9 ? 0 : x);
    out.push(y === null ? null : { x, y });
  }
  return out;
}

// The y window, fixed from the starting values so a slider's change is seen against the same axes.
export function graphWindow(fn: GraphFn, p: Record<string, number>, from: number, to: number): { yFrom: number; yTo: number } {
  const ys = graphPoints(fn, p, from, to, 81)
    .filter((q): q is { x: number; y: number } => q !== null && Math.abs(q.x) >= 0.25)
    .map((q) => q.y);
  let lo = Math.min(0, ...ys);
  let hi = Math.max(0, ...ys);
  lo = Math.max(-Y_LIMIT, Math.floor(lo - 1));
  hi = Math.min(Y_LIMIT, Math.ceil(hi + 1));
  if (hi - lo < 4) hi = lo + 4;
  return { yFrom: lo, yTo: hi };
}

// The equation as written in a school book: y = 2x + 1, y = x² − 3x, y = 6/x.
export function equationText(fn: GraphFn, p: Record<string, number>): string {
  const term = (coef: number, power: string, first: boolean): string => {
    if (coef === 0) return '';
    const sign = coef < 0 ? (first ? '−' : ' − ') : first ? '' : ' + ';
    const abs = Math.abs(coef);
    const body = power === '' ? num(abs) : `${abs === 1 ? '' : num(abs)}${power}`;
    return `${sign}${body}`;
  };
  if (fn === 'inverse') return `y = ${num(p.k)}/x`;
  const parts = fn === 'linear' ? [[p.m, 'x'], [p.c, '']] : [[p.a, 'x²'], [p.b, 'x'], [p.c, '']];
  let s = '';
  for (const [coef, power] of parts as [number, string][]) s += term(coef, power, s === '');
  return `y = ${s || '0'}`;
}

// A few whole-number x values in the window and their y, for the words beside the picture.
export function samplePoints(fn: GraphFn, p: Record<string, number>, from: number, to: number): { x: number; y: number | null }[] {
  const lo = Math.ceil(from);
  const hi = Math.floor(to);
  const step = Math.max(1, Math.ceil((hi - lo) / 4));
  const out: { x: number; y: number | null }[] = [];
  for (let x = lo; x <= hi && out.length < 5; x += step) out.push({ x, y: graphY(fn, p, x) });
  return out;
}

// ---- fraction model ----

export type Fraction = { n: number; d: number };
export const FRACTION_MAX_DENOMINATOR = 24;

// −1: a is smaller, 0: equal, 1: a is larger (cross-multiplied: whole numbers only, so exact).
export function compareFractions(a: Fraction, b: Fraction): -1 | 0 | 1 {
  const diff = a.n * b.d - b.n * a.d;
  return diff === 0 ? 0 : diff > 0 ? 1 : -1;
}

// ---- geometry ----

export type AngleKind = 'acute' | 'right' | 'obtuse' | 'straight' | 'reflex';
export function angleKind(deg: number): AngleKind {
  if (deg < 90) return 'acute';
  if (deg === 90) return 'right';
  if (deg < 180) return 'obtuse';
  if (deg === 180) return 'straight';
  return 'reflex';
}

// Strictly: two sides together longer than the third, every way round.
export function isTriangle(a: number, b: number, c: number): boolean {
  return a > 0 && b > 0 && c > 0 && a + b > c && a + c > b && b + c > a;
}

// The angle opposite each side, in degrees (cosine rule). [A, B, C]: A is opposite side a.
export function triangleAngles(a: number, b: number, c: number): [number, number, number] {
  const opp = (x: number, y: number, z: number) => Math.acos(Math.min(1, Math.max(-1, (y * y + z * z - x * x) / (2 * y * z)))) / DEG;
  return [opp(a, b, c), opp(b, a, c), opp(c, a, b)];
}

export const circumference = (r: number) => 2 * Math.PI * r;
export const circleArea = (r: number) => Math.PI * r * r;
// A chord of length c in a circle of radius r: its distance from the centre and the angle it makes at the centre.
export function chord(r: number, c: number): { fromCentre: number; centralAngle: number } {
  return { fromCentre: Math.sqrt(Math.max(0, r * r - (c / 2) ** 2)), centralAngle: (2 * Math.asin(Math.min(1, c / (2 * r)))) / DEG };
}

// ---- simulations ----

// g is fixed (the value school books use); no air resistance in any of them, and the screen says so.
export const G = 9.8;

export type SimKind = 'pendulum' | 'projectile' | 'ohms_law' | 'refraction';
export const SIM_KINDS: readonly SimKind[] = ['pendulum', 'projectile', 'ohms_law', 'refraction'];

// Each simulation's inputs: the range a starting value must lie in (or the block is dropped) and the slider's step.
export const SIM_INPUTS: Record<SimKind, Record<string, { min: number; max: number; step: number }>> = {
  pendulum: { length: { min: 0.1, max: 5, step: 0.1 } },
  projectile: { speed: { min: 1, max: 50, step: 1 }, angle: { min: 5, max: 85, step: 1 } },
  ohms_law: { voltage: { min: 1, max: 24, step: 0.5 }, resistance: { min: 1, max: 1000, step: 1 } },
  refraction: { n1: { min: 1, max: 2.5, step: 0.01 }, n2: { min: 1, max: 2.5, step: 0.01 }, incidence: { min: 0, max: 89, step: 1 } },
};

// T = 2π√(L/g), seconds.
export const pendulumPeriod = (length: number) => 2 * Math.PI * Math.sqrt(length / G);

// Launched from the ground and landing at the same height, no air resistance.
export function projectile(speed: number, angleDeg: number): { flightTime: number; range: number; peak: number } {
  const t = angleDeg * DEG;
  return { flightTime: (2 * speed * Math.sin(t)) / G, range: (speed * speed * Math.sin(2 * t)) / G, peak: (speed * Math.sin(t)) ** 2 / (2 * G) };
}

// I = V/R, amperes.
export const ohmsCurrent = (voltage: number, resistance: number) => voltage / resistance;

// Snell's law: n1·sin(i) = n2·sin(r). Total internal reflection when n1·sin(i)/n2 > 1. The critical angle exists only
// going into a less dense medium (n1 > n2).
export function refraction(n1: number, n2: number, incidenceDeg: number): { refracted: number | null; critical: number | null; totalInternal: boolean } {
  const s = (n1 * Math.sin(incidenceDeg * DEG)) / n2;
  const critical = n1 > n2 ? Math.asin(n2 / n1) / DEG : null;
  if (s > 1) return { refracted: null, critical, totalInternal: true };
  return { refracted: Math.asin(s) / DEG, critical, totalInternal: false };
}
