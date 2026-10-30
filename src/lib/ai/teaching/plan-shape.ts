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

export const DEPTHS = ['short', 'standard', 'full'] as const;
export type Depth = (typeof DEPTHS)[number];

export const VISUAL_KINDS = ['figure', 'steps', 'timeline', 'image', 'video'] as const;
export type VisualKind = (typeof VISUAL_KINDS)[number];

export const INTERACTIVE_BLOCKS = ['graph', 'number_line', 'fraction_model', 'geometry', 'simulation'] as const;
// The blocks a plan may name: the resolver's teaching blocks, the new visual blocks (docs/39 "New blocks") and the
// interactive set.
export const PLAN_BLOCKS = ['explanation', 'worked_example', 'key_points', 'diagram', 'mind_map', 'check', 'practice', 'english_moment', 'figure', 'steps', 'timeline', 'image', 'videos', ...INTERACTIVE_BLOCKS] as const;
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
export const VISUAL_BLOCK: Record<VisualKind, PlanBlock> = { figure: 'figure', steps: 'steps', timeline: 'timeline', image: 'image', video: 'videos' };

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
  lkg_1: { standard: ['explanation', 'image', 'check'], full: ['explanation', 'image', 'check'] },
  c2_5: { standard: ['explanation', 'image', 'check'], full: ['explanation', 'image', 'key_points', 'check', 'practice'] },
  c6_8: { standard: ['explanation', 'steps', 'key_points', 'check', 'practice'], full: ['explanation', 'worked_example', 'figure', 'steps', 'key_points', 'check', 'practice'] },
  c9_10: { standard: ['explanation', 'worked_example', 'key_points', 'check', 'practice'], full: ['explanation', 'worked_example', 'diagram', 'key_points', 'check', 'practice'] },
  c11_12: { standard: ['explanation', 'worked_example', 'key_points', 'check', 'practice'], full: ['explanation', 'worked_example', 'diagram', 'key_points', 'check', 'practice'] },
};

export function blocksFor(band: Band, depth: Depth): PlanBlock[] {
  return depth === 'short' ? ['explanation', 'check'] : [...BAND_BLOCKS[band][depth]];
}

export type PlanContext = { classLevel: number; subject: string | null; lang: 'en' | 'hi' };

// The plan used when there is no planner, or its answer failed a check: the band's usual blocks at `standard` depth
// (a chapter or topic taught whole asks for `full`).
export function defaultPlan(ctx: PlanContext, depth: Depth = 'standard', questionType: QuestionType = 'concept'): Plan {
  const band = bandOf(ctx.classLevel);
  return { questionType, band, depth, blocks: blocksFor(band, depth), visuals: [], lang: ctx.lang };
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
  const p = o as Record<string, unknown>;
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
  let blocks: PlanBlock[];
  if (depth === 'short') blocks = blocksFor(band, 'short');
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
    blocks = blocks.slice(0, MAX_BLOCKS);
    if (!blocks.includes('check')) blocks[blocks.length - 1] = 'check';
    // LKG to Class 1: at most 60 words and one picture (docs/39 "Bands"), whatever else was asked.
    if (band === 'lkg_1') blocks = ['explanation', blocks.find((b) => b === 'figure' || b === 'image') ?? 'image', 'check'];
  }
  const kept = visuals.filter((v) => blocks.includes(VISUAL_BLOCK[v.kind]));
  return { plan: { questionType, band, depth, blocks, visuals: kept, lang: ctx.lang }, fromModel: true };
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
