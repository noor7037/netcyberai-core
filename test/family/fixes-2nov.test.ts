import { describe, expect, it } from 'vitest';
import { firstSum, sumRight, verifyVerdicts } from '@/lib/family/arithmetic-check';
import { heardNothing } from '@/lib/family/call-heard';
import { SIM_KINDS, simFits } from '@/lib/family/interactive';
import { SUM_LINE, resolverSystem } from '@/lib/ai/prompts/family.resolver/v9';
import { quizSystem } from '@/lib/ai/prompts/family.quiz/v1';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// The browser test of PR #397 (2 Nov 2026), the pure parts of what it found:
//   F2  older Science answers showed a pendulum under "Healthy habits": a simulation only where it fits (simFits);
//       "12 x 15" never said 180: the prompt's sum line;
//   F3  a quiet room transcribed as "Thank you." was answered as off-subject: heardNothing;
//   F4  a written quiz item stood unmarked beside the score: written items were removed on 2 Nov and came back in W17-B3,
//       now marked by the AI at submit and marked as such;
//   F5  "45 x 2 = 90" marked wrong: a verdict that restates a plain sum is settled by arithmetic (verifyVerdicts).

describe('a simulation only where it belongs (F2)', () => {
  it('fits by the words of the question, the syllabus line or the block title, in English or Hindi', () => {
    expect(simFits('pendulum', 'A pendulum 1 m long: how does its period change?')).toBe(true);
    expect(simFits('pendulum', 'Healthy habits')).toBe(false);
    expect(simFits('pendulum', 'Heart rate and protein folding')).toBe(false);
    expect(simFits('projectile', 'A ball thrown up: why does it come down?')).toBe(true);
    expect(simFits('ohms_law', 'विद्युत धारा और प्रतिरोध')).toBe(true);
    expect(simFits('refraction', 'Why does a pencil in water look bent?')).toBe(true);
    for (const sim of SIM_KINDS) expect(simFits(sim, 'Healthy habits: sleep, food and play')).toBe(false);
  });
});

describe('a sum asked is a sum answered (F2)', () => {
  it('the resolver prompt ends its blocks with the sum line', () => {
    expect(resolverSystem.toString()).toContain('SUM_LINE');
    expect(SUM_LINE).toContain('12 × 15 = 180');
    expect(SUM_LINE).toMatch(/never leave the answer/);
  });
});

describe('a quiet room is not a question (F3)', () => {
  it('what Whisper writes for silence, or one letter, is nothing heard; a real question is not', () => {
    for (const s of ['Thank you.', 'thank you', ' Thanks for watching! ', 'you', '.', '', 'धन्यवाद', 'Hmm', 'ok']) expect(heardNothing(s)).toBe(true);
    for (const s of ['Thank you, what is a fraction?', 'What is 12 times 15?', '3/4 + 1/8', 'पानी क्यों उबलता है?', 'Why is the sky blue']) expect(heardNothing(s)).toBe(false);
  });
  it('the call has its own words for it, in both languages', () => {
    expect(en['fam.call.notHeard']).toMatch(/again/);
    expect(hi['fam.call.notHeard']).toMatch(/फिर/);
  });
});

describe('written quiz items come back, marked (F4, reversed in W17-B3)', () => {
  it('the quiz prompt asks for three or four choice items and one or two written ones with their points', () => {
    expect(quizSystem()).toContain('three or four "mcq"');
    expect(quizSystem()).toContain('one or two "written"');
    expect(quizSystem()).toContain('"points"');
  });
});

describe('a verdict that restates a plain sum is settled by arithmetic (F5)', () => {
  it('reads the first sum of a text, with ×, x, *, ÷ and /, and decimals', () => {
    expect(firstSum('You wrote 45 x 2 = 90, but 45 is incorrect.')).toMatchObject({ a: 45, op: '×', b: 2, c: 90 });
    expect(firstSum('23 + 19 = 32. It should be 23 + 19 = 42.')).toMatchObject({ a: 23, op: '+', b: 19, c: 32 });
    expect(firstSum('20 / 4 = 5 Pa')).toMatchObject({ a: 20, op: '÷', b: 4, c: 5 });
    expect(firstSum('2.5 × 4 = 10')).toMatchObject({ a: 2.5, op: '×', b: 4, c: 10 });
    expect(firstSum('P = F / A')).toBeNull();
    expect(firstSum('6 ÷ 0 = 0')).toBeNull();
    expect(sumRight(firstSum('45 x 2 = 90')!)).toBe(true);
    expect(sumRight(firstSum('23 + 19 = 32')!)).toBe(false);
    expect(sumRight(firstSum('1 / 3 = 0.333')!)).toBe(false);
  });

  it('a right sum marked wrong becomes right; a wrong sum marked right becomes wrong, with the value said; the rest stays', () => {
    const block = {
      type: 'steps' as const,
      title: 'Your working',
      items: [
        { label: 'Step 1: wrong', text: 'You wrote 23 + 19 = 32. But 23 + 19 is 42.' },
        { label: 'Step 2: wrong', text: 'You wrote 45 x 2 = 90, but 45 is incorrect.' },
        { label: 'Step 3: right', text: 'You wrote 7 × 8 = 54. Good.' },
        { label: 'Step 4: missing', text: 'The unit is missing.' },
        { label: 'Step 5: right', text: 'You wrote P = F / A. That is the formula.' },
      ],
    };
    const out = verifyVerdicts(block, 'en');
    expect(out.items.map((i) => i.label)).toEqual(['Step 1: wrong', 'Step 2: right', 'Step 3: wrong', 'Step 4: missing', 'Step 5: right']);
    expect(out.items[1].text).toBe('45 × 2 = 90 is correct.');
    expect(out.items[2].text).toBe('7 × 8 = 56, not 54.');
    expect(out.items[0]).toBe(block.items[0]);
    expect(out.items[4]).toBe(block.items[4]);
    // Nothing to settle: the same block comes back.
    expect(verifyVerdicts({ ...block, items: [block.items[0], block.items[4]] }, 'en')).toEqual({ ...block, items: [block.items[0], block.items[4]] });
  });

  it('in Hindi, the verdict words are Hindi', () => {
    const out = verifyVerdicts({ type: 'steps', title: 'x', items: [{ label: 'चरण 2: ग़लत', text: 'आपने 45 x 2 = 90 लिखा, पर 45 ग़लत है।' }, { label: 'चरण 3: सही', text: 'आपने 6 × 7 = 48 लिखा।' }] }, 'hi');
    expect(out.items.map((i) => i.label)).toEqual(['चरण 2: सही', 'चरण 3: ग़लत']);
    expect(out.items[0].text).toBe('45 × 2 = 90 सही है।');
    expect(out.items[1].text).toBe('6 × 7 = 42 होता है, 48 नहीं।');
  });
});
