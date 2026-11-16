import {
  lessonColors,
  lessonTints,
  type LessonTint,
} from "@/lib/design-tokens";
import {
  checkCount,
  ELAB_KEYS,
  leadLevel,
  type ElabKey,
  type ElabPic,
  type Elaboration,
} from "./elaboration";
import type { ChapterDiagram } from "./tutor-context";
import { bestDiagram } from "./visuals/showcase";

// The server's half of the Elaboration Framework: the five pictures (never drawn by the model). Kept apart from
// elaboration.ts so the phone's bundle does not carry the chapter files' reader.

const xml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const wrap = (s: string, max: number): string[] => {
  const out: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    if (line && `${line} ${word}`.length > max) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out.slice(0, 2);
};
const STEP_TINT: Record<ElabKey, LessonTint> = {
  definition: "mint",
  levels: "lilac",
  real_life: "butter",
  try_it: "sky",
  future: "blush",
};

// A picture card of the step: the term in big letters with its own picture mark (the emoji the model chose for this
// step) on the step's tint. Drawn by us; a card is shown only because no authored diagram of the chapter fits the step.
export function cardSvg(
  key: ElabKey,
  n: number,
  term: string,
  mark: string | undefined,
): string {
  const tint = lessonTints[STEP_TINT[key]];
  const lines = wrap(term, 24);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" role="img">` +
    `<style>.m{animation:f 3s ease-in-out infinite;transform-origin:200px 96px}@keyframes f{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}</style>` +
    `<rect width="400" height="240" rx="24" fill="${tint.tint}"/>` +
    `<circle cx="36" cy="36" r="18" fill="${tint.accent}"/><text x="36" y="43" text-anchor="middle" font-size="20" font-weight="800" fill="#ffffff" font-family="sans-serif">${n}</text>` +
    (mark
      ? `<text class="m" x="200" y="124" text-anchor="middle" font-size="84">${xml(mark)}</text>`
      : "") +
    lines
      .map(
        (ln, i) =>
          `<text x="200" y="${mark ? 188 : 110 + i * 40}" dy="${mark ? i * 32 : 0}" text-anchor="middle" font-size="${mark ? 28 : 34}" font-weight="800" fill="${lessonColors.ink}" font-family="sans-serif">${xml(ln)}</text>`,
      )
      .join("") +
    `</svg>`
  );
}

// The five pictures of an elaboration. Step 1 and step 2 take an authored, animated diagram of the open chapter when one
// fits the question and the step (bestDiagram's relevance threshold; never the same diagram twice); every other step,
// and any step no diagram fits, is a card of its own. An unrelated diagram is never shown.
export function withPics(
  b: Elaboration,
  diagrams: readonly ChapterDiagram[],
  question: string,
  classLevel: number,
): Elaboration {
  const first = bestDiagram(
    diagrams,
    `${question} ${b.term} ${b.definition.text}`,
  );
  const second = bestDiagram(
    diagrams.filter((d) => d !== first),
    `${question} ${b.term} ${b.levels.advanced} ${b.levels.intermediate}`,
  );
  const diagramPic = (d: ChapterDiagram): ElabPic => ({
    svg: d.svg,
    caption: d.caption,
    kind: "diagram",
  });
  const marks = [
    b.icon,
    b.icon,
    b.real_life.icon ?? b.icon,
    b.icon,
    b.future.icon ?? b.icon,
  ];
  const pics = ELAB_KEYS.map((key, i): ElabPic => {
    const d = i === 0 ? first : i === 1 ? second : null;
    if (d) return diagramPic(d);
    const text = [
      b.definition.text,
      b.levels.basic,
      b.real_life.text,
      b.try_it.question,
      b.future.text,
    ][i];
    return {
      svg: cardSvg(key, i + 1, b.term, marks[i]),
      caption: text,
      kind: "card",
    };
  });
  // One to three multiple-choice questions by the topic's complexity, after step 5 only.
  const checks = b.checks.slice(0, checkCount(classLevel, question, b.levels.advanced));
  return { ...b, lead: leadLevel(classLevel), checks, pics };
}
