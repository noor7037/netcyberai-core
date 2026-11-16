import {
  chapterDiagrams,
  type ChapterDiagram,
  type Files,
} from "@/lib/family/tutor-context";
import { checkStoredBlock, type Block } from "@/lib/family/blocks";

// Tutor overhaul, slice 1: the showcase. A question asked while a reader chapter is open is answered with that chapter's
// own authored, animated diagram, chosen by the words it shares with the question. The model never writes it and never
// draws coordinates: the server reads our own chapter file and adds one `showcase` block. Nothing is fetched from outside.

const STOP = new Set([
  "what",
  "which",
  "with",
  "that",
  "this",
  "from",
  "about",
  "does",
  "have",
  "into",
  "your",
  "when",
  "where",
  "there",
  "their",
  "show",
  "explain",
  "tell",
  "why",
  "how",
  "the",
  "and",
  "are",
  "can",
  "for",
]);
// Hindi question words that name no subject (a Hindi question is matched against the diagram's Hindi words too).
const STOP_HI = ['क्या', 'होते', 'होता', 'होती', 'हैं', 'कैसे', 'क्यों', 'कौन', 'बताओ', 'समझाओ', 'मुझे', 'कहाँ', 'कब', 'लिए', 'साथ', 'यह', 'वह'];
for (const w of STOP_HI) STOP.add(w);
const words = (s: string): string[] =>
  (s.toLowerCase().match(/[\p{L}\p{M}]{3,}/gu) ?? []).filter((w) => !STOP.has(w));

// Two words are the same idea when they are equal, or share their first four letters or more and differ only in a short ending
// (burns, burning; fraction, fractions), never equal and equation, or reaction and reactants.
const same = (a: string, b: string): boolean => {
  if (a === b) return true;
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n >= 4 && Math.min(a.length, b.length) - n <= 1 && Math.max(a.length, b.length) - n <= 3;
};

// How many of the question's words a diagram's own words share, and whether one of them is in its title.
export function diagramScore(
  d: ChapterDiagram,
  ask: readonly string[],
): { shared: number; inTitle: boolean } {
  const own = [...new Set(words(d.text))];
  const title = words(d.title);
  const hit = own.filter((w) => ask.some((q) => same(q, w)));
  return {
    shared: hit.length,
    inTitle: hit.some((w) => title.some((t) => same(t, w))),
  };
}

// The relevance threshold (the Equal-fractions-shows-chemistry bug): a diagram is shown only when it shares at least two
// of the question's words, or, for a one- or two-word question (a bare keyword), every word it has, one of them in the
// diagram's title. Else null: no picture is better than an unrelated one.
export function bestDiagram(
  diagrams: readonly ChapterDiagram[],
  question: string,
): ChapterDiagram | null {
  const ask = [...new Set(words(question))];
  if (ask.length === 0) return null;
  const need = Math.min(2, ask.length);
  let best: ChapterDiagram | null = null;
  let top = 0;
  for (const d of diagrams) {
    const { shared, inTitle } = diagramScore(d, ask);
    if (shared < need || (ask.length <= 2 && !inTitle)) continue;
    if (shared > top) {
      top = shared;
      best = d;
    }
  }
  return best;
}

// The chapter key names its class and subject (u.c10.science.jesc1.ch01).
export const keyScope = (
  chapterKey: string,
): { classLevel: number; subject: string } | null => {
  const m = /^u\.c(\d+)\.([a-z_]+)\./.exec(chapterKey);
  return m ? { classLevel: Number(m[1]), subject: m[2] } : null;
};

// `scope`: the child's class and the subject the question is in (when known). A chapter of another class or subject shows
// nothing, however many words match.
export type ShowScope = { classLevel?: number; subject?: string | null };
export const inScope = (chapterKey: string, scope?: ShowScope): boolean => {
  const k = keyScope(chapterKey);
  if (!k) return true;
  if (scope?.classLevel !== undefined && k.classLevel !== scope.classLevel)
    return false;
  return !scope?.subject || scope.subject === k.subject;
};

export async function showcaseFor(
  chapterKey: string | null,
  question: string,
  lang: string,
  files?: Files,
  scope?: ShowScope,
): Promise<Block | null> {
  if (!chapterKey || !inScope(chapterKey, scope)) return null;
  try {
    const picked = bestDiagram(
      await chapterDiagrams(chapterKey, lang === "hi" ? "hi" : "en", files),
      question,
    );
    return picked
      ? checkStoredBlock({
          type: "showcase",
          title: picked.title,
          caption: picked.caption,
          svg: picked.svg,
        })
      : null;
  } catch {
    return null;
  }
}
