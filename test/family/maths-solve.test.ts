import { describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The elaboration's photo search and the answer's video finder reach the network: here they are stand-ins.
vi.mock('@/lib/family/visuals/elab-fill', () => ({ fillElaboration: async (b: unknown) => b }));
vi.mock('@/lib/family/flags', () => ({ familyModuleOn: async () => true }));
vi.mock('@/lib/family/answer-videos', () => ({
  answerVideos: async () => ({
    topicKey: 'speed-distance-time',
    language: 'en',
    wanted: null,
    picks: [
      { videoId: 'aaaaaaaaaaa', title: 'Speed, distance and time for kids', channelTitle: 'Maths Fun', durationS: 300, startS: 0 },
      { videoId: 'bbbbbbbbbbb', title: 'Grade 5 Math: speed and distance', channelTitle: 'US Maths', durationS: 300, startS: 0 },
      { videoId: 'ccccccccccc', title: 'GCSE Maths speed distance time', channelTitle: 'UK Revision', durationS: 300, startS: 0 },
      { videoId: 'ddddddddddd', title: 'Area model multiplication', channelTitle: 'Maths Fun', durationS: 300, startS: 0 },
    ],
  }),
}));

import { checkBlock, completeResponse, type Block, type WorkedExample } from '@/lib/family/blocks';
import { elaborationBlock } from '@/lib/family/elaboration';
import { fitsSum, gradeFits, isMathsSum, MATHS_SOLVE_LINE, solutionFirst, withMathsSolve } from '@/lib/family/maths-solve';
import { generate } from '@/lib/family/resolver';
import { fillVisuals } from '@/lib/family/visuals/fill';
import { WorkedExampleView } from '@/components/family/blocks/BlockViews';
import { familyWords } from '@/lib/family/words';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';

// §8 maths (18 Nov 2026): the live sum a Class 3 child asked, answered with a story and videos and no working.
const SUM =
  "A thief runs away from a police station at a constant speed of 100 m/min. After 1 minute, a policeman sets off in chase of the thief. The policeman's initial speed is 100 m/min, and he increases his speed by 10 m/min every subsequent minute. After how many minutes will the policeman catch the thief? What is the total distance each of them travels by that time?";

// The arithmetic, worked here and asserted below: the thief is 100 m ahead when the chase starts; each minute the
// policeman gains (his speed - 100) m: 0, 10, 20, 30, 40, which add up to the 100 m after 5 minutes of the chase. By then
// the policeman has run 100 + 110 + 120 + 130 + 140 = 600 m, and the thief 100 x 6 = 600 m.
const solution = {
  type: 'worked_example',
  problem: 'A thief runs at 100 m/min. 1 minute later a policeman chases him at 100 m/min, 10 m/min faster every minute. When does he catch the thief, and how far has each run?',
  given: ['Thief: 100 m every minute', 'The policeman starts 1 minute later', 'Policeman: 100 m in his first minute, then 10 m/min faster each minute'],
  find: ['After how many minutes the policeman catches the thief', 'The distance each has run by then'],
  steps: [
    { text: 'The thief is ahead when the chase starts.', why: 'He ran for 1 minute alone.', expression: '100 × 1', result: '100' },
    { text: 'Each minute the policeman gains his speed minus 100 m: 0, 10, 20, 30, 40.', why: 'The gap closes by the difference of their speeds.', expression: '0 + 10 + 20 + 30 + 40', result: '100' },
    { text: 'The gains reach the 100 m head start after 5 minutes of the chase.', why: 'Then the gap is zero.', expression: '100 - 100', result: '0' },
    { text: 'Policeman’s distance in those 5 minutes.', why: 'Add his distance for each minute.', expression: '100 + 110 + 120 + 130 + 140', result: '600' },
    { text: 'The thief has run for 1 + 5 = 6 minutes.', why: 'He started 1 minute earlier.', expression: '100 × (1 + 5)', result: '600' },
  ],
  table: {
    columns: ['Minute of chase', 'Thief so far (m)', 'Policeman so far (m)'],
    rows: [['1', '200', '100'], ['2', '300', '210'], ['3', '400', '330'], ['4', '500', '460'], ['5', '600', '600']],
  },
  answer: 'The policeman catches the thief 5 minutes after he starts (6 minutes after the thief ran). Each has run 600 m.',
  check: { text: 'At the catch both distances are equal.', expression: '100 × 6 - (100 + 110 + 120 + 130 + 140)', result: '0' },
};

const elaboration = {
  type: 'elaboration',
  term: 'Multiplication',
  definition: { text: 'Speed tells how far you go in one minute.', say: 'Speed tells how far you go in one minute.' },
  levels: { basic: 'Faster means more metres each minute.', intermediate: 'Distance is speed times time.', advanced: 'A speed that grows each minute adds a little more every minute.', say: 'Faster means more metres each minute.' },
  real_life: { text: 'A bus and a cycle on the same road.', say: 'A bus and a cycle on the same road.' },
  try_it: { question: 'Who is ahead after 2 minutes?', right: 'The thief, by 90 m.', hint: 'Add the metres.', say: 'Who is ahead after 2 minutes?' },
  future: { text: 'You will use speed in science.', say: 'You will use speed in science.' },
  checks: [{ question: 'Who runs faster in the 3rd minute?', options: ['The policeman', 'The thief'], answer: 0, right: 'Yes: 120 m/min.', hint: 'Add 10 each minute.' }],
};

describe('a maths sum is solved first (§8)', () => {
  it('knows a sum from a question about a topic', () => {
    expect(isMathsSum('mathematics', SUM)).toBe(true);
    expect(isMathsSum('mathematics', 'What is a fraction?')).toBe(false);
    expect(isMathsSum('mathematics', '24 ÷ 6 = ?')).toBe(true);
    expect(isMathsSum('science', 'How far does a car go in 3 hours at 40 km/h?')).toBe(true);
    expect(isMathsSum('science', 'Why is the sky blue?')).toBe(false);
  });

  it('asks for the solution in code, before the prompt’s rules', () => {
    const sys = withMathsSolve('Teach well.\nRules: be kind.', true);
    expect(sys.indexOf(MATHS_SOLVE_LINE)).toBeLessThan(sys.indexOf('\nRules: '));
    expect(withMathsSolve('Teach well.', false)).toBe('Teach well.');
  });

  it('keeps a numerically correct solution with Given, To find, steps, a table, the answer and a check', () => {
    const b = checkBlock(solution) as WorkedExample;
    expect(b).not.toBeNull();
    expect(b.given).toHaveLength(3);
    expect(b.find).toHaveLength(2);
    expect(b.steps.map((s) => s.result)).toEqual(['100', '100', '0', '600', '600']);
    expect(b.table?.rows.at(-1)).toEqual(['5', '600', '600']);
    expect(b.answer).toMatch(/5 minutes/);
    expect(b.answer).toMatch(/600 m/);
    expect(b.check?.result).toBe('0');
    // One wrong number (the policeman at 590 m) drops the whole solution, and so does a check that does not hold.
    expect(checkBlock({ ...solution, steps: solution.steps.map((s, i) => (i === 3 ? { ...s, result: '590' } : s)) })).toBeNull();
    expect(checkBlock({ ...solution, check: { ...solution.check, result: '10' } })).toBeNull();
  });

  const run = async (lines: object[]) => {
    const events: { t: string; block?: { type: string } }[] = [];
    const g = await generate(
      {
        ctx: { accountId: 'a', child: { childId: 'c', firstName: 'Asha', classLevel: 3, board: 'CBSE', language: 'hi', style: 'hi', stateCode: 'IN-DL', freeSubject: 'mathematics' }, childFirstNames: ['Asha'], parentEmail: '', day: '2026-11-18', refusalWords: (k: string) => k },
        line: null,
        known: 'mathematics',
        open: ['mathematics'],
        classSubjects: ['mathematics'],
        cacheable: false,
        promptVersion: 'v21',
        elaborate: true,
        solve: true,
        diagrams: [],
        text: {
          send: async (onDelta?: (t: string) => void) => {
            for (const l of lines) onDelta?.(`${JSON.stringify(l)}\n`);
            return { result: { ok: true, text: '', tokensIn: 1, tokensOut: 1, provider: 'p', model: 'm' }, record: async () => undefined };
          },
        },
        moderation: { check: async () => ({ safe: true }), record: async () => undefined },
        asked: SUM,
        question: SUM,
        plan: null,
      } as never,
      (e) => events.push(e as never),
    );
    return { g, shown: events.filter((e) => e.t === 'block').map((e) => e.block!.type) };
  };

  it('shows the solution before the elaboration, even when the model wrote the elaboration first', async () => {
    const { g, shown } = await run([elaboration, solution]);
    expect(shown).toEqual(['worked_example', 'elaboration']);
    expect(g.kept.map((b) => b.type)).toEqual(['worked_example', 'elaboration']);
  });

  it('still shows the elaboration when no solution came, and a stored answer keeps the solution first', async () => {
    const { shown } = await run([elaboration]);
    expect(shown).toEqual(['elaboration']);
    const elab = elaborationBlock(elaboration, false)!;
    const stored = completeResponse([elab as Block, checkBlock(solution)!], ['elaboration']);
    expect(stored?.map((b) => b.type)).toEqual(['worked_example', 'elaboration']);
    expect(solutionFirst([{ type: 'elaboration' }, { type: 'worked_example' }, { type: 'videos' }]).map((b) => b.type)).toEqual(['worked_example', 'elaboration', 'videos']);
  });

  it('draws Given, To find, the working, the answer, the check, then the four quick replies, wired', () => {
    for (const lang of ['en', 'hi'] as const) {
      const w = familyWords(lang, UNDERSTAND_KEYS);
      const asked: string[] = [];
      const html = renderToStaticMarkup(h(WorkedExampleView, { b: checkBlock(solution) as WorkedExample, w, tone: 'mathematics', onAsk: (q: string) => asked.push(q) }));
      const at = (s: string) => html.indexOf(s);
      expect(at('data-solve-given')).toBeGreaterThan(-1);
      expect(at('data-solve-given')).toBeLessThan(at('data-solve-find'));
      expect(at('data-solve-find')).toBeLessThan(at('data-solve-steps'));
      expect(at('data-solve-steps')).toBeLessThan(at('data-solve-table'));
      expect(at('data-solve-table')).toBeLessThan(at('data-solve-answer'));
      expect(at('data-solve-answer')).toBeLessThan(at('data-solve-check'));
      expect(at('data-solve-check')).toBeLessThan(at('data-solve-replies'));
      expect(html).toContain(w['fam.solve.understood'].replace(/'/g, '&#x27;'));
      expect([...html.matchAll(/data-solve-reply="(\w+)"/g)].map((m) => m[1])).toEqual(['yes', 'differently', 'simpler', 'similar']);
      for (const r of ['yes', 'differently', 'simpler', 'similar']) {
        expect(w[`fam.solve.reply.${r}`]).toBeTruthy();
        // "Explain differently" and "Show simpler steps" are the teacher's moves on the same sum (maths-moves.ts): the chat holds
        // the sum, so they do not paste it; "Yes" and "Give me a similar one" carry it.
        if (r === 'yes' || r === 'similar') expect(w[`fam.solve.ask.${r}`]).toContain('{problem}');
        else expect(w[`fam.solve.ask.${r}`]).not.toContain('{problem}');
      }
    }
    // Without a way to ask (a kept answer in the history) no reply chip is drawn.
    const w = familyWords('en', UNDERSTAND_KEYS);
    expect(renderToStaticMarkup(h(WorkedExampleView, { b: checkBlock(solution) as WorkedExample, w, tone: 'mathematics' }))).not.toContain('data-solve-reply');
  });

  it('a quick reply sends its follow-up question with the sum', async () => {
    const { SolveReplies } = await import('@/components/family/blocks/SolveReplies');
    const w = familyWords('en', UNDERSTAND_KEYS);
    const asked: string[] = [];
    const el = SolveReplies({ w, problem: solution.problem, onAsk: (q) => asked.push(q) })!;
    const buttons = (el.props.children[1].props.children as { props: { onClick: () => void } }[]);
    for (const b of buttons) b.props.onClick();
    expect(asked).toHaveLength(4);
    expect(asked[1]).toBe(w['fam.solve.ask.differently']);
    for (const i of [0, 3]) expect(asked[i]).toContain(solution.problem);
  });

  const simRow = { class: '3-5', subject: 'Maths', chapter_name: '', topic: 'multiplication', source: 'phet', title: 'Area Model Introduction', embed_url: 'https://phet.colorado.edu/sims/html/area-model-introduction/latest/area-model-introduction_en.html', page_url: 'https://phet.colorado.edu/en/simulations/area-model-introduction', licence: 'CC BY 4.0 (PhET Interactive Simulations, University of Colorado Boulder)', preview: null };
  const withDb = (async (fn: (db: { query: (sql: string) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => fn({ query: async (sql: string) => ({ rows: /curated_sims\(/.test(sql) ? [simRow] : [] }) })) as never;

  it('never attaches an area-model simulation to a speed-and-distance sum', async () => {
    const elab = elaborationBlock(elaboration, false)! as Block;
    const opts = { chapterKey: null, lang: 'en', subject: 'mathematics', sims: { classLevel: 3 } };
    // Without the sum's guard the curated table's multiplication match would attach (the live bug)...
    const loose = await fillVisuals(withDb, [checkBlock(solution)!, elab], opts);
    expect((loose.find((b) => b.type === 'elaboration') as { sim?: { title: string } }).sim?.title).toBe('Area Model Introduction');
    // ...for a sum it does not.
    const out = await fillVisuals(withDb, [checkBlock(solution)!, elab], { ...opts, sum: { question: SUM, classLevel: 3 } });
    expect((out.find((b) => b.type === 'elaboration') as { sim?: unknown }).sim).toBeUndefined();
    expect(fitsSum('Area Model Introduction', SUM)).toBe(false);
    expect(fitsSum('Speed, distance and time', SUM)).toBe(true);
  });

  it('keeps only videos about the sum and made for the child’s class, last', async () => {
    const elab = elaborationBlock(elaboration, false)! as Block;
    const out = await fillVisuals(withDb, [checkBlock(solution)!, elab], { chapterKey: null, lang: 'en', subject: 'mathematics', sims: { classLevel: 3 }, sum: { question: SUM, classLevel: 3 }, videos: { accountId: 'a' } as never });
    expect(out.map((b) => b.type)).toEqual(['worked_example', 'elaboration', 'videos']);
    expect((out.at(-1) as { items: { videoId: string }[] }).items.map((v) => v.videoId)).toEqual(['aaaaaaaaaaa']);
    expect(gradeFits('Grade 5 Math', 3)).toBe(false);
    expect(gradeFits('Class 3 maths', 3)).toBe(true);
    expect(gradeFits('GCSE Maths', 10)).toBe(true);
  });
});
