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
// - every block may carry a stable `id` and a `tts_read_aloud` flag (S1, C374). Narration reads only the teaching text
//   of an explanation, a worked example or key points (READ_ALOUD_TYPES); a diagram, table, interactive, check, source
//   list or any future picture-like type is never read, whatever its flag says (narrationScript). Content without ids
//   stays valid: an id is derived from the block's own content (blockIds).
// - a table (S1) is chapter content only: the model's stream (parseBlockLine) never accepts one.
// - a parameter slider, a 3D model and a chapter test (S5, C378) are chapter content only too, and silent: narration
//   never reads them. A slider's readouts are expressions in x, recomputed here (they must give a number across the whole
//   slider); a 3D model is a solid from a fixed set with bounded sizes (./solids.ts), with a text description for the 2D
//   view; a chapter test carries its answer and reason in the authored block, which the server seals before the phone
//   gets it (chapter-tests.ts), and its written and photo items carry a rubric for the parent or teacher.
// Pure: no database, no network. Safe for the phone (no message file imported).

import { FRACTION_MAX_DENOMINATOR, GRAPH_FNS, GRAPH_PARAMS, PARAM_LIMIT, SIM_INPUTS, SIM_KINDS, X_LIMIT, isTriangle, type Fraction, type GraphFn, type SimKind } from './interactive';
import { SOLID_INPUTS, SOLID_KINDS, type SolidKind } from './solids';

export const BLOCK_SCHEMA_VERSION = 1;

// `paragraphs` (W8-AI, resolver v7): the longer explanation in short paragraphs; optional, so older content stays valid.
export type Explanation = { type: 'explanation'; title: string; idea: string; paragraphs?: string[]; example: string; steps: string[]; terms: { en: string; local: string }[] };
export type WorkedStep = { text: string; expression?: string; result?: string };
export type WorkedExample = { type: 'worked_example'; problem: string; steps: WorkedStep[]; answer: string };
export type KeyPoints = { type: 'key_points'; points: string[] };
export type Diagram = { type: 'diagram'; title: string; kind: 'flow' | 'cycle'; nodes: { id: string; label: string }[]; edges: { from: string; to: string; label?: string }[] };
// W8-AI (resolver v7): a mind map, the idea in the centre with 2 to 6 branches of 0 to 4 leaves; every label short.
export type MindMap = { type: 'mind_map'; title: string; root: string; branches: { label: string; leaves: string[] }[] };
export const MIND_MAP_LABEL_MAX = 40;
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
// A small table of plain-text cells (S1): chapter content, drawn as a table and never read aloud.
export type Table = { type: 'table'; title: string; columns: string[]; rows: string[][] };

// S5 (C378). A slider: one value from min to max; each readout is an expression in x. `fraction`: the slider is the
// numerator of n/d (0 to d, whole steps) and is drawn as a bar or a circle.
export type SliderReadout = { label: string; expression: string; unit?: string; places: number };
export type Slider = { type: 'slider'; title: string; label: string; unit?: string; min: number; max: number; step: number; start: number; readouts: SliderReadout[]; fraction?: { d: number; shape: 'bar' | 'circle' } };
export type Model3D = { type: 'model_3d'; title: string; solid: SolidKind; dims: Record<string, number>; alt: string; unit?: string };
export type TestMcq = { kind: 'mcq'; id: string; question: string; options: string[]; answer: number; why: string };
export type TestWritten = { kind: 'written'; id: string; question: string; rubric: string[] };
export type TestPhoto = { kind: 'photo'; id: string; question: string; rubric: string[] };
export type TestItem = TestMcq | TestWritten | TestPhoto;
export type ChapterTest = { type: 'chapter_test'; title: string; items: TestItem[] };

// What any block may carry (S1, C374): a stable id (narration and the saved reading position point at it) and
// `tts_read_aloud: false` to keep a readable block silent. The flag can only silence: it never makes a diagram, table
// or interactive readable.
// The visual blocks (W9-C, docs/39 §3): drawn by our own code from the model's labels, or filled on the server. No
// picture is ever generated: a photograph is a licensed Wikimedia Commons file with its credit, and the videos are the
// library's checked picks (src/lib/family/visuals/fill.ts).
export const FIGURE_SHAPES = ['circle', 'ring', 'cell', 'layered', 'orbit'] as const;
export type FigureShape = (typeof FIGURE_SHAPES)[number];
export const FIGURE_AT = ['centre', 'top', 'right', 'bottom', 'left', 'ring'] as const;
export type FigureAt = (typeof FIGURE_AT)[number];
export type Figure = { type: 'figure'; title: string; kind: 'schematic'; shape: FigureShape; labels: { at: FigureAt; text: string }[] };
export type Steps = { type: 'steps'; title: string; items: { label: string; text: string }[] };
export type Timeline = { type: 'timeline'; title: string; items: { when: string; text: string }[] };
// As the model writes it (a search for a photograph), and after the server filled it (the photograph and its credit).
export type ImageQuery = { type: 'image'; query: string; caption: string };
export type ImagePhoto = { type: 'image'; url: string; caption: string; credit: string; licence: string; source: string };
export type ImageBlock = ImageQuery | ImagePhoto;
export type VideoItem = { videoId: string; title: string; channel: string; seconds: number };
// As written: `{ type: 'videos' }`; filled: up to four of the chapter's picks.
export type Videos = { type: 'videos'; items?: VideoItem[] };
export const FIGURE_LABEL_MAX = 40;
export const VISUAL_TITLE_MAX = 120;
// The hosts a filled photograph may come from: the file itself, and the file's page on Commons (its credit link).
export const PHOTO_HOST = 'upload.wikimedia.org';
export const PHOTO_PAGE_HOST = 'commons.wikimedia.org';
// The licences a photograph may carry, any version (and a port such as "de"): CC0, CC BY, CC BY-SA, public domain.
export const PHOTO_LICENCE = /^(?:CC0(?: 1\.0)?|CC BY(?:-SA)?(?: \d\.\d)?(?: [A-Za-z]{2,3})?|Public domain)$/i;

export type BlockMeta = { id?: string; tts_read_aloud?: boolean };

export type Block = (Explanation | WorkedExample | KeyPoints | Diagram | MindMap | Check | Practice | EnglishMoment | Sources | Table | Interactive | Slider | Model3D | ChapterTest | Figure | Steps | Timeline | ImageBlock | Videos) & BlockMeta;
export type BlockType = Block['type'];
export const INTERACTIVE_TYPES: readonly BlockType[] = ['graph', 'number_line', 'fraction_model', 'geometry', 'simulation'];
export const isInteractive = (t: BlockType) => INTERACTIVE_TYPES.includes(t);
export const BLOCK_TYPES: readonly BlockType[] = ['explanation', 'worked_example', 'key_points', 'diagram', 'mind_map', 'check', 'practice', 'english_moment', 'sources', 'table', ...INTERACTIVE_TYPES, 'slider', 'model_3d', 'chapter_test', 'figure', 'steps', 'timeline', 'image', 'videos'];
// The blocks the server fills before they are kept (W9-C): a photograph and the videos.
export const FILLED_TYPES: readonly BlockType[] = ['image', 'videos'];
// Types only authored chapters carry; the model's answer never does.
export const CHAPTER_ONLY_TYPES: readonly BlockType[] = ['table', 'slider', 'model_3d', 'chapter_test'];

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
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_link: string, label: string) => label)
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

// `strictWrong` (W8-AI, a check block): every wrong option must carry its own reason in `wrong`, or the item is dropped;
// elsewhere (practice, older content) a missing reason falls back to `why`.
function quizItem(v: unknown, strictWrong = false): QuizItem | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const id = typeof o.id === 'string' && /^[a-z0-9_-]{1,20}$/i.test(o.id) ? o.id : null;
  const question = plain(o.question, 400);
  const options = list(o.options, 2, 4, (x) => plain(x, 160));
  const answer = Number(o.answer);
  const hint = plain(o.hint, 300);
  const why = plain(o.why, 400);
  if (!id || !question || !options || options.length !== (Array.isArray(o.options) ? Math.min(o.options.length, 4) : 0)) return null;
  if (!Number.isInteger(answer) || answer < 0 || answer >= options.length || !hint || !why) return null;
  const given = options.map((_, k) => (k === answer ? '' : plain(Array.isArray(o.wrong) ? o.wrong[k] : null, 400)));
  if (strictWrong && given.some((g) => g === null)) return null;
  const wrong = given.map((g) => g ?? why);
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

// A label that fits as written: plain text, not empty, and no longer than `max` (never cut short: a mind map whose
// label is too long is dropped whole, so a shortened word is never shown).
function fits(v: unknown, max: number): string | null {
  const s = plain(v, 2000);
  return s && s.length <= max ? s : null;
}

// A mind map (W8-AI): a title, the root idea, 2 to 6 branches, 0 to 4 leaves each, every label up to
// MIND_MAP_LABEL_MAX characters. A branch or leaf with no label or a label over the limit drops the whole block.
function mindMap(o: Record<string, unknown>): MindMap | null {
  const title = plain(o.title, 120);
  const root = fits(o.root, MIND_MAP_LABEL_MAX);
  if (!title || !root || !Array.isArray(o.branches) || o.branches.length < 2) return null;
  const branches: MindMap['branches'] = [];
  for (const raw of o.branches.slice(0, 6)) {
    const b = (raw ?? {}) as Record<string, unknown>;
    const label = fits(b.label, MIND_MAP_LABEL_MAX);
    if (!label) return null;
    const rawLeaves = b.leaves === undefined ? [] : b.leaves;
    if (!Array.isArray(rawLeaves)) return null;
    const leaves: string[] = [];
    for (const l of rawLeaves.slice(0, 4)) {
      const leaf = fits(l, MIND_MAP_LABEL_MAX);
      if (!leaf) return null;
      leaves.push(leaf);
    }
    branches.push({ label, leaves });
  }
  return { type: 'mind_map', title, root, branches };
}

export const BLOCK_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;

// A block that passed its shape, with its id and narration flag when given (anything else in them is dropped).
// From the model only the unfilled photograph and video shapes pass: a model never names a photograph's address or its
// credit. checkStoredBlock reads back what this server kept, where a filled photograph or video list is accepted.
export function checkBlock(raw: unknown): Block | null {
  return checked(raw, false);
}
export function checkStoredBlock(raw: unknown): Block | null {
  return checked(raw, true);
}

function checked(raw: unknown, stored: boolean): Block | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const b = o.type === 'image' ? imageBlock(o, stored) : o.type === 'videos' ? videosBlock(o, stored) : blockBody(o);
  if (!b) return null;
  const meta: BlockMeta = {};
  if (typeof o.id === 'string' && BLOCK_ID.test(o.id)) meta.id = o.id;
  if (typeof o.tts_read_aloud === 'boolean') meta.tts_read_aloud = o.tts_read_aloud;
  return Object.keys(meta).length ? { ...b, ...meta } : b;
}

function blockBody(o: Record<string, unknown>): Block | null {
  switch (o.type) {
    case 'explanation': {
      const title = plain(o.title, 120);
      const idea = plain(o.idea, 300);
      const example = plain(o.example, 600);
      const paragraphs = o.paragraphs === undefined ? undefined : (list(o.paragraphs, 1, 6, (x) => plain(x, 1200)) ?? undefined);
      const steps = list(o.steps, 2, 6, (x) => plain(x, 400));
      const terms = list(o.terms, 0, 8, (x) => {
        const t = (x ?? {}) as Record<string, unknown>;
        const en = plain(t.en, 60);
        const local = plain(t.local, 60);
        return en && local ? { en, local } : null;
      });
      return title && idea && example && steps && terms ? { type: 'explanation', title, idea, ...(paragraphs ? { paragraphs } : {}), example, steps, terms } : null;
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
      // Up to 8 (v7 asks for 4 to 8; older content gave 2 to 6).
      const points = list(o.points, 2, 8, (x) => plain(x, 240));
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
      // A check may carry up to 5 items (v7: 3 to 5), each with a reason for every wrong option; practice up to 3.
      const items = o.type === 'check' ? list(o.items, 1, 5, (x) => quizItem(x, true)) : list(o.items, 1, 3, (x) => quizItem(x));
      return items ? ({ type: o.type, items } as Check | Practice) : null;
    }
    case 'mind_map':
      return mindMap(o);
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
    case 'table': {
      const title = plain(o.title, 120);
      const columns = list(o.columns, 1, 5, (x) => plain(x, 40));
      if (!title || !columns || !Array.isArray(o.columns) || columns.length !== Math.min(o.columns.length, 5) || !Array.isArray(o.rows) || o.rows.length < 1 || o.rows.length > 12) return null;
      const rows: string[][] = [];
      for (const r of o.rows) {
        if (!Array.isArray(r) || r.length !== columns.length) return null;
        const cells = r.map((c) => plain(c, 80));
        if (cells.some((c) => c === null)) return null;
        rows.push(cells as string[]);
      }
      return { type: 'table', title, columns, rows };
    }
    case 'graph':
    case 'number_line':
    case 'fraction_model':
    case 'geometry':
    case 'simulation':
      return interactiveBlock(o);
    case 'slider':
      return sliderBlock(o);
    case 'model_3d':
      return model3dBlock(o);
    case 'chapter_test':
      return chapterTestBlock(o);
    case 'figure':
      return figureBlock(o);
    case 'steps':
    case 'timeline':
      return stripBlock(o);
    default:
      return null;
  }
}

// ---- visual blocks (W9-C, docs/39 §3) ----
// Every label and text fits as written or the whole block is dropped (never cut short), and a block with more or fewer
// items than its range is dropped whole too.

const exactly = (v: unknown, min: number, max: number): unknown[] | null => (Array.isArray(v) && v.length >= min && v.length <= max ? v : null);

function figureBlock(o: Record<string, unknown>): Figure | null {
  const title = fits(o.title, VISUAL_TITLE_MAX);
  const shape = FIGURE_SHAPES.find((x) => x === o.shape);
  const raw = exactly(o.labels, 2, 6);
  if (!title || (o.kind !== undefined && o.kind !== 'schematic') || !shape || !raw) return null;
  const labels: Figure['labels'] = [];
  for (const x of raw) {
    const l = (x ?? {}) as Record<string, unknown>;
    const at = FIGURE_AT.find((a) => a === l.at);
    const text = fits(l.text, FIGURE_LABEL_MAX);
    if (!at || !text) return null;
    labels.push({ at, text });
  }
  return { type: 'figure', title, kind: 'schematic', shape, labels };
}

function stripBlock(o: Record<string, unknown>): Steps | Timeline | null {
  const title = fits(o.title, VISUAL_TITLE_MAX);
  const steps = o.type === 'steps';
  const raw = steps ? exactly(o.items, 3, 5) : exactly(o.items, 3, 8);
  if (!title || !raw) return null;
  if (steps) {
    const items: Steps['items'] = [];
    for (const x of raw) {
      const i = (x ?? {}) as Record<string, unknown>;
      const label = fits(i.label, 30);
      const text = fits(i.text, 120);
      if (!label || !text) return null;
      items.push({ label, text });
    }
    return { type: 'steps', title, items };
  }
  const items: Timeline['items'] = [];
  for (const x of raw) {
    const i = (x ?? {}) as Record<string, unknown>;
    const when = fits(i.when, 20);
    const text = fits(i.text, 100);
    if (!when || !text) return null;
    items.push({ when, text });
  }
  return { type: 'timeline', title, items };
}

// An https address on exactly this host, with no user name, password or port.
function onHost(v: unknown, host: string, path: RegExp = /^\//): string | null {
  if (typeof v !== 'string' || v.length > 1000) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && u.hostname === host && path.test(u.pathname) ? u.toString() : null;
  } catch {
    return null;
  }
}

function imageBlock(o: Record<string, unknown>, stored: boolean): ImageBlock | null {
  const caption = fits(o.caption, 120);
  if (!caption) return null;
  if (!stored) {
    const query = fits(o.query, 80);
    return query && o.url === undefined ? { type: 'image', query, caption } : null;
  }
  // A kept photograph: a Commons file, its page, an allowed licence and a credit, or nothing.
  const url = onHost(o.url, PHOTO_HOST);
  const source = onHost(o.source, PHOTO_PAGE_HOST, /^\/wiki\/File:/);
  const licence = typeof o.licence === 'string' && PHOTO_LICENCE.test(o.licence.trim()) ? o.licence.trim() : null;
  const credit = fits(o.credit, 120);
  return url && source && licence && credit ? { type: 'image', url, caption, credit, licence, source } : null;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
function videosBlock(o: Record<string, unknown>, stored: boolean): Videos | null {
  if (!stored) return { type: 'videos' };
  const raw = exactly(o.items, 1, 4);
  if (!raw) return null;
  const items: VideoItem[] = [];
  for (const x of raw) {
    const v = (x ?? {}) as Record<string, unknown>;
    const title = plain(v.title, 200);
    const channel = plain(v.channel, 120);
    const seconds = Number(v.seconds);
    if (typeof v.videoId !== 'string' || !VIDEO_ID.test(v.videoId) || !title || !channel || !Number.isInteger(seconds) || seconds < 1 || seconds > 36000) return null;
    items.push({ videoId: v.videoId, title, channel, seconds });
  }
  return { type: 'videos', items };
}

// A photograph or video list still waiting for the server (as the model wrote it): never drawn.
export const unfilled = (b: { type: string }): boolean => (b.type === 'image' && !('url' in b)) || (b.type === 'videos' && !Array.isArray((b as { items?: unknown }).items));

// A block arriving on the phone: a filled photograph or video list takes the place of the unfilled one the model wrote
// (so it shows where the answer put it); anything else is added at the end.
export function placeBlock<B extends { type: string }>(list: readonly B[], b: B): B[] {
  const at = unfilled(b) ? -1 : list.findIndex((x) => x.type === b.type && unfilled(x));
  return at >= 0 ? list.map((x, i) => (i === at ? b : x)) : [...list, b];
}

// ---- slider, 3D model and chapter test (S5, C378) ----

// A readout's value at x: the expression with x in brackets, through the safe calculator; null when it is not a number.
export function sliderValue(expression: string, x: number): number | null {
  if (!SLIDER_EXPRESSION.test(expression) || !Number.isFinite(x)) return null;
  const out = calc(expression.replace(/x/g, `(${x})`));
  return out !== null && Number.isFinite(out) && Math.abs(out) <= 1e9 ? out : null;
}
const SLIDER_EXPRESSION = /^[0-9x.+\-*/^()%×÷−\s]{1,80}$/;

function sliderBlock(o: Record<string, unknown>): Slider | null {
  const title = plain(o.title, 120);
  const label = plain(o.label, 60);
  const min = within(o.min, -1000, 1000);
  const max = within(o.max, -1000, 1000);
  const step = within(o.step, 0.001, 1000);
  if (!title || !label || min === null || max === null || step === null || min >= max || (max - min) / step > 2000) return null;
  const start = within(o.start, min, max);
  if (start === null) return null;
  const unit = o.unit === undefined ? undefined : (plain(o.unit, 12) ?? undefined);
  let fraction: Slider['fraction'];
  if (o.fraction !== undefined) {
    const f = record(o.fraction);
    const d = wholeWithin(f.d, 2, FRACTION_MAX_DENOMINATOR);
    const shape = f.shape === 'bar' || f.shape === 'circle' ? f.shape : null;
    // The slider is the numerator: whole steps from 0 to d.
    if (d === null || !shape || min !== 0 || max !== d || step !== 1 || !Number.isInteger(start)) return null;
    fraction = { d, shape };
  }
  const given = Array.isArray(o.readouts) ? o.readouts.slice(0, 3) : [];
  const readouts: SliderReadout[] = [];
  for (const r of given) {
    const x = record(r);
    const rl = plain(x.label, 60);
    const expression = typeof x.expression === 'string' ? x.expression.trim() : '';
    const places = x.places === undefined ? 2 : wholeWithin(x.places, 0, 4);
    const ru = x.unit === undefined ? undefined : (plain(x.unit, 12) ?? undefined);
    if (!rl || places === null) return null;
    // Every value the slider can reach must give a number (a division by zero anywhere drops the block).
    for (let k = 0; k <= 20; k++) if (sliderValue(expression, min + ((max - min) * k) / 20) === null) return null;
    readouts.push({ label: rl, expression, ...(ru ? { unit: ru } : {}), places });
  }
  if (readouts.length === 0 && !fraction) return null;
  return { type: 'slider', title, label, ...(unit ? { unit } : {}), min, max, step, start, readouts, ...(fraction ? { fraction } : {}) };
}

function model3dBlock(o: Record<string, unknown>): Model3D | null {
  const title = plain(o.title, 120);
  const alt = plain(o.alt, 300);
  const solid = SOLID_KINDS.find((k) => k === o.solid);
  if (!title || !alt || !solid) return null;
  const given = record(o.dims);
  const dims: Record<string, number> = {};
  for (const [name, r] of Object.entries(SOLID_INPUTS[solid])) {
    const v = within(given[name], r.min, r.max);
    if (v === null) return null;
    dims[name] = v;
  }
  const unit = o.unit === undefined ? undefined : (plain(o.unit, 12) ?? undefined);
  return { type: 'model_3d', title, solid, dims, alt, ...(unit ? { unit } : {}) };
}

function chapterTestBlock(o: Record<string, unknown>): ChapterTest | null {
  const title = plain(o.title, 120);
  if (!title || !Array.isArray(o.items) || o.items.length < 1 || o.items.length > 8) return null;
  const items: TestItem[] = [];
  const seen = new Set<string>();
  for (const raw of o.items) {
    const x = record(raw);
    const id = typeof x.id === 'string' && /^[a-z0-9_-]{1,20}$/i.test(x.id) && !seen.has(x.id) ? x.id : null;
    const question = plain(x.question, 400);
    if (!id || !question) return null;
    seen.add(id);
    if (x.kind === 'mcq') {
      const options = list(x.options, 2, 5, (v) => plain(v, 160));
      const answer = Number(x.answer);
      const why = plain(x.why, 400);
      if (!options || !Array.isArray(x.options) || options.length !== Math.min(x.options.length, 5) || !Number.isInteger(answer) || answer < 0 || answer >= options.length || !why) return null;
      items.push({ kind: 'mcq', id, question, options, answer, why });
    } else if (x.kind === 'written' || x.kind === 'photo') {
      // The rubric is what the parent or teacher marks against and what the child sees: never turned into a score here.
      const rubric = list(x.rubric, 1, 6, (v) => plain(v, 200));
      if (!rubric || !Array.isArray(x.rubric) || rubric.length !== Math.min(x.rubric.length, 6)) return null;
      items.push({ kind: x.kind, id, question, rubric });
    } else return null;
  }
  return { type: 'chapter_test', title, items };
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
  return parsed(line, false);
}
// A line read back from what this server kept (see checkStoredBlock).
export function parseStoredBlockLine(line: string): Block | null {
  return parsed(line, true);
}

function parsed(line: string, stored: boolean): Block | null {
  const start = line.indexOf('{');
  const end = line.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const b = checked(JSON.parse(line.slice(start, end + 1)), stored);
    return b && !CHAPTER_ONLY_TYPES.includes(b.type) ? b : null;
  } catch {
    return null;
  }
}

// A whole response's blocks: the first of each type that passed, in a fixed teaching order. null when a required
// block is missing (the response is then not shown as complete and never cached).
// At most one interactive block: the first that passed.
// W9-C: a figure and steps after the explanation, the photograph after the figure, a timeline after the key points, the
// videos last.
const ORDER: BlockType[] = ['explanation', 'figure', 'image', 'steps', 'worked_example', 'diagram', 'mind_map', ...INTERACTIVE_TYPES, 'key_points', 'timeline', 'check', 'practice', 'english_moment', 'sources', 'videos'];
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

// ---- narration (S1, C374) ------------------------------------------------------------------------------------------

// The only block types narration reads: teaching text. Everything else (a diagram, a table, an interactive, a check or
// practice, an English moment with its own speaker button, sources, and any type added later, such as a picture or a
// formula drawn as one) is silent: an allow-list, so a new type cannot become readable by being forgotten here.
export const READ_ALOUD_TYPES: readonly BlockType[] = ['explanation', 'worked_example', 'key_points'];
export const readsAloud = (b: Block): boolean => READ_ALOUD_TYPES.includes(b.type) && b.tts_read_aloud !== false;

// FNV-1a over the block's content (its id and flag left out), as 8 hex digits: the same block gives the same id on
// every phone and every load.
function contentHash(b: Block): string {
  const { id: _id, tts_read_aloud: _tts, ...body } = b;
  const text = JSON.stringify(body);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// Each block's stable id: its own when it has a valid one, else `<type>-<content hash>`; a repeat gets `-2`, `-3`.
export function blockIds(blocks: readonly Block[]): string[] {
  const used = new Set<string>();
  return blocks.map((b) => {
    const base = b.id && BLOCK_ID.test(b.id) ? b.id : `${b.type.replace(/_/g, '-')}-${contentHash(b)}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  });
}

// Sentences of a plain text: cut after . ! ? or the Devanagari danda (।) when a space follows, so "3.5" and "e.g.x"
// stay whole. Empty pieces are dropped.
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?\u0964])\s+/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

// The texts a readable block says, in the order it shows them. A worked step's expression is a formula: never read.
function spokenTexts(b: Block): string[] {
  switch (b.type) {
    case 'explanation':
      return [b.title, b.idea, ...(b.paragraphs ?? []), b.example, ...b.steps];
    case 'worked_example':
      return [b.problem, ...b.steps.map((s) => s.text), b.answer];
    case 'key_points':
      return [...b.points];
    default:
      return [];
  }
}

// One line of narration: the block it belongs to (by stable id), its place among that block's sentences, the text.
export type NarrationLine = { blockId: string; sentence: number; text: string };

// The chapter's narration, in reading order: every sentence of every readable block, nothing else.
export function narrationScript(blocks: readonly Block[]): NarrationLine[] {
  const ids = blockIds(blocks);
  const out: NarrationLine[] = [];
  blocks.forEach((b, i) => {
    if (!readsAloud(b)) return;
    let n = 0;
    for (const t of spokenTexts(b)) for (const s of sentences(t)) out.push({ blockId: ids[i], sentence: n++, text: s });
  });
  return out;
}
