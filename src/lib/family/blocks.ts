// The Concept Resolver's typed blocks (docs/family-app/02 §4, 03 §6; M1-5, C251). The model fills these as DATA, one
// JSON object per line; our components draw them. Nothing here is ever rendered as markup or run as code:
// - every block is checked against its shape; an unknown type, a missing field or a field of the wrong kind drops it;
// - text fields are plain text: markup characters and Markdown marks are taken out, lengths are capped;
// - a worked example's arithmetic is recomputed here (calc), and one wrong step drops the whole example;
// - a check or practice item whose question carries arithmetic must have its keyed option equal to the computed answer;
// - links come only from official hosts (SOURCE_HOSTS), https only.
// - an interactive block (graph, number line, fraction model, geometry, simulation; M2-8, C282) carries only a choice
//   from a fixed set and bounded numbers; a value out of its range drops the block, and every number shown is computed
//   by our code (./interactive.ts). At most one interactive block is kept per response.
// Pure: no database, no network. Safe for the phone (no message file imported).

import { FRACTION_MAX_DENOMINATOR, GRAPH_FNS, GRAPH_PARAMS, PARAM_LIMIT, SIM_INPUTS, SIM_KINDS, X_LIMIT, isTriangle, type Fraction, type GraphFn, type SimKind } from './interactive';

export const BLOCK_SCHEMA_VERSION = 1;

export type Explanation = { type: 'explanation'; title: string; idea: string; example: string; steps: string[]; terms: { en: string; local: string }[] };
export type WorkedStep = { text: string; expression?: string; result?: string };
export type WorkedExample = { type: 'worked_example'; problem: string; steps: WorkedStep[]; answer: string };
export type KeyPoints = { type: 'key_points'; points: string[] };
export type Diagram = { type: 'diagram'; title: string; kind: 'flow' | 'cycle'; nodes: { id: string; label: string }[]; edges: { from: string; to: string; label?: string }[] };
export type QuizItem = { id: string; question: string; options: string[]; answer: number; hint: string; why: string; wrong: string[]; expression?: string };
export type Check = { type: 'check'; items: QuizItem[] };
export type Practice = { type: 'practice'; items: QuizItem[] };
export type EnglishMoment = { type: 'english_moment'; words: { en: string; meaning: string }[]; sentence: string; pattern: string; sayIt: string };
export type Sources = { type: 'sources'; links: { label: string; url: string }[] };
// The interactive blocks (M2-8): the model fills these numbers; our code draws them and computes every value shown.
export type GraphSlider = { param: string; min: number; max: number; step: number };
export type Graph = { type: 'graph'; title: string; fn: GraphFn; params: Record<string, number>; sliders: GraphSlider[]; xFrom: number; xTo: number };
export type NumberLineInterval = { from: number; to: number; closedFrom: boolean; closedTo: boolean };
export type NumberLine = { type: 'number_line'; title: string; from: number; to: number; step: number; marks: { value: number; label?: string }[]; interval?: NumberLineInterval };
export type FractionModel = { type: 'fraction_model'; title: string; shape: 'bar' | 'circle'; fractions: Fraction[] };
export type GeometryShape = { kind: 'angle'; degrees: number } | { kind: 'triangle'; sides: [number, number, number] } | { kind: 'circle'; radius: number; chord?: number };
export type Geometry = { type: 'geometry'; title: string; shape: GeometryShape; labels: string[] };
export type Simulation = { type: 'simulation'; title: string; sim: SimKind; values: Record<string, number> };
export type Interactive = Graph | NumberLine | FractionModel | Geometry | Simulation;

export type Block = Explanation | WorkedExample | KeyPoints | Diagram | Check | Practice | EnglishMoment | Sources | Interactive;
export type BlockType = Block['type'];
export const INTERACTIVE_TYPES: readonly BlockType[] = ['graph', 'number_line', 'fraction_model', 'geometry', 'simulation'];
export const isInteractive = (t: BlockType) => INTERACTIVE_TYPES.includes(t);
export const BLOCK_TYPES: readonly BlockType[] = ['explanation', 'worked_example', 'key_points', 'diagram', 'check', 'practice', 'english_moment', 'sources', ...INTERACTIVE_TYPES];

// Every response must teach, check and give practice (08 §7); the others come when they fit.
export const REQUIRED_BLOCKS: readonly BlockType[] = ['explanation', 'check', 'practice'];

// Official pages a source link may point to (allowlist; anything else is dropped, never shown).
export const SOURCE_HOSTS: readonly string[] = ['ncert.nic.in', 'cbseacademic.nic.in', 'www.cbse.gov.in', 'cbse.gov.in', 'diksha.gov.in', 'epathshala.nic.in', 'www.education.gov.in'];

// ---- plain text ----

// Markup and Markdown marks out, spaces tidied, length capped. The result is shown as text by React, so nothing in it
// can become markup either way; this keeps "**bold**" and "<b>" from appearing as raw characters on screen.
export function plain(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/\*\*|__|`+|^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > 0 && s.length <= max ? s : s.length > max ? s.slice(0, max).trimEnd() : null;
}

const list = <T>(v: unknown, min: number, max: number, each: (x: unknown) => T | null): T[] | null => {
  if (!Array.isArray(v)) return null;
  const out = v.slice(0, max).map(each).filter((x): x is T => x !== null);
  return out.length >= min ? out : null;
};

// ---- arithmetic, recomputed ----

// A small, safe calculator: numbers (with decimals), + - × * / ÷ ^, brackets, and a trailing % on a number. No names,
// no functions, nothing else; anything outside this grammar is "not arithmetic" (null), never evaluated.
export function calc(expression: string): number | null {
  const src = expression.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '');
  if (!/^[0-9.+\-*/^()%]+$/.test(src) || src.length > 120) return null;
  let i = 0;
  const peek = () => src[i];
  const number = (): number | null => {
    const m = /^\d+(?:\.\d+)?/.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    let n = Number(m[0]);
    if (peek() === '%') {
      i++;
      n /= 100;
    }
    return n;
  };
  const factor = (): number | null => {
    if (peek() === '-') {
      i++;
      const f = factor();
      return f === null ? null : -f;
    }
    if (peek() === '(') {
      i++;
      const e = expr();
      if (e === null || peek() !== ')') return null;
      i++;
      return e;
    }
    return number();
  };
  const power = (): number | null => {
    const base = factor();
    if (base === null) return null;
    if (peek() === '^') {
      i++;
      const exp = power();
      if (exp === null || Math.abs(exp) > 64) return null;
      return base ** exp;
    }
    return base;
  };
  const term = (): number | null => {
    let left = power();
    while (left !== null && (peek() === '*' || peek() === '/')) {
      const op = src[i++];
      const right = power();
      if (right === null) return null;
      if (op === '/' && right === 0) return null;
      left = op === '*' ? left * right : left / right;
    }
    return left;
  };
  const expr = (): number | null => {
    let left = term();
    while (left !== null && (peek() === '+' || peek() === '-')) {
      const op = src[i++];
      const right = term();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };
  const value = expr();
  return value !== null && i === src.length && Number.isFinite(value) ? value : null;
}

// The number a result states ("12", "12.5", "3/4", "= 40 cm" → 40). null when it states none.
export function statedNumber(text: string): number | null {
  const t = text.replace(/,/g, '').replace(/−/g, '-');
  const frac = /(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(t);
  if (frac && Number(frac[2]) !== 0) return Number(frac[1]) / Number(frac[2]);
  const m = /-?\d+(?:\.\d+)?/.exec(t);
  return m ? Number(m[0]) : null;
}

export const sameNumber = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-6, Math.abs(a) * 1e-4);

// ---- each block ----

function quizItem(v: unknown): QuizItem | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const id = typeof o.id === 'string' && /^[a-z0-9_-]{1,20}$/i.test(o.id) ? o.id : null;
  const question = plain(o.question, 400);
  const options = list(o.options, 2, 4, (x) => plain(x, 160));
  const answer = Number(o.answer);
  const hint = plain(o.hint, 300);
  const why = plain(o.why, 400);
  if (!id || !question || !options || options.length !== (Array.isArray(o.options) ? Math.min(o.options.length, 4) : 0)) return null;
  if (!Number.isInteger(answer) || answer < 0 || answer >= options.length || !hint || !why) return null;
  const wrong = options.map((_, k) => (k === answer ? '' : (plain(Array.isArray(o.wrong) ? o.wrong[k] : null, 400) ?? why)));
  const item: QuizItem = { id, question, options, answer, hint, why, wrong };
  if (typeof o.expression === 'string' && o.expression.trim()) {
    // The question's own arithmetic: its keyed option must be what the arithmetic gives, or the item is dropped.
    const value = calc(o.expression);
    const keyed = statedNumber(options[answer]);
    if (value === null || keyed === null || !sameNumber(value, keyed)) return null;
    item.expression = o.expression.slice(0, 120);
  }
  return item;
}

export function checkBlock(raw: unknown): Block | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  switch (o.type) {
    case 'explanation': {
      const title = plain(o.title, 120);
      const idea = plain(o.idea, 300);
      const example = plain(o.example, 600);
      const steps = list(o.steps, 2, 6, (x) => plain(x, 400));
      const terms = list(o.terms, 0, 8, (x) => {
        const t = (x ?? {}) as Record<string, unknown>;
        const en = plain(t.en, 60);
        const local = plain(t.local, 60);
        return en && local ? { en, local } : null;
      });
      return title && idea && example && steps && terms ? { type: 'explanation', title, idea, example, steps, terms } : null;
    }
    case 'worked_example': {
      const problem = plain(o.problem, 500);
      const answer = plain(o.answer, 200);
      const rawSteps = Array.isArray(o.steps) ? o.steps.slice(0, 8) : [];
      const steps: WorkedStep[] = [];
      for (const s of rawSteps) {
        const st = (s ?? {}) as Record<string, unknown>;
        const text = plain(st.text, 400);
        if (!text) return null;
        const step: WorkedStep = { text };
        if (typeof st.expression === 'string' && st.expression.trim()) {
          // Every numeric step is recomputed; one that does not hold drops the whole example (03 §6 step 6).
          const value = calc(st.expression);
          const stated = typeof st.result === 'string' || typeof st.result === 'number' ? statedNumber(String(st.result)) : null;
          if (value === null || stated === null || !sameNumber(value, stated)) return null;
          step.expression = st.expression.slice(0, 120);
          step.result = String(st.result).slice(0, 40);
        }
        steps.push(step);
      }
      return problem && answer && steps.length >= 1 ? { type: 'worked_example', problem, steps, answer } : null;
    }
    case 'key_points': {
      const points = list(o.points, 2, 6, (x) => plain(x, 240));
      return points ? { type: 'key_points', points } : null;
    }
    case 'diagram': {
      const title = plain(o.title, 120);
      const kind = o.kind === 'cycle' ? 'cycle' : 'flow';
      const nodes = list(o.nodes, 2, 8, (x) => {
        const n = (x ?? {}) as Record<string, unknown>;
        const id = typeof n.id === 'string' && /^[a-z0-9_-]{1,20}$/i.test(n.id) ? n.id : null;
        const label = plain(n.label, 60);
        return id && label ? { id, label } : null;
      });
      if (!title || !nodes) return null;
      const ids = new Set(nodes.map((n) => n.id));
      const edges = (list(o.edges, 1, 12, (x) => {
        const e = (x ?? {}) as Record<string, unknown>;
        const from = typeof e.from === 'string' && ids.has(e.from) ? e.from : null;
        const to = typeof e.to === 'string' && ids.has(e.to) ? e.to : null;
        const label = e.label === undefined ? undefined : (plain(e.label, 40) ?? undefined);
        return from && to && from !== to ? { from, to, ...(label ? { label } : {}) } : null;
      }) ?? null);
      return edges ? { type: 'diagram', title, kind, nodes, edges } : null;
    }
    case 'check':
    case 'practice': {
      const items = list(o.items, 1, 3, quizItem);
      return items ? ({ type: o.type, items } as Check | Practice) : null;
    }
    case 'english_moment': {
      const words = list(o.words, 1, 3, (x) => {
        const w = (x ?? {}) as Record<string, unknown>;
        const en = plain(w.en, 40);
        const meaning = plain(w.meaning, 80);
        return en && meaning ? { en, meaning } : null;
      });
      const sentence = plain(o.sentence, 200);
      const pattern = plain(o.pattern, 200);
      const sayIt = plain(o.sayIt, 200);
      return words && sentence && pattern && sayIt ? { type: 'english_moment', words, sentence, pattern, sayIt } : null;
    }
    case 'sources': {
      const links = list(o.links, 1, 4, (x) => {
        const l = (x ?? {}) as Record<string, unknown>;
        const label = plain(l.label, 120);
        return label && typeof l.url === 'string' && allowedSource(l.url) ? { label, url: new URL(l.url).toString() } : null;
      });
      return links ? { type: 'sources', links } : null;
    }
    case 'graph':
    case 'number_line':
    case 'fraction_model':
    case 'geometry':
    case 'simulation':
      return interactiveBlock(o);
    default:
      return null;
  }
}

// ---- the interactive blocks (M2-8) ----

// A finite number within [lo, hi], or null (a string, NaN or Infinity is the wrong kind).
const within = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const wholeWithin = (v: unknown, lo: number, hi: number): number | null => {
  const n = within(v, lo, hi);
  return n !== null && Number.isInteger(n) ? n : null;
};
const record = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function interactiveBlock(o: Record<string, unknown>): Interactive | null {
  const title = plain(o.title, 120);
  if (!title) return null;
  switch (o.type) {
    case 'graph': {
      const fn = GRAPH_FNS.find((f) => f === o.fn);
      if (!fn) return null;
      const given = record(o.params);
      const params: Record<string, number> = {};
      for (const name of GRAPH_PARAMS[fn]) {
        const v = within(given[name], -PARAM_LIMIT, PARAM_LIMIT);
        if (v === null) return null;
        params[name] = v;
      }
      // y = 0·x² + … is not a quadratic, and y = 0/x is not an inverse.
      if ((fn === 'quadratic' && params.a === 0) || (fn === 'inverse' && params.k === 0)) return null;
      const rawSliders = o.sliders === undefined ? [] : o.sliders;
      if (!Array.isArray(rawSliders) || rawSliders.length > 2) return null;
      const sliders: GraphSlider[] = [];
      for (const raw of rawSliders) {
        const sl = record(raw);
        const param = GRAPH_PARAMS[fn].find((n) => n === sl.param);
        const min = within(sl.min, -PARAM_LIMIT, PARAM_LIMIT);
        const max = within(sl.max, -PARAM_LIMIT, PARAM_LIMIT);
        const step = within(sl.step, 0.01, PARAM_LIMIT * 2);
        if (!param || min === null || max === null || step === null || min >= max || (max - min) / step > 400) return null;
        if (sliders.some((x) => x.param === param) || params[param] < min || params[param] > max) return null;
        sliders.push({ param, min, max, step });
      }
      const xFrom = o.xFrom === undefined ? -10 : within(o.xFrom, -X_LIMIT, X_LIMIT);
      const xTo = o.xTo === undefined ? 10 : within(o.xTo, -X_LIMIT, X_LIMIT);
      if (xFrom === null || xTo === null || xTo - xFrom < 2) return null;
      return { type: 'graph', title, fn, params, sliders, xFrom, xTo };
    }
    case 'number_line': {
      const from = within(o.from, -1000, 1000);
      const to = within(o.to, -1000, 1000);
      const step = within(o.step, 0.001, 2000);
      if (from === null || to === null || step === null || from >= to) return null;
      const ticks = (to - from) / step;
      if (ticks < 1 || ticks > 40 || Math.abs(ticks - Math.round(ticks)) > 1e-6) return null;
      const rawMarks = o.marks === undefined ? [] : o.marks;
      if (!Array.isArray(rawMarks) || rawMarks.length > 6) return null;
      const marks: { value: number; label?: string }[] = [];
      for (const raw of rawMarks) {
        const m = record(raw);
        const value = within(m.value, from, to);
        if (value === null) return null;
        const label = m.label === undefined ? null : plain(m.label, 12);
        marks.push(label ? { value, label } : { value });
      }
      const block: NumberLine = { type: 'number_line', title, from, to, step, marks };
      if (o.interval !== undefined) {
        const iv = record(o.interval);
        const a = within(iv.from, from, to);
        const b = within(iv.to, from, to);
        if (a === null || b === null || a >= b || typeof iv.closedFrom !== 'boolean' || typeof iv.closedTo !== 'boolean') return null;
        block.interval = { from: a, to: b, closedFrom: iv.closedFrom, closedTo: iv.closedTo };
      }
      if (marks.length === 0 && !block.interval) return null;
      return block;
    }
    case 'fraction_model': {
      const shape = o.shape === 'bar' || o.shape === 'circle' ? o.shape : null;
      if (!shape || !Array.isArray(o.fractions) || o.fractions.length < 1 || o.fractions.length > 2) return null;
      const fractions: Fraction[] = [];
      for (const raw of o.fractions) {
        const f = record(raw);
        const d = wholeWithin(f.d, 1, FRACTION_MAX_DENOMINATOR);
        const n = d === null ? null : wholeWithin(f.n, 0, d);
        if (d === null || n === null) return null;
        fractions.push({ n, d });
      }
      return { type: 'fraction_model', title, shape, fractions };
    }
    case 'geometry': {
      const sh = record(o.shape);
      let shape: GeometryShape | null = null;
      if (sh.kind === 'angle') {
        const degrees = within(sh.degrees, 0, 360);
        shape = degrees !== null && degrees > 0 && degrees < 360 ? { kind: 'angle', degrees } : null;
      } else if (sh.kind === 'triangle') {
        const sides = Array.isArray(sh.sides) && sh.sides.length === 3 ? sh.sides.map((x) => within(x, 0, 1000)) : null;
        // The triangle inequality, checked here: three lengths that cannot close are not drawn.
        const [a, b, c] = sides ?? [];
        shape = typeof a === 'number' && typeof b === 'number' && typeof c === 'number' && isTriangle(a, b, c) ? { kind: 'triangle', sides: [a, b, c] } : null;
      } else if (sh.kind === 'circle') {
        const radius = within(sh.radius, 0, 1000);
        if (radius !== null && radius > 0) {
          if (sh.chord === undefined) shape = { kind: 'circle', radius };
          else {
            const c = within(sh.chord, 0, 2 * radius);
            shape = c !== null && c > 0 ? { kind: 'circle', radius, chord: c } : null;
          }
        }
      }
      if (!shape) return null;
      const labels = o.labels === undefined ? [] : list(o.labels, 0, 3, (x) => plain(x, 12));
      return labels ? { type: 'geometry', title, shape, labels } : null;
    }
    case 'simulation': {
      const sim = SIM_KINDS.find((k) => k === o.sim);
      if (!sim) return null;
      const given = record(o.values);
      const values: Record<string, number> = {};
      for (const [name, r] of Object.entries(SIM_INPUTS[sim])) {
        const v = within(given[name], r.min, r.max);
        if (v === null) return null;
        values[name] = v;
      }
      return { type: 'simulation', title, sim, values };
    }
    default:
      return null;
  }
}

export function allowedSource(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && SOURCE_HOSTS.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

// One line of model output → a block, or null. Text around the JSON (a stray "```json") is ignored.
// The model's answer as it streams, cut into its top-level JSON objects (W2, C316). Our prompts ask for one block per
// line, but open models (Llama on Workers AI) often spread a block over several lines, wrap blocks in a code fence, put
// them in a list, or add a sentence around them. Braces are counted outside strings, so each complete object is handed
// on as soon as it closes, whatever the lines; anything outside an object is dropped, and so is an object that never
// closes or grows past the limit.
// What was dropped is still told, for staff measuring the model (C330): `dropped()` says whether the answer so far
// ends inside an object that never closed (an unescaped quote leaves the scanner inside a string to the end), and how
// many objects grew past the limit. It changes nothing the scanner hands on.
const OBJECT_MAX_CHARS = 20_000;
export type ScanDropped = { unclosed: boolean; droppedForSize: number };
export type JsonObjectScan = ((text: string) => string[]) & { dropped: () => ScanDropped };
export function jsonObjectScanner(): JsonObjectScan {
  let droppedForSize = 0;
  let buf = '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  // A "{" in a sentence is not an object: one starts only where a key ("…") or "}" follows it.
  let opening = false;
  // An object past the limit is passed over to its own closing brace, its strings and nesting still followed, so
  // nothing inside it is mistaken for a block of its own.
  let discarding = false;
  const scan = (text: string): string[] => {
    const out: string[] = [];
    for (const ch of text) {
      if (opening) {
        if (/\s/.test(ch)) {
          buf += ch;
          continue;
        }
        opening = false;
        if (ch === '"' || ch === '}') {
          depth = 1;
        } else {
          buf = '';
          if (ch !== '{') continue;
        }
      }
      if (depth === 0) {
        if (ch === '{') {
          opening = true;
          buf = '{';
        }
        continue;
      }
      if (!discarding) buf += ch;
      if (!discarding && buf.length > OBJECT_MAX_CHARS) {
        discarding = true;
        droppedForSize += 1;
        buf = '';
      }
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          if (!discarding) out.push(buf);
          discarding = false;
          buf = '';
        }
      }
    }
    return out;
  };
  // A "{" followed so far only by spaces is not yet an object, so it is not counted as one left open.
  return Object.assign(scan, { dropped: (): ScanDropped => ({ unclosed: depth > 0, droppedForSize }) });
}

export function parseBlockLine(line: string): Block | null {
  const start = line.indexOf('{');
  const end = line.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return checkBlock(JSON.parse(line.slice(start, end + 1)));
  } catch {
    return null;
  }
}

// A whole response's blocks: the first of each type that passed, in a fixed teaching order. null when a required
// block is missing (the response is then not shown as complete and never cached).
// At most one interactive block: the first that passed.
const ORDER: BlockType[] = ['explanation', 'worked_example', 'diagram', ...INTERACTIVE_TYPES, 'key_points', 'check', 'practice', 'english_moment', 'sources'];
export function completeResponse(blocks: Block[]): Block[] | null {
  const first = new Map<BlockType, Block>();
  let interactive = false;
  for (const b of blocks) {
    if (first.has(b.type) || (isInteractive(b.type) && interactive)) continue;
    if (isInteractive(b.type)) interactive = true;
    first.set(b.type, b);
  }
  if (!REQUIRED_BLOCKS.every((t) => first.has(t))) return null;
  return ORDER.filter((t) => first.has(t)).map((t) => first.get(t)!);
}
