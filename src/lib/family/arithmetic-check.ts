import type { Steps } from './blocks';

// Check my work (W16-B2), the deterministic part. The browser test of 2 Nov 2026 saw a model mark "45 × 2 = 90" wrong
// ("45 is incorrect") and invent a missing step. A verdict that restates a plain sum the student wrote is settled here
// by our own arithmetic, whatever the model said: the sum right → the step is right; the sum wrong → the step is wrong,
// with the correct value said. Only the first sum in a verdict's text is the student's (a correction may follow it).
// Pure; whole numbers and decimals, the four operations; anything else is left to the model's verdict.

const SUM = /(-?\d+(?:[.,]\d+)?)\s*([+\-−×x*÷/])\s*(-?\d+(?:[.,]\d+)?)\s*=\s*(-?\d+(?:[.,]\d+)?)/u;
const num = (s: string) => Number(s.replace(',', '.'));

export type Sum = { a: number; op: '+' | '-' | '×' | '÷'; b: number; c: number; text: string };

// The first "a op b = c" in a text, or null.
export function firstSum(text: string): Sum | null {
  const m = SUM.exec(text.normalize('NFKC'));
  if (!m) return null;
  const op = m[2] === '+' ? '+' : m[2] === '-' || m[2] === '−' ? '-' : m[2] === '×' || m[2] === 'x' || m[2] === '*' ? '×' : '÷';
  const a = num(m[1]);
  const b = num(m[3]);
  const c = num(m[4]);
  if (![a, b, c].every(Number.isFinite) || (op === '÷' && b === 0)) return null;
  return { a, op, b, c, text: m[0] };
}

export const sumValue = (s: Sum): number => (s.op === '+' ? s.a + s.b : s.op === '-' ? s.a - s.b : s.op === '×' ? s.a * s.b : s.a / s.b);
// Right when the stated value is the computed one (to the rounding a student would write).
export const sumRight = (s: Sum): boolean => Math.abs(sumValue(s) - s.c) <= 1e-9 * Math.max(1, Math.abs(s.c));

const VERDICT: Record<'en' | 'hi', { right: string; wrong: string; isRight: RegExp; isWrong: RegExp }> = {
  en: { right: 'right', wrong: 'wrong', isRight: /\b(right|correct)\b/i, isWrong: /\b(wrong|incorrect)\b/i },
  hi: { right: 'सही', wrong: 'ग़लत', isRight: /सही|right|correct/i, isWrong: /ग़लत|गलत|wrong|incorrect/i },
};
const plain = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

// The label with its verdict word replaced, keeping "Step N:" as the model wrote it.
function relabel(label: string, lang: 'en' | 'hi', to: 'right' | 'wrong'): string {
  const at = label.indexOf(':');
  const head = at >= 0 ? label.slice(0, at + 1) : label;
  return `${head} ${VERDICT[lang][to]}`;
}

// The steps block with every verdict that restates a plain sum settled by arithmetic. A verdict without a sum, or one
// already agreeing with the sum, is returned as it came.
export function verifyVerdicts(block: Steps, lang: 'en' | 'hi'): Steps {
  let changed = false;
  const items = block.items.map((item) => {
    const sum = firstSum(item.text);
    if (!sum) return item;
    const right = sumRight(sum);
    const { isRight, isWrong } = VERDICT[lang];
    const saidRight = isRight.test(item.label) && !isWrong.test(item.label);
    const saidWrong = isWrong.test(item.label);
    if (right && saidWrong) {
      changed = true;
      const shown = `${plain(sum.a)} ${sum.op} ${plain(sum.b)} = ${plain(sum.c)}`;
      return { label: relabel(item.label, lang, 'right'), text: lang === 'hi' ? `${shown} सही है।` : `${shown} is correct.` };
    }
    if (!right && saidRight) {
      changed = true;
      const shown = `${plain(sum.a)} ${sum.op} ${plain(sum.b)}`;
      return {
        label: relabel(item.label, lang, 'wrong'),
        text: lang === 'hi' ? `${shown} = ${plain(sumValue(sum))} होता है, ${plain(sum.c)} नहीं।` : `${shown} = ${plain(sumValue(sum))}, not ${plain(sum.c)}.`,
      };
    }
    return item;
  });
  return changed ? { ...block, items } : block;
}
