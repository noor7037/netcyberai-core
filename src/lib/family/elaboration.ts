import { plain, SHOWCASE_SVG_MAX, SVG_UNSAFE } from "./blocks";

// The NetCyberAI Elaboration Framework (founder, 16 Nov 2026). Every tutor answer is five steps, in this order:
//   1 Definition  what was asked, in one clear line
//   2 Three levels  Basic, Intermediate, Advanced (the child's class sets which level leads)
//   3 Real life  one scene the child sees every day
//   4 Try it  a small question the child answers, with instant feedback
//   5 Future line  where the topic is useful later
// Each step has all three formats: a picture to see (`pics`, drawn by the server, never by the model), the text to read,
// and the voice line to listen to (`say`, which the read-aloud and Teach me speak in this order). One block holds the
// whole answer, so the order can never be broken by a block the model forgot or put in another place.

export const ELAB_KEYS = [
  "definition",
  "levels",
  "real_life",
  "try_it",
  "future",
] as const;
export type ElabKey = (typeof ELAB_KEYS)[number];
export const LEVELS = ["basic", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];

export type ElabPic = {
  svg: string;
  caption: string;
  kind: "diagram" | "card";
};
export type Elaboration = {
  type: "elaboration";
  term: string;
  icon?: string;
  // The level that leads for this child's class (set by the server); the others are one tap away.
  lead: Level;
  definition: { text: string; say: string };
  levels: {
    basic: string;
    intermediate: string;
    advanced: string;
    say: string;
  };
  real_life: { text: string; say: string; icon?: string };
  try_it: {
    question: string;
    options: string[];
    answer: number;
    right: string;
    hint: string;
    say: string;
  };
  future: { text: string; say: string; icon?: string };
  // One picture per step, in step order, filled by the server (null only before the server has filled them).
  pics: (ElabPic | null)[];
};

// LKG to Class 5 lead with Basic, Classes 6 to 10 with Intermediate, Classes 11 and 12 with Advanced.
export const leadLevel = (classLevel: number): Level =>
  classLevel <= 5 ? "basic" : classLevel <= 10 ? "intermediate" : "advanced";
// LKG to Class 2 stay short and picture-led: the prompt asks for one short sentence at each level.
export const isYoungElab = (classLevel: number): boolean => classLevel <= 2;

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const icon = (v: unknown): string | undefined =>
  typeof v === "string" &&
  v.length <= 8 &&
  /^\p{Extended_Pictographic}/u.test(v)
    ? v
    : undefined;

function pic(v: unknown): ElabPic | null {
  const o = obj(v);
  const svg = typeof o.svg === "string" ? o.svg.trim() : "";
  const caption = plain(o.caption, 240);
  if (
    !svg.startsWith("<svg") ||
    svg.length > SHOWCASE_SVG_MAX ||
    SVG_UNSAFE.test(svg) ||
    !caption
  )
    return null;
  return { svg, caption, kind: o.kind === "diagram" ? "diagram" : "card" };
}

// The model's line (or a stored block) as an elaboration, or null when any of the five steps is missing or too long.
// `stored`: the server's own pictures and lead level are kept; from the model they are never taken.
export function elaborationBlock(
  o: Record<string, unknown>,
  stored: boolean,
): Elaboration | null {
  const term = plain(o.term, 80);
  const d = obj(o.definition);
  const l = obj(o.levels);
  const r = obj(o.real_life);
  const t = obj(o.try_it);
  const f = obj(o.future);
  const definition = plain(d.text, 240);
  const basic = plain(l.basic, 420);
  const intermediate = plain(l.intermediate, 520);
  const advanced = plain(l.advanced, 620);
  const real = plain(r.text, 420);
  const question = plain(t.question, 220);
  const options = Array.isArray(t.options)
    ? t.options
        .slice(0, 4)
        .map((x) => plain(x, 90))
        .filter((x): x is string => x !== null)
    : [];
  const answer =
    typeof t.answer === "number" && Number.isInteger(t.answer) ? t.answer : -1;
  const right = plain(t.right, 220);
  const hint = plain(t.hint, 220);
  const future = plain(f.text, 320);
  if (
    !term ||
    !definition ||
    !basic ||
    !intermediate ||
    !advanced ||
    !real ||
    !question ||
    !right ||
    !hint ||
    !future
  )
    return null;
  if (
    options.length < 2 ||
    answer < 0 ||
    answer >= options.length ||
    new Set(options).size !== options.length
  )
    return null;
  const pics =
    Array.isArray(o.pics) && stored
      ? ELAB_KEYS.map((_, i) => pic((o.pics as unknown[])[i]))
      : ELAB_KEYS.map(() => null);
  return {
    type: "elaboration",
    term,
    ...(icon(o.icon) ? { icon: icon(o.icon) } : {}),
    lead:
      stored && LEVELS.includes(o.lead as Level) ? (o.lead as Level) : "basic",
    definition: { text: definition, say: plain(d.say, 260) ?? definition },
    levels: {
      basic,
      intermediate,
      advanced,
      say: plain(l.say, 700) ?? `${basic} ${intermediate} ${advanced}`,
    },
    real_life: {
      text: real,
      say: plain(r.say, 460) ?? real,
      ...(icon(r.icon) ? { icon: icon(r.icon) } : {}),
    },
    try_it: {
      question,
      options,
      answer,
      right,
      hint,
      say: plain(t.say, 260) ?? question,
    },
    future: {
      text: future,
      say: plain(f.say, 360) ?? future,
      ...(icon(f.icon) ? { icon: icon(f.icon) } : {}),
    },
    pics,
  };
}

// The words each step speaks, in step order: what a voice reads and what a step's Listen button reads.
export const stepSay = (b: Elaboration): string[] => [
  b.definition.say,
  b.levels.say,
  b.real_life.say,
  b.try_it.say,
  b.future.say,
];
export const elaborationSpeech = (b: Elaboration): string[] =>
  stepSay(b).filter((s) => s.trim().length > 0);

// The step the sentence being spoken belongs to (0 to 4). `sentences` is the answer's spoken sentences (call.ts
// spokenSentences): each step's say starts at the first sentence that begins with its words, searched in order.
export function stepAtSentence(
  b: Elaboration,
  sentences: readonly string[],
  sentence: number | undefined,
): number {
  if (sentence === undefined || sentence < 0) return 0;
  const says = stepSay(b);
  let from = 0;
  let active = 0;
  for (let i = 0; i < says.length; i++) {
    const head = says[i].slice(0, 24);
    const at = sentences.findIndex(
      (s, j) => j >= from && head.startsWith(s.slice(0, 24)) && s.length > 0,
    );
    if (at < 0) continue;
    if (at <= sentence) active = i;
    from = at + 1;
  }
  return active;
}
