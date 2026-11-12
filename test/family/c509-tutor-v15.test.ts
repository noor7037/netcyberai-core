import { describe, expect, it } from 'vitest';
import { LATEST_RESOLVER_PROMPT, RESOLVER_PROMPTS, resolverPrompt } from '@/lib/ai/prompts/family.resolver';
import { REFER_BACK_LINE, type ResolverAsk } from '@/lib/ai/prompts/family.resolver/v8';
import { resolverSystem as v14System } from '@/lib/ai/prompts/family.resolver/v14';
import {
  MEMORY_RULE,
  MIDDLE_BOARD_FIRST,
  NO_BOOK_LINE,
  NOT_FROM_BOOK_LINE,
  V8_GENERAL_LINE,
  V8_MEMORY_FOLLOW_LINE,
  VARIETY_LINE,
  YOUNG_BAND_LINE,
  YOUNG_BOARD_LINES,
  resolverSystem as v15System,
} from '@/lib/ai/prompts/family.resolver/v15';
import { checkPlan, defaultPlan, PLAN_BLOCKS } from '@/lib/ai/teaching/plan-shape';
import { bookSubjects } from '@/lib/family/book-search';
import type { Book } from '@/lib/family/books';
import { citationOf } from '@/lib/family/citation';
import { generate } from '@/lib/family/resolver';

const base: ResolverAsk = { board: 'CBSE', classLevel: 1, subject: null, openSubjects: ['mathematics', 'evs', 'english', 'hindi'], classSubjects: ['mathematics', 'evs', 'english', 'hindi'], chapter: null, topic: null, question: 'Why do balloons fly?', language: 'en', style: 'en', followUp: null, misconception: null };
const memory = { summary: null, turns: [{ role: 'child' as const, text: 'What is 2 + 3?' }, { role: 'tutor' as const, text: '2 + 3 = 5.' }] };

describe('prompt v15 (C509)', () => {
  it('is registered after v14, draws first, and v10 stays the fallback', () => {
    const versions = RESOLVER_PROMPTS.map((p) => p.version);
    expect(versions.indexOf('v15')).toBe(versions.indexOf('v14') + 1);
    const p = resolverPrompt('v15', true);
    expect(p.version).toBe('v15');
    expect(p.usesPlan && p.visualFirst).toBe(true);
    expect(resolverPrompt('v14', true).visualFirst).toBeUndefined();
    expect(LATEST_RESOLVER_PROMPT).toBe('v10');
  });

  it('gives the youngest band the board first, a 40-word explanation and a 3-option check, nothing else', () => {
    const s = v15System(base);
    expect(s).toContain(YOUNG_BAND_LINE);
    expect(s).toContain('Write ONLY these 3 blocks');
    const list = s.slice(s.indexOf('Write ONLY these 3 blocks'), s.indexOf('Besides those blocks'));
    expect(list).toMatch(/\n1\. A board block/);
    expect(list).toMatch(/\n2\. \{"type":"explanation"/);
    expect(list).toMatch(/\n3\. \{"type":"check"/);
    expect(list).toContain('at most 40 words');
    expect(list).toContain('no brackets, no symbols');
    expect(list).toContain('"options" has 2 or 3 choices, each a single word or a number');
    expect(list).not.toContain('"options" has 4 choices');
    for (const gone of ['worked_example', 'key_points', '"practice"', '"image"']) expect(list).not.toContain(gone);
    expect(s).toContain(YOUNG_BOARD_LINES[0]);
    expect(s).toContain('3 to 5 steps');
    expect(s).toContain('at most 12 words');
    expect(s).not.toContain('right after the explanation, drawn step by step');
    // Class 2 gets the same, in Hindi too.
    const c2 = v15System({ ...base, classLevel: 2, language: 'hi', style: 'hi' });
    expect(c2).toContain(YOUNG_BAND_LINE);
    expect(c2).toMatch(/\n1\. A board block/);
  });

  it('gives Classes 3 to 5 the lighter form: board first in Maths, EVS or Science, 90 words', () => {
    const maths = v15System({ ...base, classLevel: 4, subject: 'mathematics', question: 'What is half of 8?' });
    expect(maths).toContain(MIDDLE_BOARD_FIRST.known);
    expect(maths).toContain('at most 90 words');
    expect(maths).not.toContain(YOUNG_BAND_LINE);
    expect(v15System({ ...base, classLevel: 4, subject: 'english' })).not.toContain(MIDDLE_BOARD_FIRST.known);
    expect(v15System({ ...base, classLevel: 4 })).toContain(MIDDLE_BOARD_FIRST.named);
  });

  it('is v14 for Class 8 except the memory and variety lines', () => {
    const c8: ResolverAsk = { ...base, classLevel: 8, classSubjects: ['science', 'mathematics'], openSubjects: ['science'], subject: 'science', question: 'What is friction?', passages: [{ chapterKey: 'k', title: 'Friction', text: 'Friction opposes motion.', score: 5 }] };
    expect(v15System(c8).replace(`\n${VARIETY_LINE}`, '')).toBe(v14System(c8));
    const withMemory = { ...c8, memory };
    const v14m = v14System(withMemory);
    expect(v14m).toContain(`${V8_MEMORY_FOLLOW_LINE}\n${REFER_BACK_LINE}`);
    expect(v15System(withMemory).replace(`\n${VARIETY_LINE}`, '')).toBe(v14m.replace(`${V8_MEMORY_FOLLOW_LINE}\n${REFER_BACK_LINE}`, MEMORY_RULE));
  });

  it('refers back only on the same topic, never unconditionally', () => {
    const s = v15System({ ...base, memory });
    expect(s).toContain(MEMORY_RULE);
    expect(s).not.toContain(REFER_BACK_LINE);
    expect(s).not.toContain('MUST begin with one sentence that refers back');
    expect(MEMORY_RULE).toContain('ONLY when this question continues the same topic');
    expect(MEMORY_RULE).toContain("never begin with 'Earlier we saw', 'पहले हमने देखा'");
    expect(MEMORY_RULE).toContain('do not mention the earlier turns at all');
    // The memory text itself is kept.
    expect(s).toContain('Student: What is 2 + 3?');
  });

  it('says "not from your book" only where the class has a book, and nothing otherwise', () => {
    expect(v14System(base)).toContain(V8_GENERAL_LINE);
    expect(v15System({ ...base, subject: 'english', bookSubjects: ['english', 'hindi', 'mathematics'] })).toContain(NOT_FROM_BOOK_LINE);
    const evs = v15System({ ...base, subject: 'evs', bookSubjects: ['english', 'hindi', 'mathematics'] });
    expect(evs).toContain(NO_BOOK_LINE);
    expect(evs).not.toContain(V8_GENERAL_LINE);
    expect(v15System({ ...base, bookSubjects: ['mathematics'] })).toContain('If the subject you named is one of mathematics');
    expect(v15System({ ...base, bookSubjects: [] })).toContain(NO_BOOK_LINE);
    // A chapter open, or no book list given: v14's line stands.
    expect(v15System({ ...base, chapter: 'Shapes', bookSubjects: [] })).toContain(V8_GENERAL_LINE);
    expect(v15System(base)).toContain(V8_GENERAL_LINE);
  });

  it('lists the books of the class that exist', () => {
    const books: Book[] = [
      { id: 'b1', boards: ['cbse'], classLevel: 1, subject: 'english', chapters: [] },
      { id: 'b2', boards: ['cbse'], classLevel: 2, subject: 'evs', chapters: [] },
    ];
    expect(bookSubjects({ classLevel: 1, board: 'cbse', subjects: ['english', 'evs'] }, books)).toEqual(['english']);
  });

  it('hides the general chip when there is no book', () => {
    const ex = { type: 'explanation', idea: 'x', paragraphs: [] };
    expect(citationOf([ex], true)).toEqual({ kind: 'general' });
    expect(citationOf([ex], true, false)).toBeNull();
  });
});

describe('the youngest plan under v15', () => {
  it('names the board first, only when the prompt draws first', () => {
    expect(defaultPlan({ classLevel: 1, subject: 'english', lang: 'en', visualFirst: true }).blocks).toEqual(['board', 'explanation', 'check']);
    expect(defaultPlan({ classLevel: 2, subject: null, lang: 'en', visualFirst: true }).blocks).toEqual(['board', 'explanation', 'check']);
    expect(defaultPlan({ classLevel: 1, subject: 'english', lang: 'en' }).blocks).not.toContain('board');
    expect(defaultPlan({ classLevel: 3, subject: 'evs', lang: 'en', visualFirst: true }).blocks).not.toContain('board');
    const model = JSON.stringify({ t: 'concept', b: 'lkg_1', d: 'full', k: ['explanation', 'key_points', 'practice', 'check'], l: 'en' });
    expect(checkPlan(model, { classLevel: 1, subject: 'english', lang: 'en', visualFirst: true }).plan.blocks).toEqual(['board', 'explanation', 'check']);
    // The planner's own list is unchanged: it cannot name the board.
    expect(PLAN_BLOCKS as readonly string[]).not.toContain('board');
  });
});

describe('the resolver gate for a board (C509)', () => {
  const explanation = { type: 'explanation', title: 'Balloons', idea: 'Hot air is light, so it goes up.', example: 'A balloon at a fair.', steps: ['Warm air', 'Up it goes'], terms: [] };
  const board = { type: 'board', title: 'Up goes the balloon', steps: [1, 2, 3].map((n) => ({ n, say: `Step ${n}.`, commands: [{ kind: 'shape', shape: 'circle', at: [50, 50], r: 10 }] })) };
  const run = async (version: string, subject: string, plan: string[] | null) => {
    const text = [{ type: 'subject', subject }, board, explanation].map((b) => JSON.stringify(b));
    const g = await generate(
      {
        ctx: { accountId: 'a', child: { childId: 'c', firstName: 'X', classLevel: 1, board: 'CBSE', language: 'en', style: 'en', stateCode: 'IN-DL', freeSubject: subject }, childFirstNames: [], parentEmail: '', day: '2026-11-12', refusalWords: (k: string) => k },
        line: null,
        known: null,
        open: [subject],
        classSubjects: ['mathematics', 'evs', 'english', 'hindi'],
        cacheable: false,
        promptVersion: version,
        text: {
          send: async (onDelta?: (t: string) => void) => {
            for (const l of text) onDelta?.(`${l}\n`);
            return { result: { ok: true, text: text.join('\n'), tokensIn: 1, tokensOut: 1, provider: 'p', model: 'm' }, record: async () => undefined };
          },
        },
        moderation: null,
        asked: 'Why do balloons fly?',
        question: 'Why do balloons fly?',
        plan: plan ? { questionType: 'why_how', band: 'lkg_1', depth: 'medium', blocks: plan, visuals: [], lang: 'en' } : null,
      } as never,
      () => undefined
    );
    return g.kept.map((b) => b.type);
  };

  it('keeps a board for a Class 1 English question under v15, first, as v14 already did', async () => {
    expect(await run('v15', 'english', ['board', 'explanation', 'check'])).toEqual(['board', 'explanation']);
    // v14 never filtered a board by class or subject: it is not an interactive block.
    expect(await run('v14', 'english', ['explanation', 'image', 'check'])).toEqual(['board', 'explanation']);
  });
});

describe('a board-first answer stays board first when stored; no book, no chip (C509)', () => {
  it('keeps the board first only when it was written first', async () => {
    const { completeResponse } = await import('@/lib/family/blocks');
    const { citationOf } = await import('@/lib/family/citation');
    const board = { type: 'board' } as never;
    const explanation = { type: 'explanation', idea: 'x', paragraphs: [] } as never;
    const check = { type: 'check' } as never;
    const core = ['explanation'] as never;
    expect(completeResponse([board, explanation, check], core)!.map((b) => b.type)).toEqual(['board', 'explanation', 'check']);
    expect(completeResponse([explanation, board, check], core)!.map((b) => b.type)).toEqual(['explanation', 'board', 'check']);
    expect(citationOf([explanation], true, false)).toBeNull();
    expect(citationOf([explanation], true, true)).toEqual({ kind: 'general' });
  });
});
