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
export const EXTRA_KEYS = ["home", "fact", "india", "trick", "whatif"] as const;
export type ExtraKey = (typeof EXTRA_KEYS)[number];
export type ElabExtras = Partial<Record<ExtraKey, string>>;
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
  // Multiple-choice questions, shown after step 5 only: one to three (older prompts) or two to five (prompt v21).
  checks: ElabCheck[];
  // Prompt v21: short creative extras after the steps (an activity at home, a fun fact, India, a memory trick, a what-if).
  extras?: ElabExtras;
  // Prompt v21: five short English search terms for the 3D model of each step ("" when 3D teaches nothing for that step). Server use only.
  q3d?: string[];
  // Up to five search words for a photograph of each step (server use only; never shown).
  queries: string[];
  // One picture per step, in step order, filled by the server (null only before the server has filled them).
  pics: (ElabPic | null)[];
  // A curated simulation for the topic (content.curated_topic_sims), shown in step 4 as a "Try it yourself" card beside the photos, never instead of them. Set by the server only.
  sim?: ElabSim;
  // The topic as the tutor named it (src/lib/family/intent.ts): in English (a search phrase) and in the answer's own script. Server use only.
  topic?: { en: string; local: string | null };
};


// Up to five questions are kept (prompt v21 asks for two to five); an older prompt's block is cut back to its class count (checkCount).
export const MAX_CHECKS = 5;
export const MIN_CHECKS_V21 = 2;
export const OLD_MAX_CHECKS = 3;
// How many multiple-choice questions a topic earns (1 to 3): the youngest classes one; from Class 6 two; three when the
// class is 9 or higher or the question and the advanced level show a many-part topic.
export function checkCount(classLevel: number, question: string, advanced: string): number {
  if (classLevel <= 2) return 1;
  let n = classLevel >= 6 ? 2 : 1;
  if (classLevel >= 9 || (question.split(/\s+/).length >= 9 && advanced.length > 360)) n += 1;
  return Math.min(OLD_MAX_CHECKS, n);
}
// A prompt v21 block (it carries `extras` or `q3d`) keeps every valid question, two to five; an older block keeps its class count.
export const isDeepElab = (b: Pick<Elaboration, "extras" | "q3d">): boolean => b.extras !== undefined || b.q3d !== undefined;
export const checksKept = (b: Elaboration, classLevel: number, question: string): number =>
  isDeepElab(b) ? MAX_CHECKS : checkCount(classLevel, question, b.levels.advanced);

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

const EXTRA_MAX = 400;
// The creative extras: each short and optional. Present (maybe empty) only when the line or stored block has them.
function extrasOf(v: unknown): ElabExtras | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const out: ElabExtras = {};
  for (const k of EXTRA_KEYS) {
    const t = plain(o[k], EXTRA_MAX);
    if (t) out[k] = t;
  }
  return out;
}
const EN_TERM = /^[A-Za-z][A-Za-z0-9 '-]{2,39}$/;
// Five English search terms for 3D, one per step: a plain English phrase of 3 to 40 letters, or "" for no 3D on that step.
function q3dOf(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return ELAB_KEYS.map((_, i) => {
    const t = typeof v[i] === "string" ? v[i].replace(/\s+/g, " ").trim() : "";
    return EN_TERM.test(t) ? t.toLowerCase() : "";
  });
}

// ---- the safe question that tops a block up to two (prompt v21) ----------------------------------------------------------
const sentencesOf = (t: string): string[] =>
  t.split(/(?<=[.!?\u0964])\s+/).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 4 && x.length <= 200);
// The right sentence with its words in a wrong order: never a true statement, in any language.
const scrambled = (s: string, how: number): string => {
  const end = /[.!?\u0964]$/.test(s) ? s.slice(-1) : "";
  const w = (end ? s.slice(0, -1) : s).split(/\s+/);
  const out = how === 0 ? [...w].reverse() : [...w.slice(Math.ceil(w.length / 2)), ...w.slice(0, Math.ceil(w.length / 2))];
  return `${out.join(" ")}${end}`;
};
const HINDI = /[\u0900-\u097F]/;
function topUpChecks(checks: ElabCheck[], texts: string[], hindi: boolean): ElabCheck[] {
  const out = [...checks];
  const used = new Set(out.map((c) => c.question));
  const pool = texts.flatMap(sentencesOf);
  const words = hindi
    ? { q: "इनमें से कौन-सा वाक्य सही है?", right: "हाँ, यही वाक्य सही है।", hint: "वाक्य के शब्द अपनी सही जगह पर होने चाहिए। फिर से पढ़ो।" }
    : { q: "Which sentence is right?", right: "Yes, this is the sentence you read.", hint: "The words of the right sentence are in the right order. Read again." };
  for (const sentence of pool) {
    if (out.length >= MIN_CHECKS_V21) break;
    const options = [sentence, scrambled(sentence, 0), scrambled(sentence, 1)];
    if (new Set(options).size !== 3) continue;
    const answer = out.length % 3;
    const placed = [...options.slice(1, answer + 1), sentence, ...options.slice(answer + 1)];
    const question = used.has(words.q) ? `${words.q} (${out.length + 1})` : words.q;
    used.add(question);
    out.push({ question, options: placed.map((o) => o.slice(0, 200)), answer, right: words.right, hint: words.hint });
  }
  return out;
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
  const definition = plain(d.text, 1200);
  const basic = plain(l.basic, 1600);
  const intermediate = plain(l.intermediate, 2400);
  const advanced = plain(l.advanced, 3000);
  const real = plain(r.text, 1600);
  const question = plain(t.question, 400);
  const right = plain(t.right, 1500);
  const hint = plain(t.hint, 220);
  // The multiple-choice questions after step 5. A stored block from before this shape had its choices inside step 4:
  // they are moved here.
  const rawChecks = Array.isArray(o.checks) ? o.checks : Array.isArray(t.options) ? [t] : [];
  let checks = rawChecks
    .slice(0, MAX_CHECKS + 3)
    .map(check)
    .filter((c): c is ElabCheck => c !== null)
    .slice(0, MAX_CHECKS);
  const future = plain(f.text, 1200);
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
  const extras = extrasOf(o.extras);
  const q3d = q3dOf(o.q3d);
  // Prompt v21 (a line with extras or q3d) asks for two to five questions: a line with fewer valid ones is topped up with a
  // safe question built from its own steps, and rejected only when that is impossible.
  if (!stored && (extras !== undefined || q3d !== undefined) && checks.length < MIN_CHECKS_V21)
    checks = topUpChecks(checks, [definition, basic, real, future], [term, definition, basic].some((x) => HINDI.test(x)));
  // Questions after step 5 are required from the model; a stored block may predate them.
  if (!checks.length && !stored) return null;
  if (!stored && (extras !== undefined || q3d !== undefined) && checks.length < MIN_CHECKS_V21) return null;
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
    definition: { text: definition, say: plain(d.say, 900) ?? definition },
    levels: {
      basic,
      intermediate,
      advanced,
      say: plain(l.say, 2400) ?? `${basic} ${intermediate} ${advanced}`,
    },
    real_life: {
      text: real,
      say: plain(r.say, 1200) ?? real,
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
      say: plain(f.say, 1000) ?? future,
      ...(icon(f.icon) ? { icon: icon(f.icon) } : {}),
    },
    checks,
    ...(extras ? { extras } : {}),
    ...(q3d ? { q3d } : {}),
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
