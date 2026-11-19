// 19 Nov 2026 (founder): a maths answer teaches the concept and then solves the sum, ending "Samajh aaya? Ya dobara alag
// tareeke se samjhaun?"; a follow-up is answered about the problem already in the chat. The live failure this pins: a
// thief-and-policeman sum, then "Bilkul samajh nahi aaya", answered with a lesson on fractions and a motivational short.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASK_AGAIN, chatProblem, followUpFrame, MOVE_LINES, teachingMove } from '@/lib/family/maths-moves';
import { conceptThenSolution, MATHS_SOLVE_LINE, MATHS_TEACH_THEN_SOLVE_LINE, withMathsSolve } from '@/lib/family/maths-solve';
import { WORKED_MARK } from '@/lib/family/tutor-shape';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

const SRC = (p: string) => readFileSync(p, 'utf8');
const THIEF =
  'A thief runs away from a police station at a constant speed of 100 m/min. After 1 minute, a policeman sets off in chase of the thief. The policeman\'s initial speed is 100 m/min, and he increases his speed by 10 m/min every subsequent minute. After how many minutes will the policeman catch the thief?';
const SOLVED = `${WORKED_MARK}Problem: thief 100 m/min, policeman 1 minute later | Step 1: lead 100 × 1 = 100 m | Answer: 6 minutes, 600 m each`;
const chat = { summary: null, turns: [{ role: 'child' as const, text: THIEF }, { role: 'tutor' as const, text: SOLVED }] };

describe('a follow-up is answered about the problem already in the chat', () => {
  it('"Bilkul samajh nahi aaya" and "Samjha nahi" are re-explain moves, and the message the model answers names the thief sum', () => {
    for (const reply of ['Bilkul samajh nahi aaya', 'Samjha nahi', 'samjha nahi bhaiya', "I didn't understand", 'dobara samjhao', 'alag tareeke se samjhao', 'समझा नहीं']) {
      expect(teachingMove(reply, chat), reply).not.toBeNull();
      const frame = followUpFrame(reply, chat, teachingMove(reply, chat));
      expect(frame, reply).toContain('THIS MESSAGE IS A REPLY ABOUT THE PROBLEM ALREADY IN THIS CHAT');
      expect(frame, reply).toContain('policeman');
      expect(frame, reply).toContain('6 minutes, 600 m');
    }
  });

  it('a short reply that is no move still carries the problem, softly; a new long question and an empty chat carry nothing', () => {
    expect(followUpFrame('why 6 minutes?', chat, null)).toContain('MAY CONTINUE THE PROBLEM');
    expect(followUpFrame(THIEF, chat, null)).toBe('');
    expect(followUpFrame('Samjha nahi', { summary: null, turns: [] }, null)).toBe('');
    expect(followUpFrame('Samjha nahi', null, null)).toBe('');
  });

  it('the problem is the newest real question, never a short reply before it', () => {
    const later = { summary: null, turns: [...chat.turns, { role: 'child' as const, text: 'Bilkul samajh nahi aaya' }, { role: 'tutor' as const, text: 'Koi baat nahi. Socho do dost ek hi sadak par...' }] };
    expect(chatProblem(later)?.problem).toContain('policeman');
    const science = { summary: null, turns: [{ role: 'child' as const, text: 'Why do leaves change colour in autumn?' }, { role: 'tutor' as const, text: 'Chlorophyll breaks down and other colours show.' }] };
    expect(chatProblem(science)).toEqual({ problem: 'Why do leaves change colour in autumn?', taught: 'Chlorophyll breaks down and other colours show.' });
  });

  it('"samajh nahi aaya" re-explains the SAME problem another way (story or analogy) and ends by asking again', () => {
    expect(MOVE_LINES.dontknow).toContain('DIFFERENT way');
    expect(MOVE_LINES.dontknow).toMatch(/story or analogy/);
    expect(MOVE_LINES.dontknow).toContain(ASK_AGAIN.hinglish);
    expect(ASK_AGAIN.hinglish).toBe('Samajh aaya? Ya dobara alag tareeke se samjhaun?');
  });

  it('the resolver puts the frame at the top of the message the model answers, for every tutor entry point', () => {
    const r = SRC('src/lib/family/resolver.ts');
    expect(r).toContain("messages: [{ role: 'user', content: `${frame}${prompt.user(a)}` }]");
    expect(r).toContain('const frame = plainQuestion ? followUpFrame(input.text, input.memory, move)');
    // The memory comes from the chat for every tutor question (the Study tutor, the chapter reader's drawer, the call).
    expect(SRC('src/app/api/family/understand/route.ts')).toContain('input = { ...input, memory: chat.memory };');
  });

  it('a move searches no new videos on the reply\'s own words', () => {
    expect(SRC('src/app/api/family/understand/route.ts')).toContain('!teaches(generated.kept) || pending.move ? null :');
  });
});

describe('a sum is taught first, then solved', () => {
  it('with the elaboration on, the system text asks for the concept line, then the Mathwise solution line', () => {
    const elab = 'Write ONE JSON line of exactly this shape (every field required, ONE line only):\n{...}\nRules: x';
    const out = withMathsSolve(elab, true, true);
    expect(out).toContain(MATHS_TEACH_THEN_SOLVE_LINE);
    expect(out).not.toContain('ONE line only');
    expect(out.indexOf('TEACH THE CONCEPT')).toBeLessThan(out.indexOf('\nRules: x'));
    expect(MATHS_TEACH_THEN_SOLVE_LINE.indexOf('FIRST the elaboration line')).toBeLessThan(MATHS_TEACH_THEN_SOLVE_LINE.indexOf('THEN the solution line'));
    // Without the elaboration (an older prompt, or a "pura samjhao" move) the solution alone, as before.
    expect(withMathsSolve('Intro\nRules: x', true, false)).toContain(MATHS_SOLVE_LINE);
    expect(withMathsSolve('Intro', false, true)).toBe('Intro');
  });

  it('the concept leads, the solution follows straight after it, the videos stay last', () => {
    const order = (l: string[]) => conceptThenSolution(l.map((type) => ({ type }))).map((b) => b.type);
    expect(order(['worked_example', 'elaboration', 'videos'])).toEqual(['elaboration', 'worked_example', 'videos']);
    expect(order(['elaboration', 'videos', 'worked_example'])).toEqual(['elaboration', 'worked_example', 'videos']);
    expect(order(['explanation', 'worked_example'])).toEqual(['explanation', 'worked_example']);
  });

  it('the solution ends with the founder\'s question, in English and Hindi', () => {
    expect(hi['fam.solve.understood']).toBe('समझ आया? या दोबारा अलग तरीके से समझाऊँ?');
    expect(en['fam.solve.understood']).toBe('Did you understand? Or shall I explain it again a different way?');
  });
});
