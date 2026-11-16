import { chapterDiagrams, type ChapterDiagram, type Files } from '@/lib/family/tutor-context';
import { checkStoredBlock, type Block } from '@/lib/family/blocks';

// Tutor overhaul, slice 1: the showcase. A question asked while a reader chapter is open is answered with that chapter's
// own authored, animated diagram, chosen by the words it shares with the question. The model never writes it and never
// draws coordinates: the server reads our own chapter file and adds one `showcase` block. Nothing is fetched from outside.

const STOP = new Set(['what', 'which', 'with', 'that', 'this', 'from', 'about', 'does', 'have', 'into', 'your', 'when', 'where', 'there', 'their', 'show', 'explain', 'tell', 'why', 'how', 'the', 'and', 'are', 'can', 'for']);
const words = (s: string): string[] => (s.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !STOP.has(w));

// The diagram that fits the question best (at least one shared word), else null: a diagram the question has nothing to
// do with is not shown.
export function bestDiagram(diagrams: readonly ChapterDiagram[], question: string): ChapterDiagram | null {
  const ask = new Set(words(question));
  if (ask.size === 0) return null;
  let best: ChapterDiagram | null = null;
  let top = 0;
  for (const d of diagrams) {
    const score = [...new Set(words(d.text))].filter((w) => ask.has(w) || [...ask].some((q) => q.length >= 5 && w.length >= 5 && (q.startsWith(w.slice(0, 5)) || w.startsWith(q.slice(0, 5))))).length;
    if (score > top) {
      top = score;
      best = d;
    }
  }
  return best;
}

export async function showcaseFor(chapterKey: string | null, question: string, lang: string, files?: Files): Promise<Block | null> {
  if (!chapterKey) return null;
  try {
    const picked = bestDiagram(await chapterDiagrams(chapterKey, lang === 'hi' ? 'hi' : 'en', files), question);
    return picked ? checkStoredBlock({ type: 'showcase', title: picked.title, caption: picked.caption, svg: picked.svg }) : null;
  } catch {
    return null;
  }
}
