import type { Explanation, Sources } from './blocks';

// The citation chip (W16-A2, docs/39 §6): every answer says first where it comes from. Prompt v9 writes exactly one
// sources block naming the chapter whenever the library's passages were given, and none when they were not. Pure.

export type Citation = { kind: 'chapter'; title: string; unit?: string } | { kind: 'general' };

const isChapterSource = (b: { type: string }): b is Sources => b.type === 'sources' && typeof (b as Sources).chapter === 'string';

// An answer from before v9 that quotes its chapter in its words ("From your chapter …", v8): no chip says otherwise.
const QUOTES_CHAPTER = /from your chapter|आपके अध्याय|aapke adhyay|apke adhyay/i;

// The chip for an answer's blocks: its chapter as soon as the sources block names one; once the answer is complete
// (`done`) and none did, "general knowledge", unless its explanation quotes a chapter in its own words. null: no chip
// (still arriving, or nothing to say). C509: `hasBook` false (the class has no published book in the answer's subject):
// no "not from your book" chip, since there is no book to be from.
export function citationOf(blocks: readonly { type: string }[], done: boolean, hasBook = true): Citation | null {
  const s = blocks.find(isChapterSource);
  if (s?.chapter) return { kind: 'chapter', title: s.chapter, ...(s.unit ? { unit: s.unit } : {}) };
  if (!done || !hasBook) return null;
  const e = blocks.find((b): b is Explanation => b.type === 'explanation');
  if (!e) return null;
  if (QUOTES_CHAPTER.test([e.idea, ...(e.paragraphs ?? [])].join(' '))) return null;
  return { kind: 'general' };
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// The quality checks' view (the orchestrator's validators list, W16-A1): what is wrong with an answer's citation, given
// the passages the prompt carried. Empty: nothing.
export function citationProblems(blocks: readonly { type: string }[], passages: readonly { title: string }[]): string[] {
  const named = blocks.filter(isChapterSource);
  if (passages.length === 0) return named.length > 0 ? ['a chapter is named, but no passage of the library was given'] : [];
  if (named.length === 0) return ['no sources block names the chapter, though passages were given'];
  const out: string[] = [];
  if (named.length > 1) out.push(`${named.length} sources blocks name a chapter (one asked)`);
  for (const s of named) if (!passages.some((p) => same(p.title, s.chapter ?? ''))) out.push(`the chapter named is not one of the passages: ${s.chapter}`);
  return out;
}
