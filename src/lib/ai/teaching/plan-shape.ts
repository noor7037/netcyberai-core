// The teaching plan's shape and its checker (docs/39 §3 "Plan", W9-B). Pure: no database, no network.
//
// One short planning call (family.plan) says how a question is to be taught: its type, the class band, the depth, the
// blocks and the visuals. Nothing the model says is trusted: every field is checked against the enums below; the band
// comes from the child's class (the model may take it one band down for a simple question, never up, docs/39 "Bands");
// an interactive block is kept only for a problem, a process or an experiment in Mathematics or Science; the language
// is the child's. A plan that fails any check is replaced by the band's default plan, so the planner never blocks an
// answer.

export const QUESTION_TYPES = ['definition', 'concept', 'why_how', 'comparison', 'problem', 'derivation', 'process', 'experiment', 'history', 'case', 'application'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const BANDS = ['lkg_1', 'c2_5', 'c6_8', 'c9_10', 'c11_12'] as const;
export type Band = (typeof BANDS)[number];

export const DEPTHS = ['short', 'medium', 'full'] as const;
export type Depth = (typeof DEPTHS)[number];

// W10-6 (docs/39 §5): `scene` (a thing with parts, tap-able) and `chart` (numbers and comparisons) join the kinds.
export const VISUAL_KINDS = ['figure', 'steps', 'timeline', 'image', 'video', 'scene', 'chart'] as const;
export type VisualKind = (typeof VISUAL_KINDS)[number];

export const INTERACTIVE_BLOCKS = ['graph', 'number_line', 'fraction_model', 'geometry', 'simulation'] as const;
// The blocks a plan may name: the resolver's teaching blocks, the new visual blocks (docs/39 "New blocks") and the
// interactive set.
export const PLAN_BLOCKS = ['explanation', 'worked_example', 'key_points', 'diagram', 'mind_map', 'check', 'practice', 'english_moment', 'figure', 'steps', 'timeline', 'image', 'videos', 'scene', 'chart', ...INTERACTIVE_BLOCKS] as const;
export type PlanBlock = (typeof PLAN_BLOCKS)[number];

export type Visual = { kind: VisualKind; about: string };
export type Plan = { questionType: QuestionType; band: Band; depth: Depth; blocks: PlanBlock[]; visuals: Visual[]; lang: 'en' | 'hi' };

// The question types that may carry an interactive block, and the subjects (docs/39 §3: Mathematics or Science). Biology
// is left out on purpose: none of the interactive blocks (graphs, number lines, fractions, geometry, the four physics
// simulations) models a living thing's idea; that is the defect this slice fixes.
const INTERACTIVE_TYPES: readonly QuestionType[] = ['problem', 'process', 'experiment'];
const INTERACTIVE_SUBJECTS: readonly string[] = ['mathematics', 'science', 'physics', 'chemistry'];

export const VISUAL_ABOUT_MAX = 80;
const MAX_VISUALS = 3;
const MAX_BLOCKS = 9;

// The visual block each visual kind asks for.
export const VISUAL_BLOCK: Record<VisualKind, PlanBlock> = { figure: 'figure', steps: 'steps', timeline: 'timeline', image: 'image', video: 'videos', scene: 'scene', chart: 'chart' };

export const isInteractiveBlock = (b: string): boolean => (INTERACTIVE_BLOCKS as readonly string[]).includes(b);

// The band of a class (pre-primary reads as lkg_1; the resolver does not explain to pre-primary children anyway).
export function bandOf(classLevel: number): Band {
  if (classLevel <= 1) return 'lkg_1';
  if (classLevel <= 5) return 'c2_5';
  if (classLevel <= 8) return 'c6_8';
  if (classLevel <= 10) return 'c9_10';
  return 'c11_12';
}

// Whether an interactive block may be planned. `subject` null: a typed question whose subject the answer names first;
// the type decides here and the resolver's prompt holds the subject half (Mathematics or Science only).
export function interactiveAllowed(questionType: QuestionType, subject: string | null): boolean {
  return INTERACTIVE_TYPES.includes(questionType) && (subject === null || INTERACTIVE_SUBJECTS.includes(subject));
}

// The band's usual blocks at each depth. `short` is one explanation and one check (docs/39); `full` is the band's whole
// set. No default carries an interactive block: only a checked model plan can.
const BAND_BLOCKS: Record<Band, Record<Exclude<Depth, 'short'>, PlanBlock[]>> = {
  lkg_1: { medium: ['explanation', 'image', 'check'], full: ['explanation', 'image', 'check'] },
  c2_5: { medium: ['explanation', 'image', 'check'], full: ['explanation', 'image', 'key_points', 'check', 'practice'] },
  c6_8: { medium: ['explanation', 'steps', 'key_points', 'check', 'practice'], full: ['explanation', 'worked_example', 'figure', 'steps', 'key_points', 'check', 'practice'] },
  c9_10: { medium: ['explanation', 'worked_example', 'key_points', 'check', 'practice'], full: ['explanation', 'worked_example', 'diagram', 'key_points', 'check', 'practice'] },
  c11_12: { medium: ['explanation', 'worked_example', 'key_points', 'check', 'practice'], full: ['explanation', 'worked_example', 'diagram', 'key_points', 'check', 'practice'] },
};

export function blocksFor(band: Band, depth: Depth): PlanBlock[] {
  return depth === 'short' ? ['explanation', 'check'] : [...BAND_BLOCKS[band][depth]];
}

export type PlanContext = { classLevel: number; subject: string | null; lang: 'en' | 'hi' };

// The plan used when there is no planner, or its answer failed a check: the band's usual blocks at medium depth
// (a chapter or topic taught whole asks for `full`).
export function defaultPlan(ctx: PlanContext, depth: Depth = 'medium', questionType: QuestionType = 'concept'): Plan {
  const band = bandOf(ctx.classLevel);
  return { questionType, band, depth, blocks: bounded(withContentVisuals(blocksFor(band, depth), questionType, ctx.subject, NO_FLAGS), band), visuals: [], lang: ctx.lang };
}

// ---- the visual matches the content (W10-6, founder 30 Oct, docs/39 §5) ----
// Held here, in the checker, not only in the prompt: whatever the model planned (or forgot), the answer carries the
// visual its content calls for. None of these is an interactive block, so the interactive rule above is untouched.

// The visuals a Mathematics answer may carry; at least one in every answer (steps, the animated working, when none).
export const MATHS_VISUALS: readonly PlanBlock[] = ['number_line', 'graph', 'geometry', 'fraction_model', 'steps'];
// The question types a thing with parts is asked as (with the plan's own `hasParts` flag): a scene, tap-able part by part.
const PARTS_TYPES: readonly QuestionType[] = ['process', 'experiment', 'concept'];

// What the model says about the question's content: it is about a thing with parts (the body, a motor, a circuit, a
// flower); it compares numbers. Booleans only; anything else reads as false.
export type ContentFlags = { hasParts: boolean; hasNumbers: boolean };
const NO_FLAGS: ContentFlags = { hasParts: false, hasNumbers: false };
// The drawn visuals a concept may already carry in place of its mind map.
const DRAWN: readonly PlanBlock[] = ['mind_map', 'figure', 'diagram', 'scene', 'chart', 'timeline'];

// The plan's blocks with the content's visuals added right after the explanation (so a cut to MAX_BLOCKS keeps them):
//   - Mathematics: one of number_line, graph, geometry, fraction_model or steps; steps when the plan has none;
//   - history: a timeline; a process: a timeline, unless its stages are already a step strip;
//   - a comparison of numbers: a chart;
//   - a thing with parts (process, experiment or concept): a scene;
//   - any other concept: a mind map, unless it is drawn already (a figure, a diagram, a scene, a chart or a timeline).
export function withContentVisuals(blocks: readonly PlanBlock[], questionType: QuestionType, subject: string | null, flags: ContentFlags): PlanBlock[] {
  const add: PlanBlock[] = [];
  const has = (b: PlanBlock) => blocks.includes(b) || add.includes(b);
  if (subject === 'mathematics' && !blocks.some((b) => MATHS_VISUALS.includes(b))) add.push('steps');
  if (questionType === 'history' && !has('timeline')) add.push('timeline');
  if (questionType === 'process' && !has('timeline') && !has('steps')) add.push('timeline');
  if (questionType === 'comparison' && flags.hasNumbers && !has('chart')) add.push('chart');
  const parts = flags.hasParts && PARTS_TYPES.includes(questionType);
  if (parts && !has('scene')) add.push('scene');
  if (questionType === 'concept' && !parts && !DRAWN.some(has)) add.push('mind_map');
  if (add.length === 0) return [...blocks];
  const at = blocks.indexOf('explanation') + 1;
  return [...blocks.slice(0, at), ...add, ...blocks.slice(at)];
}

// The plan's length (MAX_BLOCKS, the check kept last) and LKG to Class 1's one picture (docs/39 "Bands"): at most 60
// words and one picture, whatever else was asked.
function bounded(list: PlanBlock[], band: Band): PlanBlock[] {
  let blocks = list.slice(0, MAX_BLOCKS);
  if (!blocks.includes('check')) blocks[blocks.length - 1] = 'check';
  if (band === 'lkg_1') blocks = ['explanation', blocks.find((b) => b === 'figure' || b === 'image') ?? 'image', 'check'];
  return blocks;
}

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

// The band the plan keeps: the class's own, or one below it when the model asked for that; anything else is the class's.
function keptBand(classBand: Band, asked: Band): Band {
  const i = BANDS.indexOf(classBand);
  return BANDS.indexOf(asked) === i - 1 ? asked : classBand;
}

// The planner's answer, parsed and checked. `raw` is the model's text: a JSON object, perhaps wrapped in a code fence or
// a sentence. Returns the default plan on any failure, and says whether the model's plan was used.
export function checkPlan(raw: unknown, ctx: PlanContext): { plan: Plan; fromModel: boolean } {
  const fallback = { plan: defaultPlan(ctx), fromModel: false };
  const o = typeof raw === 'string' ? parseObject(raw) : raw;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return fallback;
  const p = expanded(o as Record<string, unknown>);
  if (!oneOf(QUESTION_TYPES, p.questionType) || !oneOf(BANDS, p.band) || !oneOf(DEPTHS, p.depth) || !oneOf(['en', 'hi'] as const, p.lang)) return fallback;
  if (!Array.isArray(p.blocks) || p.blocks.length === 0 || !p.blocks.every((b) => oneOf(PLAN_BLOCKS, b))) return fallback;
  const rawVisuals = p.visuals === undefined ? [] : p.visuals;
  if (!Array.isArray(rawVisuals)) return fallback;
  const visuals: Visual[] = [];
  for (const v of rawVisuals) {
    if (!v || typeof v !== 'object') return fallback;
    const { kind, about } = v as Record<string, unknown>;
    if (!oneOf(VISUAL_KINDS, kind) || typeof about !== 'string' || about.trim().length === 0 || about.length > VISUAL_ABOUT_MAX) return fallback;
    if (visuals.length < MAX_VISUALS && !visuals.some((x) => x.kind === kind)) visuals.push({ kind, about: about.trim() });
  }
  const questionType = p.questionType;
  const depth = p.depth;
  const band = keptBand(bandOf(ctx.classLevel), p.band);
  const mayInteract = interactiveAllowed(questionType, ctx.subject);
  const flags: ContentFlags = { hasParts: p.hasParts === true, hasNumbers: p.hasNumbers === true };
  let blocks: PlanBlock[];
  // W10-6: even a short answer (one explanation and one check) carries the visual its content calls for.
  if (depth === 'short') blocks = bounded(withContentVisuals(blocksFor(band, 'short'), questionType, ctx.subject, flags), band);
  else {
    blocks = [];
    for (const b of p.blocks as PlanBlock[]) {
      if (blocks.includes(b)) continue;
      // At most one interactive block, and only where the rule allows one.
      if (isInteractiveBlock(b) && (!mayInteract || blocks.some(isInteractiveBlock))) continue;
      blocks.push(b);
    }
    // Every answer explains and checks (docs/39: even `short` is one explanation and one check).
    if (!blocks.includes('explanation')) blocks.unshift('explanation');
    if (!blocks.includes('check')) blocks.push('check');
    // A visual the plan describes has its block.
    for (const v of visuals) if (!blocks.includes(VISUAL_BLOCK[v.kind])) blocks.push(VISUAL_BLOCK[v.kind]);
    blocks = bounded(withContentVisuals(blocks, questionType, ctx.subject, flags), band);
  }
  const kept = visuals.filter((v) => blocks.includes(VISUAL_BLOCK[v.kind]));
  return { plan: { questionType, band, depth, blocks, visuals: kept, lang: ctx.lang }, fromModel: true };
}

// The compact answer (W10, family.plan v1): t the question type, b the band, d the depth, k the blocks, v the visuals
// (each k its kind, a what it shows), l the language; W10-6: p a thing with parts, n numbers compared. Read as the long
// keys; a long key the model also sent wins.
const COMPACT: Record<string, string> = { t: 'questionType', b: 'band', d: 'depth', k: 'blocks', v: 'visuals', l: 'lang', p: 'hasParts', n: 'hasNumbers' };
function expanded(o: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = { ...o };
  for (const [short, long] of Object.entries(COMPACT)) if (p[long] === undefined && o[short] !== undefined) p[long] = o[short];
  if (Array.isArray(p.visuals)) {
    p.visuals = p.visuals.map((v: unknown) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
      const x = v as Record<string, unknown>;
      return { kind: x.kind ?? x.k, about: x.about ?? x.a };
    });
  }
  return p;
}

// The first JSON object in the text, or null.
function parseObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
