import { plain, SHOWCASE_SVG_MAX, SVG_UNSAFE } from "./blocks";
import { modelUrl, photoUrl } from "./visuals/photo-hosts";
import { checkSim, type ElabSim } from "./sim-hosts";
import { cleanEnglish, cleanLocal } from "./topic-words";

// The NetCyberAI Elaboration Framework (founder, 16 Nov 2026). Every tutor answer is five steps, in this order:
//   1 Definition  what was asked, in one clear line
//   2 Three levels  Basic, Intermediate, Advanced (the child's class sets which level leads)
//   3 Real life  one scene the child sees every day
//   4 Try it  a small open task the child thinks about (no choices), with a hint and the answer on a tap
//   5 Future line  where the topic is useful later
// Each step has all three formats: a picture to see (`pics`, drawn by the server, never by the model), the text to read,
// and the voice line to listen to (`say`, which the read-aloud and Teach me speak in this order). One block holds the
// whole answer, so the order can never be broken by a block the model forgot or put in another place.
// Multiple-choice questions come only AFTER step 5, as `checks` (one to three by how complex the topic is). They are never
// an answer by themselves, never before step 5 and never inside a step: a block with checks and no five steps is rejected.

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

// A step's picture: an authored diagram of the open chapter, a licensed photograph the server found, a 3D model (with a
// still photograph for Data saver and weak phones), or, only when nothing better was found, a card the server drew.
// `credit`, `licence` and `source` stay in the data for the Picture credits page and are never drawn.
export type ElabModel = { format: "glb" | "sdf" | "pdb"; url: string };
export type ElabPic = {
  svg: string;
  caption: string;
  kind: "diagram" | "card" | "photo" | "model3d";
  url?: string;
  credit?: string;
  licence?: string;
  source?: string;
  from?: string;
  model?: ElabModel;
};
export type ElabCheck = {
  question: string;
  options: string[];
  answer: number;
  right: string;
  hint: string;
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
  // Step 4 is an open task: the child thinks, may ask for the hint, then sees the answer (`right`). No choices here.
  try_it: { question: string; right: string; hint: string; say: string };
  future: { text: string; say: string; icon?: string };
  // One to three multiple-choice questions, shown after step 5 only.
  checks: ElabCheck[];
  // Up to five search words for a photograph of each step (server use only; never shown).
  queries: string[];
  // One picture per step, in step order, filled by the server (null only before the server has filled them).
  pics: (ElabPic | null)[];
  // A curated simulation for the topic (content.curated_topic_sims), shown in step 4 as a "Try it yourself" card beside the photos, never instead of them. Set by the server only.
  sim?: ElabSim;
  // The topic as the tutor named it (src/lib/family/intent.ts): in English (a search phrase) and in the answer's own script. Server use only.
  topic?: { en: string; local: string | null };
};

export const MAX_CHECKS = 3;
// How many multiple-choice questions a topic earns (1 to 3): the youngest classes one; from Class 6 two; three when the
// class is 9 or higher or the question and the advanced level show a many-part topic.
export function checkCount(classLevel: number, question: string, advanced: string): number {
  if (classLevel <= 2) return 1;
  let n = classLevel >= 6 ? 2 : 1;
  if (classLevel >= 9 || (question.split(/\s+/).length >= 9 && advanced.length > 360)) n += 1;
  return Math.min(MAX_CHECKS, n);
}

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

function check(v: unknown): ElabCheck | null {
  const t = obj(v);
  const question = plain(t.question, 400);
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
  if (!question || !right || !hint) return null;
  if (
    options.length < 2 ||
    answer < 0 ||
    answer >= options.length ||
    new Set(options).size !== options.length
  )
    return null;
  return { question, options, answer, right, hint };
}

function pic(v: unknown): ElabPic | null {
  const o = obj(v);
  const caption = plain(o.caption, 300);
  if (!caption) return null;
  if (o.kind === "photo" || o.kind === "model3d") {
    const url = photoUrl(o.url);
    if (!url) return null;
    const out: ElabPic = {
      svg: "",
      caption,
      kind: "photo",
      url,
      ...(plain(o.credit, 120) ? { credit: plain(o.credit, 120)! } : {}),
      ...(plain(o.licence, 40) ? { licence: plain(o.licence, 40)! } : {}),
      ...(typeof o.source === "string" && o.source.startsWith("https://") && o.source.length < 400 ? { source: o.source } : {}),
      ...(plain(o.from, 30) ? { from: plain(o.from, 30)! } : {}),
    };
    const m = obj(o.model);
    const mu = modelUrl(m.url);
    if (o.kind === "model3d" && mu && (m.format === "glb" || m.format === "sdf" || m.format === "pdb")) return { ...out, kind: "model3d", model: { format: m.format, url: mu } };
    return o.kind === "model3d" ? null : out;
  }
  const svg = typeof o.svg === "string" ? o.svg.trim() : "";
  if (!svg.startsWith("<svg") || svg.length > SHOWCASE_SVG_MAX || SVG_UNSAFE.test(svg)) return null;
  return { svg, caption, kind: o.kind === "diagram" ? "diagram" : "card" };
}

// The tutor's own name for the topic: `topic_en` (plain English letters, 3 to 60) and `topic_local` from the model's line, or `topic` from a stored block.
function topicOf(o: Record<string, unknown>): { en: string; local: string | null } | null {
  const t = obj(o.topic);
  const en = cleanEnglish(o.topic_en ?? t.en);
  if (!en) return null;
  return { en, local: cleanLocal(o.topic_local ?? t.local) };
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
  const definition = plain(d.text, 700);
  const basic = plain(l.basic, 900);
  const intermediate = plain(l.intermediate, 1300);
  const advanced = plain(l.advanced, 1500);
  const real = plain(r.text, 900);
  const question = plain(t.question, 400);
  const right = plain(t.right, 800);
  const hint = plain(t.hint, 220);
  // The multiple-choice questions after step 5. A stored block from before this shape had its choices inside step 4:
  // they are moved here.
  const rawChecks = Array.isArray(o.checks) ? o.checks : Array.isArray(t.options) ? [t] : [];
  const checks = rawChecks
    .slice(0, MAX_CHECKS)
    .map(check)
    .filter((c): c is ElabCheck => c !== null);
  const future = plain(f.text, 700);
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
  // Questions after step 5 are required from the model; a stored block may predate them.
  if (!checks.length && !stored) return null;
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
    definition: { text: definition, say: plain(d.say, 520) ?? definition },
    levels: {
      basic,
      intermediate,
      advanced,
      say: plain(l.say, 1400) ?? `${basic} ${intermediate} ${advanced}`,
    },
    real_life: {
      text: real,
      say: plain(r.say, 760) ?? real,
      ...(icon(r.icon) ? { icon: icon(r.icon) } : {}),
    },
    try_it: {
      question,
      right,
      hint,
      say: plain(t.say, 400) ?? question,
    },
    future: {
      text: future,
      say: plain(f.say, 600) ?? future,
      ...(icon(f.icon) ? { icon: icon(f.icon) } : {}),
    },
    checks,
    queries: [d.q, l.q, r.q, t.q, f.q].map((x) => plain(x, 60) ?? ""),
    pics,
    ...(stored && checkSim(o.sim) ? { sim: checkSim(o.sim)! } : {}),
    ...(topicOf(o) ? { topic: topicOf(o)! } : {}),
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
