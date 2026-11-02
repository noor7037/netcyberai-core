import { describe, expect, it } from 'vitest';
import { equationIn, evaluateEquation, verdictsFromReading, verifyVerdicts } from '@/lib/family/arithmetic-check';
import { typedCheckIntent, typedCheckReading, typedCheckWorking } from '@/lib/family/check-work';
import { checkBlock } from '@/lib/family/blocks';

// W18-Q3: Check my work's own arithmetic. The whole equation is evaluated (precedence, brackets, exact fractions,
// Western and Indian grouping), never the first "a op b = c" in it; anything with a letter is left to the model.

describe('evaluateEquation: the whole line, exactly', () => {
  it('marks the plain sums', () => {
    expect(evaluateEquation('5 × 6 = 32')).toEqual({ right: false, expected: '30', stated: '32', shown: '5 × 6' });
    expect(evaluateEquation('45 x 2 = 90')).toMatchObject({ right: true, shown: '45 × 2', stated: '90' });
    expect(evaluateEquation('12 × 15 = 180')?.right).toBe(true);
    expect(evaluateEquation('2.5 × 4 = 10')?.right).toBe(true);
    expect(evaluateEquation('(2 + 3) × 4 = 20')?.right).toBe(true);
  });

  it('keeps operator precedence: 2 + 3 × 4 is 14, never "3 × 4 = 14"', () => {
    expect(evaluateEquation('2 + 3 × 4 = 14')).toMatchObject({ right: true });
    expect(evaluateEquation('2+3×4=14')).toMatchObject({ right: true, shown: '2+3×4' });
    expect(evaluateEquation('2 + 3 × 4 = 20')).toEqual({ right: false, expected: '14', stated: '20', shown: '2 + 3 × 4' });
    expect(evaluateEquation('10 - 4 - 3 = 3')?.right).toBe(true);
    expect(evaluateEquation('12 ÷ 4 ÷ 3 = 1')?.right).toBe(true);
    expect(evaluateEquation('-3 + 5 = 2')?.right).toBe(true);
  });

  it('keeps fractions exact and says the value as a fraction when one was written', () => {
    expect(evaluateEquation('3/4 + 1/8 = 7/8')?.right).toBe(true);
    expect(evaluateEquation('3/4 + 1/8 = 4/12')).toMatchObject({ right: false, expected: '7/8', stated: '4/12' });
    expect(evaluateEquation('1/2 + 1/2 = 1')?.right).toBe(true);
    expect(evaluateEquation('6/8 = 3/4')?.right).toBe(true);
  });

  it('reads Western and Indian grouping, and says the value in the child’s grouping', () => {
    expect(evaluateEquation('1,000 + 2 = 1,002')?.right).toBe(true);
    expect(evaluateEquation('1,00,000 + 1 = 1,00,001')?.right).toBe(true);
    expect(evaluateEquation('99,999 + 1 = 1,00,000')?.right).toBe(true);
    expect(evaluateEquation('1,00,000 + 1 = 1,00,002')).toMatchObject({ right: false, expected: '1,00,001' });
    expect(evaluateEquation('1,000,000 + 1 = 1,000,002')).toMatchObject({ right: false, expected: '1,000,001' });
    // A comma that is no thousands mark is no number: left to the model.
    expect(evaluateEquation('2,5 + 1 = 3,5')).toBeNull();
  });

  it('says decimals to the places written; a rounded value with no finite decimal is right', () => {
    expect(evaluateEquation('7 ÷ 2 = 3')).toMatchObject({ right: false, expected: '3.5' });
    expect(evaluateEquation('1 ÷ 8 = 0.13')).toMatchObject({ right: false, expected: '0.125' });
    expect(evaluateEquation('10 ÷ 3 = 3.33')?.right).toBe(true);
    expect(evaluateEquation('10 ÷ 3 = 3.3')).toMatchObject({ right: false, expected: '3.33' });
    expect(evaluateEquation('10 ÷ 3 = 3')).toMatchObject({ right: false, expected: '10/3' });
  });

  it('judges a chain pair by pair', () => {
    expect(evaluateEquation('12 × 15 = 12 × 10 + 12 × 5 = 120 + 60 = 180')).toMatchObject({ right: true, stated: '180' });
    expect(evaluateEquation('2 + 3 = 5 = 5')).toMatchObject({ right: true, shown: '2 + 3 = 5', stated: '5' });
    expect(evaluateEquation('2 + 3 = 5 = 6')).toEqual({ right: false, expected: '5', stated: '6', shown: '2 + 3' });
    expect(evaluateEquation('2 + 3 = 6 = 6')).toMatchObject({ right: false, expected: '5', stated: '6' });
    expect(evaluateEquation('a = b = c')).toBeNull();
  });

  it('leaves letters, units, variables and what it does not compute to the model', () => {
    expect(evaluateEquation('x + 2 = 5')).toBeNull();
    expect(evaluateEquation('2x + 3 = 7')).toBeNull();
    expect(evaluateEquation('20 N / 4 m2 = 5')).toBeNull();
    expect(evaluateEquation('P = F / A')).toBeNull();
    expect(evaluateEquation('2^3 = 8')).toBeNull();
    expect(evaluateEquation('50% of 20 = 10')).toBeNull();
    expect(evaluateEquation('6 ÷ 0 = 0')).toBeNull();
    expect(evaluateEquation('5 × 6')).toBeNull();
    expect(evaluateEquation('= 32')).toBeNull();
    // No operation at all: nothing to mark.
    expect(evaluateEquation('30 = 30')).toBeNull();
  });

  it('reads Devanagari digits', () => {
    expect(evaluateEquation('५ × ६ = ३०')?.right).toBe(true);
  });
});

describe('equationIn and verifyVerdicts', () => {
  it('finds the whole equation in a sentence, not its last pair', () => {
    expect(equationIn('You wrote 2 + 3 × 4 = 14. Good.')?.right).toBe(true);
    expect(equationIn('You wrote 3/4 + 1/8 = 7/8.')?.right).toBe(true);
    expect(equationIn('You wrote 1,000 + 2 = 1,002, well done.')?.right).toBe(true);
    expect(equationIn('You wrote x + 2 = 5.')).toBeNull();
    expect(equationIn('A force of 20 N / 4 m2 = 5 Pa')).toBeNull();
  });

  it('never flips a right line read in part (the 2 + 3 × 4 bug), and gives a verdict where the model gave none', () => {
    const block = {
      type: 'steps' as const,
      title: 'Your working',
      items: [
        { label: 'Step 1: right', text: 'You wrote 2 + 3 × 4 = 14.' },
        { label: 'Step 2', text: '5 × 6 = 32' },
        { label: 'Step 3: missing', text: '5 × 6 = 30' },
        { label: 'Step 4: right', text: 'You wrote 3/4 + 1/8 = 4/12.' },
      ],
    };
    const out = verifyVerdicts(block, 'en');
    expect(out.items[0]).toBe(block.items[0]);
    expect(out.items[1]).toEqual({ label: 'Step 2: wrong', text: '5 × 6 = 30, not 32.' });
    expect(out.items[2]).toBe(block.items[2]);
    expect(out.items[3]).toEqual({ label: 'Step 4: wrong', text: '3/4 + 1/8 = 7/8, not 4/12.' });
  });
});

describe('verdicts from the reading alone', () => {
  const READING = ['Question: Multiply.', 'Line 1: 5 × 6 = 32', 'Line 2: 45 x 2 = 90', 'Line 3: so the answer is 32', 'Answer: 32'].join('\n');

  it('one item per equation line, "Step N" naming the child’s line', () => {
    expect(verdictsFromReading(READING, 'en', 'Your working, marked')).toEqual({
      type: 'steps',
      title: 'Your working, marked',
      items: [
        { label: 'Step 1: wrong', text: '5 × 6 = 30, not 32.' },
        { label: 'Step 2: right', text: '45 × 2 = 90 is correct.' },
      ],
    });
    expect(verdictsFromReading('Question: Who built it?\nLine 1: Shah Jahan', 'en', 't')).toBeNull();
  });

  it('in Hindi, the labels and lines are Hindi', () => {
    expect(verdictsFromReading(READING, 'hi', 'तुम्हारा काम, जाँचा गया')?.items).toEqual([
      { label: 'चरण 1: ग़लत', text: '5 × 6 = 30 होता है, 32 नहीं।' },
      { label: 'चरण 2: सही', text: '45 × 2 = 90 सही है।' },
    ]);
  });

  it('at most five: every wrong line kept first, shown in line order', () => {
    const lines = Array.from({ length: 7 }, (_, i) => `Line ${i + 1}: ${i + 1} + 1 = ${i === 6 ? 99 : i + 2}`).join('\n');
    const items = verdictsFromReading(lines, 'en', 't')!.items;
    expect(items.map((i) => i.label)).toEqual(['Step 1: right', 'Step 2: right', 'Step 3: right', 'Step 4: right', 'Step 7: wrong']);
  });

  it('a verdict block of one or two steps passes the block checker (a one-line sum has one step); a teaching strip still needs three', () => {
    const one = verdictsFromReading('Line 1: 2+3×4=14', 'en', 'Your working, marked')!;
    expect(checkBlock(one)).toEqual(one);
    expect(checkBlock({ type: 'steps', title: 'x', items: [{ label: 'चरण 1: सही', text: 'ठीक।' }] })).not.toBeNull();
    expect(checkBlock({ type: 'steps', title: 'x', items: [{ label: 'Roots', text: 'Roots take in water.' }] })).toBeNull();
  });
});

describe('typed Check my work', () => {
  it('is the opening words and an equation we can mark, in English or Hindi', () => {
    expect(typedCheckIntent('Check my work: 2+3×4=14')).toBe(true);
    expect(typedCheckIntent('check my work - 5 × 6 = 32')).toBe(true);
    expect(typedCheckIntent('Is this right? 45 x 2 = 90')).toBe(true);
    expect(typedCheckIntent('मेरा काम जाँचो: 5 × 6 = 30')).toBe(true);
    expect(typedCheckIntent('क्या यह सही है - 12 × 15 = 180')).toBe(true);
    expect(typedCheckIntent('Check my work')).toBe(false);
    expect(typedCheckIntent('Check my work: x + 2 = 5')).toBe(false);
    expect(typedCheckIntent('What is 2+3×4=14?')).toBe(false);
  });

  it('builds the reading line by line from the typed working', () => {
    expect(typedCheckWorking('Check my work: 5 × 6 = 32, 45 x 2 = 90; 1,000 + 2 = 1,002.')).toEqual(['5 × 6 = 32', '45 x 2 = 90', '1,000 + 2 = 1,002']);
    expect(typedCheckReading('Check my work: 2+3×4=14')).toBe('Line 1: 2+3×4=14');
    expect(typedCheckReading('Explain fractions')).toBeNull();
  });
});
