import waterCycle from './showcase/water-cycle.json';
import equalFractions from './showcase/equal-fractions.json';
import { blockIds, checkBlock, narrationScript, type Block, type NarrationLine } from './blocks';

// The chapter reader's content (S1, C374; docs/37 §3 decision 7 and 9). A chapter is an ordered list of the one typed
// block schema (./blocks.ts) per language, NetCyber-authored: no textbook prose. The two showcase chapters are files
// under ./showcase/, checked here on load; a block that fails its shape, a missing or repeated id, or a Hindi version
// without Devanagari fails the whole chapter (it is then not offered at all). Chapters from the content studio will
// come through the same checker. Server only: the files are read on the server and the page hands the blocks on.

export type ChapterLang = 'en' | 'hi';
export type Chapter = { key: string; subject: string; title: Record<ChapterLang, string>; blocks: Record<ChapterLang, Block[]> };
export type ChapterView = { key: string; subject: string; lang: ChapterLang; title: string; blocks: Block[]; ids: string[]; script: NarrationLine[] };

export const CHAPTER_KEY = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const DEVANAGARI = /[ऀ-ॿ]/;

// Why a chapter was refused, as a short code the studio shows next to the field: bad_key, bad_subject, title_en,
// title_hi (missing, too long, or without Devanagari), blocks_en / blocks_hi (not 1-40 blocks), block_en:N / block_hi:N
// (the Nth block, from 1, fails its shape), ids_en / ids_hi (a missing or repeated id), no_devanagari_hi.
export function chapterProblem(raw: unknown): { ok: true; chapter: Chapter } | { ok: false; problem: string } {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (typeof o.key !== 'string' || !CHAPTER_KEY.test(o.key)) return { ok: false, problem: 'bad_key' };
  if (typeof o.subject !== 'string' || !/^[a-z][a-z_]{1,39}$/.test(o.subject)) return { ok: false, problem: 'bad_subject' };
  const title = (o.title ?? {}) as Record<string, unknown>;
  const blocks = (o.blocks ?? {}) as Record<string, unknown>;
  const out: Chapter = { key: o.key, subject: o.subject, title: { en: '', hi: '' }, blocks: { en: [], hi: [] } };
  for (const lang of ['en', 'hi'] as const) {
    const t = title[lang];
    if (typeof t !== 'string' || t.length < 1 || t.length > 120 || (lang === 'hi' && !DEVANAGARI.test(t))) return { ok: false, problem: `title_${lang}` };
    const list = blocks[lang];
    if (!Array.isArray(list) || list.length < 1 || list.length > 40) return { ok: false, problem: `blocks_${lang}` };
    const checked = list.map(checkBlock);
    const bad = checked.findIndex((b) => b === null);
    if (bad >= 0) return { ok: false, problem: `block_${lang}:${bad + 1}` };
    const bs = checked as Block[];
    // Authored content names every block, once: the saved reading position points at these ids.
    const ids = bs.map((b) => b.id);
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return { ok: false, problem: `ids_${lang}` };
    if (lang === 'hi' && !bs.some((b) => DEVANAGARI.test(JSON.stringify(b)))) return { ok: false, problem: 'no_devanagari_hi' };
    out.title[lang] = t;
    out.blocks[lang] = bs;
  }
  return { ok: true, chapter: out };
}

export function checkChapter(raw: unknown): Chapter | null {
  const r = chapterProblem(raw);
  return r.ok ? r.chapter : null;
}

// Block ids across versions (S3, C376): a saved reading place points at a block id, so a new version keeps the ids of
// the blocks it keeps. A block without an id takes the id of the block at the same position and of the same type in
// the version it was made from, else the id derived from its own content; ids already used are never repeated.
export function stabilizeIds(previous: readonly Block[], next: readonly Block[]): Block[] {
  const taken = new Set(next.map((b) => b.id).filter((id): id is string => !!id));
  const out = next.map((b, i) => {
    if (b.id) return b;
    const before = previous[i];
    const inherited = before && before.type === b.type && before.id && !taken.has(before.id) ? before.id : null;
    if (inherited) taken.add(inherited);
    return inherited ? { ...b, id: inherited } : b;
  });
  const derived = blockIds(out);
  return out.map((b, i) => (b.id ? b : { ...b, id: derived[i] }));
}

// The ids of the old version that the new one no longer has: a reader who stopped in one of them resumes at the start
// of the chapter (resumeIndex). Shown to the reviewer before publication.
export const droppedIds = (previous: readonly Block[], next: readonly Block[]): string[] => {
  const keep = new Set(blockIds(next));
  return blockIds(previous).filter((id) => !keep.has(id));
};

const SHOWCASE: Chapter[] = [waterCycle, equalFractions].map(checkChapter).filter((c): c is Chapter => c !== null);

export const showcaseChapters = (): readonly Chapter[] => SHOWCASE;
export const showcaseChapter = (key: string): Chapter | null => SHOWCASE.find((c) => c.key === key) ?? null;
// The showcase chapter for a subject, for the Study page's one link.
export const showcaseFor = (subject: string): Chapter | null => SHOWCASE.find((c) => c.subject === subject) ?? null;

// A chapter in the child's language (Hindi or English; any other language reads the English version).
export function chapterView(c: Chapter, lang: string): ChapterView {
  const l: ChapterLang = lang === 'hi' ? 'hi' : 'en';
  const blocks = c.blocks[l];
  return { key: c.key, subject: c.subject, lang: l, title: c.title[l], blocks, ids: blockIds(blocks), script: narrationScript(blocks) };
}

// Is (blockId, sentence) a place in this chapter's narration, in either language? The saved position is checked
// against it before it is kept.
export function isNarrationPlace(c: Chapter, blockId: string, sentence: number): boolean {
  return (['en', 'hi'] as const).some((l) => narrationScript(c.blocks[l]).some((x) => x.blockId === blockId && x.sentence === sentence));
}

// Where narration resumes: the saved place's line, or the first line of the same block when that block now has fewer
// sentences, or the start.
export function resumeIndex(script: readonly NarrationLine[], saved: { blockId: string; sentence: number } | null): number {
  if (!saved) return 0;
  const exact = script.findIndex((x) => x.blockId === saved.blockId && x.sentence === saved.sentence);
  if (exact >= 0) return exact;
  const block = script.findIndex((x) => x.blockId === saved.blockId);
  return block >= 0 ? block : 0;
}
