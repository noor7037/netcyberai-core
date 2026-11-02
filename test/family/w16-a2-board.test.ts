import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BOARD } from './w16-a2-fixtures';
import { BOARD_COMMANDS_MAX, BOARD_KINDS, BOARD_SHAPES, BOARD_STEPS_MAX, boardProblems, checkBlock, checkStoredBlock, completeResponse, isSimScene, jsonObjectScanner, parseBlockLine, type Block, type Board, type SimScene, type Sources } from '@/lib/family/blocks';
import { boardCursorFromSentence, boardItems, targetBox, boardAxes } from '@/lib/family/board';
import { citationOf, citationProblems } from '@/lib/family/citation';
import { G, SIM_TEMPLATES, SCENE_SIMS, audible, liquidPressure, relativeLoudness, simMax, simReadout, simStart, soundPeriod, spurtSpeed, stoppingDistance } from '@/lib/family/visuals/sims';
import { LATEST_RESOLVER_PROMPT, RESOLVER_PROMPTS, resolverPrompt } from '@/lib/ai/prompts/family.resolver';
import { BOARD_COMMANDS, BOARD_LINE, SIM_LINE } from '@/lib/ai/prompts/family.resolver/v9';
import type { ResolverAsk } from '@/lib/ai/prompts/family.resolver/v8';
import { BoardView } from '@/components/family/blocks/BoardView';
import { SimView } from '@/components/family/blocks/SimView';
import { CitationChip } from '@/components/family/blocks/CitationChip';
import { BLOCK_TONE } from '@/components/family/blocks/BlockViews';
import { LESSON_TINT_OF } from '@/lib/design-tokens';
import { familyWords } from '@/lib/family/words';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';

// W16-A2 (docs/39 §6): the live drawing board, the citation chip, prompt v9 and three Class 8 Science simulations.
// Made-up content only; the physics is the chapter's formulas.

const w = familyWords('en', UNDERSTAND_KEYS);
const hi = familyWords('hi', UNDERSTAND_KEYS);
const html = (el: ReturnType<typeof h>) => renderToStaticMarkup(el);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const board = (o: Record<string, unknown> = {}) => checkBlock({ ...clone(BOARD), ...o }) as Board | null;

describe('the board block: the checker', () => {
  it('reads every command kind as written, and keeps it a block of the model and of the library', () => {
    const b = board();
    expect(b).not.toBeNull();
    expect(b).toEqual(BOARD);
    const kinds = new Set(b!.steps.flatMap((s) => s.commands.flatMap((c) => (c.kind === 'group' ? ['group', ...c.commands.map((x) => x.kind)] : [c.kind]))));
    expect(BOARD_KINDS.length).toBeGreaterThanOrEqual(10);
    expect([...kinds].sort()).toEqual([...BOARD_KINDS].sort());
    expect([...new Set(b!.steps.flatMap((s) => s.commands.flatMap((c) => (c.kind === 'group' ? c.commands : [c]))).flatMap((c) => (c.kind === 'shape' ? [c.shape] : [])))].sort()).toEqual([...BOARD_SHAPES].sort());
    expect(parseBlockLine(JSON.stringify(BOARD))).toEqual(BOARD);
    expect(checkStoredBlock(BOARD)).toEqual(BOARD);
  });

  it('clamps numbers onto the grid and drops what it cannot read, keeping the rest of the step', () => {
    const b = board({ steps: [{ n: 1, say: 'One.', commands: [{ kind: 'shape', shape: 'circle', at: [140, -5], r: 90 }, { kind: 'blob' }, { kind: 'label', at: [5, 5], text: 'x'.repeat(41) }, { kind: 'arrow', from: [1, 1], to: [1, 1] }, { kind: 'point', at: { x: 3, y: 4 } }] }] });
    expect(b!.steps[0].commands).toEqual([{ kind: 'shape', shape: 'circle', at: [100, 0], r: 50 }, { kind: 'point', at: [3, 4] }]);
  });

  it('puts the steps in the order of their numbers, numbers them again, and merges a repeated number', () => {
    const lbl = (t: string) => ({ kind: 'label', at: [10, 10], text: t });
    const b = board({ steps: [{ n: 5, say: 'Last.', commands: [lbl('c')] }, { n: 2, say: 'First.', commands: [lbl('a')] }, { n: 2, commands: [lbl('b')] }, { n: 3, commands: [{ kind: 'blob' }] }] });
    expect(b!.steps.map((s) => [s.n, s.say, s.commands.length])).toEqual([[1, 'First.', 2], [2, 'Last.', 1]]);
  });

  it('caps the steps at 12 and the commands at 60', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ n: i + 1, commands: Array.from({ length: 4 }, (_, k) => ({ kind: 'point', at: [i * 4, k * 10] })) }));
    const b = board({ steps: many });
    expect(b!.steps.length).toBe(BOARD_STEPS_MAX);
    const total = (x: Board) => x.steps.reduce((n, s) => n + s.commands.reduce((m, c) => m + (c.kind === 'group' ? c.commands.length + 1 : 1), 0), 0);
    expect(total(b!)).toBe(48);
    const wide = board({ steps: [{ n: 1, commands: Array.from({ length: 80 }, (_, k) => ({ kind: 'point', at: [k, k] })) }] });
    expect(total(wide!)).toBe(BOARD_COMMANDS_MAX);
  });

  it('lets an erase or a highlight name only an id drawn before it, and an id only once', () => {
    const b = board({
      steps: [
        { n: 1, commands: [{ kind: 'erase', target: 'later' }, { kind: 'highlight', target: 'later' }, { id: 'later', kind: 'point', at: [1, 1] }, { id: 'later', kind: 'point', at: [2, 2] }] },
        { n: 2, commands: [{ kind: 'highlight', target: 'later' }, { kind: 'erase', target: 'later' }] },
      ],
    });
    expect(b!.steps[0].commands).toEqual([{ id: 'later', kind: 'point', at: [1, 1] }]);
    expect(b!.steps[1].commands).toEqual([{ kind: 'highlight', target: 'later' }, { kind: 'erase', target: 'later' }]);
  });

  it('drops the whole board only with no title, or nothing left to draw', () => {
    expect(board({ title: '' })).toBeNull();
    expect(board({ title: 'x'.repeat(61) })).toBeNull();
    expect(board({ steps: [] })).toBeNull();
    expect(board({ steps: [{ n: 1, commands: [{ kind: 'blob' }] }] })).toBeNull();
    expect(board({ width: 'huge' })).toEqual(BOARD);
  });

  it('comes right after the explanation and the figure, and is never read aloud', () => {
    const ex = checkBlock({ type: 'explanation', title: 'Pressure', idea: 'Pressure is force on an area.', example: 'A sharp knife.', steps: ['One.', 'Two.'], terms: [] })!;
    const fig = checkBlock({ type: 'figure', title: 'A cell', kind: 'schematic', shape: 'cell', labels: [{ at: 'centre', text: 'Nucleus' }, { at: 'ring', text: 'Membrane' }] })!;
    const check = checkBlock({ type: 'check', items: [{ id: 'c1', question: 'Q?', options: ['A', 'B'], answer: 0, hint: 'H.', why: 'W.', wrong: ['', 'Not B.'] }] })!;
    const practice = checkBlock({ type: 'practice', items: [{ id: 'p1', question: 'Q?', options: ['A', 'B'], answer: 0, hint: 'H.', why: 'W.' }] })!;
    const out = completeResponse([check, board()!, practice, fig, ex] as Block[]);
    expect(out!.map((b) => b.type)).toEqual(['explanation', 'figure', 'board', 'check', 'practice']);
    expect(BLOCK_TONE.board).toEqual(BLOCK_TONE.figure);
    expect(LESSON_TINT_OF.board).toBe('lilac');
  });
});

describe('boardProblems (the validators hook)', () => {
  it('is empty for a good board, and says what was clamped, dropped or outside v9', () => {
    expect(boardProblems(BOARD)).toEqual([]);
    expect(boardProblems({ type: 'figure' })).toEqual(['not a board block']);
    expect(boardProblems({ type: 'board', title: '', steps: [] })[0]).toMatch(/no title/);
    const p = boardProblems({ type: 'board', title: 'Two steps', steps: [{ n: 1, commands: [{ kind: 'point', at: [120, 5] }, { kind: 'blob' }] }, { n: 2, say: 'Two.', commands: [{ kind: 'point', at: [5, 5] }] }] });
    expect(p).toEqual(['step 1: 120 clamped to 0..100', 'step 1: command 2 (blob) could not be read', '2 steps (3 to 8 asked)', 'step 1 has no say line']);
  });
});

describe('the board drawn step by step', () => {
  const b = board()!;
  it('shows what the steps up to the cursor drew, less what an erase took away (a group whole)', () => {
    expect(boardItems(b, 1).every((x) => x.step === 1)).toBe(true);
    const all = boardItems(b, b.steps.length);
    expect(all.some((x) => 'id' in x.cmd && x.cmd.id === 'guess')).toBe(false);
    expect(boardItems(b, 3).some((x) => 'id' in x.cmd && x.cmd.id === 'guess')).toBe(true);
    const grouped = board({ steps: [{ n: 1, commands: [{ kind: 'group', id: 'g', colour: 'teal', commands: [{ kind: 'point', at: [1, 1] }, { kind: 'point', at: [9, 9], colour: 'plum' }] }] }, { n: 2, commands: [{ kind: 'highlight', target: 'g' }] }, { n: 3, commands: [{ kind: 'erase', target: 'g' }, { kind: 'point', at: [50, 50] }] }] })!;
    expect(boardItems(grouped, 1).map((x) => x.colour)).toEqual(['teal', 'plum']);
    expect(targetBox(boardItems(grouped, 2), 'g', boardAxes(grouped))).toEqual({ x: -0.5, y: -0.5, w: 11, h: 11 });
    expect(boardItems(grouped, 3).map((x) => x.cmd.kind)).toEqual(['highlight', 'point']);
  });

  it('follows the sentence being spoken: the k-th step with a say line on the k-th sentence', () => {
    expect(boardCursorFromSentence(['a', 'b', 'c'], 0)).toBe(1);
    expect(boardCursorFromSentence(['a', 'b', 'c'], 2)).toBe(3);
    expect(boardCursorFromSentence(['a', 'b', 'c'], 9)).toBe(3);
    expect(boardCursorFromSentence(['a', undefined, 'b', undefined], 0)).toBe(2);
    expect(boardCursorFromSentence(['a', undefined, 'b', undefined], 1)).toBe(4);
    expect(boardCursorFromSentence([undefined, 'a', 'b'], 0)).toBe(2);
    expect(boardCursorFromSentence([undefined, undefined, undefined], 1)).toBe(2);
    expect(boardCursorFromSentence([], 3)).toBe(1);
    expect(boardCursorFromSentence(['a', 'b'], -4)).toBe(1);
  });

  it('draws every step at once when still (reduced motion), with the say lines in order', () => {
    const out = html(h(BoardView, { b, w, tone: 'science', still: true }));
    expect(out).toContain(`data-step="${b.steps.length}"`);
    expect(out).toContain('data-board-says');
    expect(out).not.toContain('data-board-controls');
    expect(out).not.toContain('fam-board-in');
    for (const s of b.steps) if (s.say) expect(out).toContain(s.say);
    expect(out).toContain('P = F / A');
  });

  it('starts at its cursor with Back, Next and Show all at 44 px, and the step said under it', () => {
    const out = html(h(BoardView, { b, w, tone: 'science', still: false, cursor: 2 }));
    expect(out).toContain('data-step="2"');
    expect(out).toContain('Step 2 of 4');
    expect(out).toContain(b.steps[1].say!);
    for (const k of ['data-board-prev', 'data-board-next', 'data-board-all']) expect(out).toMatch(new RegExp(`${k}[^>]*min-h-\\[44px\\]`));
    expect(out).toContain('fam-board-in');
    // Family identity colours only: no dark blue, no gradient.
    expect(out).not.toMatch(/gradient|#1e3a8a|#0b1f4b|navy/i);
  });
});

describe('the citation chip', () => {
  const ex = { type: 'explanation', title: 'T', idea: 'An idea.', example: 'E.', steps: ['One.', 'Two.'], terms: [] };
  it('reads a sources block that names the chapter (links then optional), and still needs a link without one', () => {
    expect(checkBlock({ type: 'sources', chapter: 'Force and Pressure', unit: 'Pressure exerted by liquids' })).toEqual({ type: 'sources', links: [], chapter: 'Force and Pressure', unit: 'Pressure exerted by liquids' });
    expect(checkBlock({ type: 'sources', chapter: 'Force and Pressure', links: [{ label: 'NCERT', url: 'https://ncert.nic.in/textbook.php' }] })).toEqual({ type: 'sources', links: [{ label: 'NCERT', url: 'https://ncert.nic.in/textbook.php' }], chapter: 'Force and Pressure' });
    expect(checkBlock({ type: 'sources', links: [] })).toBeNull();
    expect(checkBlock({ type: 'sources', chapter: 'x'.repeat(121) })).toBeNull();
    expect(checkBlock({ type: 'sources', unit: 'A unit' , links: [{ label: 'NCERT', url: 'https://ncert.nic.in/' }] })).toBeNull();
  });

  it('says the chapter first, or general knowledge once the answer is complete', () => {
    const src = checkBlock({ type: 'sources', chapter: 'Force and Pressure', unit: 'Liquids' }) as Sources;
    expect(citationOf([ex, src], false)).toEqual({ kind: 'chapter', title: 'Force and Pressure', unit: 'Liquids' });
    expect(citationOf([ex], false)).toBeNull();
    expect(citationOf([ex], true)).toEqual({ kind: 'general' });
    // An older answer that quotes its chapter in words: no chip says otherwise.
    expect(citationOf([{ ...ex, paragraphs: ['From your chapter Friction: it opposes motion.'] } as { type: string }], true)).toBeNull();
    expect(html(h(CitationChip, { w, c: { kind: 'chapter', title: 'Force and Pressure', unit: 'Liquids' } }))).toContain('From your chapter: Force and Pressure · Liquids');
    expect(html(h(CitationChip, { w, c: { kind: 'chapter', title: 'Sound' } }))).toContain('From your chapter: Sound<');
    expect(html(h(CitationChip, { w, c: { kind: 'general' } }))).toContain('General knowledge, not from your chapter');
    expect(html(h(CitationChip, { w: hi, c: { kind: 'general' } }))).toContain('सामान्य जानकारी');
  });

  it('citationProblems: one sources block naming a passage when passages were given, none otherwise', () => {
    const src = (chapter: string) => ({ type: 'sources', links: [], chapter });
    const passages = [{ title: 'Force and Pressure' }];
    expect(citationProblems([ex, src('force and pressure')], passages)).toEqual([]);
    expect(citationProblems([ex], passages)).toEqual(['no sources block names the chapter, though passages were given']);
    expect(citationProblems([ex, src('Sound')], passages)).toEqual(['the chapter named is not one of the passages: Sound']);
    expect(citationProblems([ex, src('Force and Pressure'), src('Force and Pressure')], passages)).toEqual(['2 sources blocks name a chapter (one asked)']);
    expect(citationProblems([ex], [])).toEqual([]);
    expect(citationProblems([ex, src('Sound')], [])).toEqual(['a chapter is named, but no passage of the library was given']);
  });
});

describe('the three Class 8 Science simulations (the chapter\'s formulas)', () => {
  it('pressure in a liquid: p = ρ × g × h, and a lower hole spurts faster (v = √(2gh))', () => {
    expect(G).toBe(9.8);
    expect(liquidPressure(1)).toBeCloseTo(9800, 9);
    expect(liquidPressure(2)).toBeCloseTo(19600, 9);
    expect(liquidPressure(5)).toBeCloseTo(49000, 9);
    expect(liquidPressure(2, 800)).toBeCloseTo(15680, 9);
    expect(spurtSpeed(5)).toBeCloseTo(Math.sqrt(98), 9);
    const ps = SIM_TEMPLATES.pressure_depth[0].choices.map((c) => liquidPressure(c.value));
    expect(ps).toEqual([...ps].sort((a, b) => a - b));
  });

  it('friction: d = v² ÷ (2 × μ × g), shorter on a rougher surface', () => {
    expect(stoppingDistance(10, 0.7)).toBeCloseTo(100 / 13.72, 9);
    expect(stoppingDistance(10, 0.4)).toBeCloseTo(100 / 7.84, 9);
    expect(stoppingDistance(10, 0.1)).toBeCloseTo(100 / 1.96, 9);
    expect(stoppingDistance(5, 0.7)).toBeCloseTo(stoppingDistance(10, 0.7) / 4, 9);
    expect(simMax('friction_surface')).toBeCloseTo(stoppingDistance(10, 0.1), 9);
  });

  it('sound: T = 1 ÷ f, loudness goes with amplitude², heard from 20 Hz to 20,000 Hz', () => {
    expect(soundPeriod(200)).toBeCloseTo(0.005, 12);
    expect(soundPeriod(100)).toBeCloseTo(0.01, 12);
    expect(relativeLoudness(2)).toBe(4);
    expect(relativeLoudness(3)).toBe(9);
    expect([audible(19), audible(20), audible(20000), audible(20001)]).toEqual([false, true, true, false]);
    expect(SIM_TEMPLATES.sound_wave[0].choices.every((c) => audible(c.value))).toBe(true);
  });

  it('a scene names a simulation by key; a starting value not among the choices falls back to the template', () => {
    expect(checkBlock({ type: 'scene', title: 'Pressure in a liquid', sim: 'pressure_depth', start: { depth: 4 } })).toEqual({ type: 'scene', title: 'Pressure in a liquid', sim: 'pressure_depth', start: { depth: 4 } });
    expect(checkBlock({ type: 'scene', title: 'Pressure', sim: 'pressure_depth', start: { depth: 7 } })).toEqual({ type: 'scene', title: 'Pressure', sim: 'pressure_depth', start: { depth: 2 } });
    expect(checkBlock({ type: 'scene', title: 'Magic', sim: 'free_energy' })).toBeNull();
    expect(checkBlock({ type: 'scene', title: '', sim: 'sound_wave' })).toBeNull();
    expect(isSimScene(checkBlock({ type: 'scene', title: 'Sound', sim: 'sound_wave' })!)).toBe(true);
    expect(simStart('friction_surface', { surface: 0.1 })).toEqual({ surface: 0.1, speed: 10 });
    expect(simReadout('sound_wave', { frequency: 400, amplitude: 2 })).toEqual({ sim: 'sound_wave', hz: 400, amplitude: 2, period: 0.0025, loudness: 4, audible: true });
  });

  it('draws each with its numbers in the family words, and choices at 44 px', () => {
    for (const sim of SCENE_SIMS) {
      const b = checkBlock({ type: 'scene', title: `A ${sim}`, sim }) as SimScene;
      for (const words of [w, hi]) {
        const out = html(h(SimView, { b, w: words, tone: 'science', still: true }));
        expect(out, sim).toContain(`data-sim="${sim}"`);
        expect(out, sim).not.toMatch(/\{[a-z]+\}|undefined|NaN/);
        expect(out, sim).toMatch(/data-sim-choice[^>]*min-h-\[44px\]|min-h-\[44px\][^>]*data-sim-choice/);
      }
    }
    expect(html(h(SimView, { b: checkBlock({ type: 'scene', title: 'P', sim: 'pressure_depth' }) as SimScene, w, tone: 'science', still: true }))).toContain('19,600 pascals');
    expect(html(h(SimView, { b: checkBlock({ type: 'scene', title: 'F', sim: 'friction_surface' }) as SimScene, w, tone: 'science', still: true }))).toContain('it stops in 7.3 m');
    const s = html(h(SimView, { b: checkBlock({ type: 'scene', title: 'S', sim: 'sound_wave' }) as SimScene, w, tone: 'science', still: true }));
    expect(s).toContain('one vibration in 0.005 s');
    // Still: the string does not move.
    expect(s).not.toContain('<animate');
  });
});

describe('prompt v9', () => {
  const base: ResolverAsk = { board: 'CBSE', classLevel: 8, subject: 'science', openSubjects: ['science'], classSubjects: ['mathematics', 'science'], chapter: null, topic: null, question: 'Why do dams have thick walls at the bottom?', language: 'en', style: 'en', followUp: null, misconception: null };
  const v9 = resolverPrompt('v9', false);
  const v8 = resolverPrompt('v8', false);
  const passages = [{ chapterKey: 'cbse.c8.science.force', title: 'Force and Pressure', text: 'Liquids exert pressure on the walls of the container.', score: 0.5 }];

  it('is registered, plans like v8 and is the default', () => {
    expect(RESOLVER_PROMPTS.find((p) => p.version === 'v9')?.usesPlan).toBe(true);
    expect(LATEST_RESOLVER_PROMPT).toBe('v9');
    expect(resolverPrompt(null, true).version).toBe('v9');
    expect(v9.user(base)).toBe(v8.user(base));
  });

  it('is v8 word for word, plus the board, the simulations and the sources rule after the block list', () => {
    const a = v8.system({ ...base, passages });
    const b = v9.system({ ...base, passages });
    const [head, tail] = a.split('\nRules: ');
    expect(b.startsWith(head)).toBe(true);
    expect(b.endsWith(`Rules: ${tail}`)).toBe(true);
    expect(b).toContain(BOARD_LINE);
    for (const c of BOARD_COMMANDS) expect(b).toContain(c);
    expect(b).toContain('3 to 8 steps');
    expect(b).toContain('Never a figure and a board of the same thing');
    expect(b).toContain('exactly ONE sources block');
    expect(b).toContain(SIM_LINE);
  });

  it('asks for no sources block without passages, and the simulations only in Class 8 Science', () => {
    expect(v9.system({ ...base, passages: [] })).toContain('Write no sources block');
    expect(v9.system({ ...base, passages: [] })).not.toContain('exactly ONE sources block');
    expect(v9.system({ ...base, classLevel: 9 })).not.toContain(SIM_LINE);
    expect(v9.system({ ...base, subject: 'mathematics' })).not.toContain(SIM_LINE);
    expect(v9.system({ ...base, subject: null })).toContain(SIM_LINE);
  });

  it('every command example in the prompt is a command the checker reads', () => {
    for (const line of BOARD_COMMANDS) {
      // The example as written (a group's commands are a placeholder in the prompt; an id is one drawn before).
      const first = jsonObjectScanner()(line.replace('[commands drawn together]', '[{"kind":"point","at":[1,1]}]'))[0].replace('"id of an earlier command"', '"p"');
      const cmd = JSON.parse(first);
      const before = [{ id: 'p', kind: 'point', at: [5, 5] }, ...(cmd.kind === 'axis' ? [] : [{ id: 'ax', kind: 'axis', at: [15, 85], w: 70, h: 60 }])];
      const b = checkBlock({ type: 'board', title: 'Check', steps: [{ n: 1, commands: [...before, cmd] }] }) as Board;
      expect(b?.steps[0].commands.length, line).toBe(before.length + 1);
    }
  });

  it('moves family.resolver from v8 to v9 in one migration', () => {
    const sql = readFileSync('supabase/migrations/29999999999992_w16_a2_resolver_v9.sql', 'utf8');
    expect(sql).toContain("update control.ai_profiles set prompt_version = 'v9' where profile_id = 'family.resolver' and prompt_version = 'v8';");
  });
});
