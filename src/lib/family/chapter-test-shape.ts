import type { Block, BlockMeta, ChapterTest } from './blocks';

// A chapter test as the phone gets it (S5, C378): the questions and the options, never the answers or the reasons. A
// multiple-choice item carries a sealed token (chapter-tests.ts); a written or photo item carries its rubric, which the
// child may read. `preview`: the studio's preview, where nothing can be sent. Pure: safe for the phone.

export type PublicTestItem =
  | { kind: 'mcq'; id: string; question: string; options: string[]; token: string }
  | { kind: 'written'; id: string; question: string; rubric: string[] }
  | { kind: 'photo'; id: string; question: string; rubric: string[] };
export type PublicChapterTest = { type: 'chapter_test'; title: string; items: PublicTestItem[]; preview?: boolean } & BlockMeta;

// What the chapter reader draws: the authored blocks, with each test in its public form.
export type ReaderBlock = Exclude<Block, ChapterTest> | PublicChapterTest;

export const TEST_TEXT_MAX = 2000;

// The blocks for the studio's preview: each test in its public form with no token and no answer, flagged `preview`, so a
// reviewer reads exactly what a child reads and nothing can be sent.
export function previewBlocks(blocks: readonly Block[]): ReaderBlock[] {
  return blocks.map((b): ReaderBlock => {
    if (b.type !== 'chapter_test') return b;
    const items = b.items.map((i): PublicTestItem => (i.kind === 'mcq' ? { kind: 'mcq', id: i.id, question: i.question, options: i.options, token: '' } : { kind: i.kind, id: i.id, question: i.question, rubric: i.rubric }));
    return { type: 'chapter_test', title: b.title, items, preview: true, ...(b.id ? { id: b.id } : {}) };
  });
}

// The result the server gives after a test is sent. A multiple-choice item says whether it was right and why; a written or
// photo item only that it was kept for the parent or teacher: no score, no marking by the app.
export type TestResult = {
  attemptId: string;
  mcqTotal: number;
  mcqCorrect: number;
  items: { id: string; kind: 'mcq' | 'written' | 'photo'; correct?: boolean; why?: string }[];
};
