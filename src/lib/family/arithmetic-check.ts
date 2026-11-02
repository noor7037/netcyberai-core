import type { Steps } from './blocks';

// Check my work (W16-B2, W18-Q3), the deterministic part. The browser test of 2 Nov 2026 saw a model mark "45 × 2 = 90"
// wrong ("45 is incorrect") and invent a missing step. A verdict that restates a plain sum the student wrote is settled
// here by our own arithmetic, whatever the model said: the sum right → the step is right; the sum wrong → the step is
// wrong, with the correct value said.
//
// W18-Q3: the whole equation is evaluated, never the first "a op b = c" found in it. The first-match reading checked
// "3 × 4 = 14" inside "2 + 3 × 4 = 14" (and called a right line wrong), read "1/8 = 7" inside "3/4 + 1/8 = 7/8", and took
// the comma of "1,000" for a decimal point. The parser below is tiny and safe (no eval): numbers (decimals, Western
// "1,000" and Indian "1,00,000" grouping), fractions kept exact as rationals, + − × ÷ and brackets, with precedence.
// Anything with a letter, a unit or a variable is left to the model (null). Pure; runs on the phone and the server.

// ---- exact rationals ----------------------------------------------------------------------------------------------
// BigInt() calls, not 1n literals: the project compiles to ES2017.

export type Rational = { n: bigint; d: bigint }; // d > 0, lowest terms
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const FIVE = BigInt(5);
const TEN = BigInt(10);
const abs = (a: bigint) => (a < ZERO ? -a : a);
function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b !== ZERO) [a, b] = [b, a % b];
  return a;
}
function rat(n: bigint, d: bigint = ONE): Rational | null {
  if (d === ZERO) return null;
  if (d < ZERO) [n, d] = [-n, -d];
  const g = gcd(n, d) || ONE;
  return { n: n / g, d: d / g };
}
const add = (a: Rational, b: Rational) => rat(a.n * b.d + b.n * a.d, a.d * b.d)!;
const sub = (a: Rational, b: Rational) => rat(a.n * b.d - b.n * a.d, a.d * b.d)!;
const mul = (a: Rational, b: Rational) => rat(a.n * b.n, a.d * b.d)!;
const div = (a: Rational, b: Rational) => (b.n === ZERO ? null : rat(a.n * b.d, a.d * b.n));
const same = (a: Rational, b: Rational) => a.n === b.n && a.d === b.d;
const pow10 = (k: number) => {
  let p = ONE;
  for (let i = 0; i < k; i++) p *= TEN;
  return p;
};
// A value with a finite decimal: its denominator has no prime factor but 2 and 5.
function terminates(v: Rational): boolean {
  let d = v.d;
  while (d % TWO === ZERO) d /= TWO;
  while (d % FIVE === ZERO) d /= FIVE;
  return d === ONE;
}

// ---- reading a side -------------------------------------------------------------------------------------------------

type Grouping = 'western' | 'indian' | null;
type Num = { k: 'num'; v: Rational; places: number; grouping: Grouping; ambiguous: boolean };
type Tok = Num | { k: 'op'; op: '+' | '-' | '×' | '÷' } | { k: '(' } | { k: ')' };

// Devanagari digits read as digits: a Hindi-medium child may write them.
const DEVANAGARI = /[०-९]/g;
export const normalizeMath = (s: string) => s.normalize('NFKC').replace(DEVANAGARI, (c) => String(c.charCodeAt(0) - 0x0966));

const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';
const LETTER = /\p{L}/u;

// "1,000", "1,00,000", "12.5", "1,234.75". A comma is a thousands mark only when the groups after it fit Western (all of
// three digits, the lead 1 to 3) or Indian (twos, then a last three, the lead 1 or 2) grouping; "2,5" is no number.
function readNumber(s: string, i: number): { tok: Num; end: number } | null {
  let j = i;
  let lead = '';
  while (isDigit(s[j])) lead += s[j++];
  const groups: string[] = [];
  while (s[j] === ',' && isDigit(s[j + 1])) {
    let g = '';
    let m = j + 1;
    while (isDigit(s[m])) g += s[m++];
    groups.push(g);
    j = m;
  }
  let grouping: Grouping = null;
  let ambiguous = false;
  if (groups.length > 0) {
    const last = groups[groups.length - 1];
    const western = lead.length >= 1 && lead.length <= 3 && groups.every((g) => g.length === 3);
    const indian = lead.length >= 1 && lead.length <= 2 && last.length === 3 && groups.slice(0, -1).every((g) => g.length === 2);
    if (!western && !indian) return null;
    // "12,345" fits both; it says nothing about which grouping the child uses.
    ambiguous = western && indian;
    grouping = indian && !western ? 'indian' : 'western';
  }
  let frac = '';
  if (s[j] === '.' && isDigit(s[j + 1])) {
    j++;
    while (isDigit(s[j])) frac += s[j++];
  }
  const digits = lead + groups.join('') + frac;
  if (digits.length === 0 || digits.length > 30) return null;
  return { tok: { k: 'num', v: rat(BigInt(digits), pow10(frac.length))!, places: frac.length, grouping, ambiguous }, end: j };
}

function tokens(side: string): Tok[] | null {
  const s = side;
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(s[i + 1]))) {
      const r = readNumber(s, i);
      if (!r) return null;
      out.push(r.tok);
      i = r.end;
      continue;
    }
    const prev = out[out.length - 1];
    if (c === 'x' || c === 'X') {
      // "45 x 2": an x between a number (or a bracket) and a number is times; anywhere else it is a variable.
      const next = s.slice(i + 1).trimStart()[0];
      if (!prev || (prev.k !== 'num' && prev.k !== ')') || !(isDigit(next) || next === '(' || next === '.')) return null;
      out.push({ k: 'op', op: '×' });
      i++;
      continue;
    }
    if (c === '+') out.push({ k: 'op', op: '+' });
    else if (c === '-' || c === '−' || c === '–') out.push({ k: 'op', op: '-' });
    else if (c === '×' || c === '*' || c === '·') out.push({ k: 'op', op: '×' });
    else if (c === '÷' || c === '/') out.push({ k: 'op', op: '÷' });
    else if (c === '(' || c === '[' || c === '{') out.push({ k: '(' });
    else if (c === ')' || c === ']' || c === '}') out.push({ k: ')' });
    // A letter, a unit, a symbol we do not compute (%, ^, ², √): left to the model.
    else return null;
    i++;
  }
  return out;
}

// expr := term (('+'|'-') term)*;  term := factor (('×'|'÷') factor)*;  factor := ('+'|'-') factor | num | '(' expr ')'
function evaluate(toks: Tok[]): Rational | null {
  let at = 0;
  const peek = () => toks[at];
  const isOp = (t: Tok | undefined, ...ops: string[]) => t?.k === 'op' && ops.includes(t.op);
  function factor(depth: number): Rational | null {
    if (depth > 50) return null;
    const t = peek();
    if (!t) return null;
    if (isOp(t, '+', '-')) {
      at++;
      const v = factor(depth + 1);
      return v && (t as { op: string }).op === '-' ? rat(-v.n, v.d) : v;
    }
    if (t.k === 'num') {
      at++;
      return t.v;
    }
    if (t.k === '(') {
      at++;
      const v = expr(depth + 1);
      if (!v || peek()?.k !== ')') return null;
      at++;
      return v;
    }
    return null;
  }
  function term(depth: number): Rational | null {
    let v = factor(depth);
    while (v && isOp(peek(), '×', '÷')) {
      const op = (toks[at++] as { op: string }).op;
      const r = factor(depth);
      if (!r) return null;
      v = op === '×' ? mul(v, r) : div(v, r);
    }
    return v;
  }
  function expr(depth: number): Rational | null {
    let v = term(depth);
    while (v && isOp(peek(), '+', '-')) {
      const op = (toks[at++] as { op: string }).op;
      const r = term(depth);
      if (!r) return null;
      v = op === '+' ? add(v, r) : sub(v, r);
    }
    return v;
  }
  const v = expr(0);
  return v && at === toks.length ? v : null;
}

// ---- formatting the expected value ----------------------------------------------------------------------------------

function grouped(int: string, g: Grouping): string {
  if (!g || int.length <= 3) return int;
  const last = int.slice(-3);
  let rest = int.slice(0, -3);
  const size = g === 'indian' ? 2 : 3;
  const parts: string[] = [];
  while (rest.length > size) {
    parts.unshift(rest.slice(-size));
    rest = rest.slice(0, -size);
  }
  parts.unshift(rest);
  return `${parts.join(',')},${last}`;
}

// The value rounded half away from zero to `places` decimals, written with exactly that many.
function decimal(v: Rational, places: number, g: Grouping): string {
  const scale = pow10(places);
  const neg = v.n < ZERO;
  const n = abs(v.n) * scale;
  const q = (n * TWO + v.d) / (v.d * TWO);
  const s = q.toString().padStart(places + 1, '0');
  const int = s.slice(0, s.length - places);
  const frac = places > 0 ? `.${s.slice(s.length - places)}` : '';
  return `${neg && q !== ZERO ? '-' : ''}${grouped(int, g)}${frac}`;
}

type Style = { kind: 'int' | 'dec' | 'frac'; places: number; grouping: Grouping };

// How the stated side is written, so the correct value is said the same way: a fraction as a fraction, a decimal to its
// places, a large number with the child's own grouping.
function styleOf(side: string, toks: Tok[], others: Tok[]): Style {
  const nums = toks.filter((t): t is Num => t.k === 'num');
  const fromOthers = others.filter((t): t is Num => t.k === 'num');
  const grouping = nums.find((t) => t.grouping && !t.ambiguous)?.grouping ?? fromOthers.find((t) => t.grouping && !t.ambiguous)?.grouping ?? nums.find((t) => t.grouping)?.grouping ?? fromOthers.find((t) => t.grouping)?.grouping ?? null;
  if (side.includes('/')) return { kind: 'frac', places: 0, grouping };
  const places = Math.max(0, ...nums.map((t) => t.places));
  return { kind: places > 0 ? 'dec' : 'int', places, grouping };
}

function format(v: Rational, st: Style): string {
  if (v.d === ONE) return decimal(v, 0, st.grouping);
  if (st.kind === 'frac') return `${v.n}/${v.d}`;
  if (terminates(v)) {
    let p = 0;
    while (pow10(p) % v.d !== ZERO) p++;
    if (p <= 3) return decimal(v, p, st.grouping);
    return st.kind === 'dec' ? decimal(v, 3, st.grouping) : `${v.n}/${v.d}`;
  }
  return st.kind === 'dec' ? decimal(v, Math.min(3, Math.max(2, st.places)), st.grouping) : `${v.n}/${v.d}`;
}

// "10 ÷ 3 = 3.33" is right in school: a value with no finite decimal, stated as a single decimal of two or more places
// correctly rounded. A value that does end ("1 ÷ 8") must be exact.
function roundedRight(v: Rational, toks: Tok[]): boolean {
  if (terminates(v) || toks.length !== 1 || toks[0].k !== 'num' || toks[0].places < 2) return false;
  const diff = sub(v, toks[0].v);
  return abs(diff.n) * TWO * pow10(toks[0].places) <= diff.d;
}

// ---- the evaluator --------------------------------------------------------------------------------------------------

export type Evaluated = {
  right: boolean;
  // The correct value of the left side, written like the stated side.
  expected: string;
  // The side the child stated, as written.
  stated: string;
  // What the verdict restates before " = ": the left side (every side but the last when the line is right).
  shown: string;
};

const tidy = (side: string) => side.replace(/[xX*]/g, '×').replace(/\s+/g, ' ').trim();
const TRAILING = /[\s.;:!?,]+$/;

// A line that is a plain equation, "a = b" or a chain "a = b = c" (every pair must hold), judged by exact arithmetic.
// null when it is not one we can judge: no "=", an empty side, no operation at all, a letter, a unit, a variable, a
// symbol we do not compute, or a division by zero.
export function evaluateEquation(line: string): Evaluated | null {
  const s = normalizeMath(line).replace(TRAILING, '').trim();
  if (!s.includes('=')) return null;
  const sides = s.split('=').map((x) => x.trim());
  if (sides.length < 2 || sides.some((x) => x.length === 0)) return null;
  const toks = sides.map(tokens);
  if (toks.some((t) => t === null || t.length === 0)) return null;
  const ts = toks as Tok[][];
  if (!ts.some((t) => t.some((x) => x.k === 'op'))) return null;
  const values = ts.map(evaluate);
  if (values.some((v) => v === null)) return null;
  const vs = values as Rational[];
  for (let i = 0; i + 1 < vs.length; i++) {
    if (same(vs[i], vs[i + 1]) || roundedRight(vs[i], ts[i + 1])) continue;
    // The first pair that fails: the child's expression, its value, and what was written instead.
    return { right: false, expected: format(vs[0], styleOf(sides[i + 1], ts[i + 1], ts[0])), stated: tidy(sides[i + 1]), shown: tidy(sides[0]) };
  }
  const last = sides.length - 1;
  return { right: true, expected: format(vs[0], styleOf(sides[last], ts[last], ts[0])), stated: tidy(sides[last]), shown: sides.slice(0, last).map(tidy).join(' = ') };
}

// The first equation in a sentence ("You wrote 45 x 2 = 90, but…"), judged; null when there is none we can judge. Only
// the first is the student's: a correction may follow it. A number joined to a letter ("4 m2", "2x") is not arithmetic.
const RUN = /(?:[\d\s+\-−–×*÷/()[\]=]|[.,](?=\d))+/g;
export function equationIn(text: string): Evaluated | null {
  const s = normalizeMath(text).replace(/(?<=[\d)]\s*)[xX](?=\s*[\d(.])/g, '×');
  for (const m of s.matchAll(RUN)) {
    if (!m[0].includes('=')) continue;
    const lead = m[0].length - m[0].trimStart().length;
    const body = m[0].trim();
    const from = (m.index ?? 0) + lead;
    const to = from + body.length;
    if (!/^[\d(.[]/.test(body) || !/[\d)\]]$/.test(body)) return null;
    if (LETTER.test(s[from - 1] ?? '') || LETTER.test(s[to] ?? '')) return null;
    return evaluateEquation(body);
  }
  return null;
}

// ---- verdicts -------------------------------------------------------------------------------------------------------

type Lang = 'en' | 'hi';
const VERDICT: Record<Lang, { step: string; right: string; wrong: string; isRight: RegExp; isWrong: RegExp; isMissing: RegExp }> = {
  en: { step: 'Step', right: 'right', wrong: 'wrong', isRight: /\b(right|correct)\b/i, isWrong: /\b(wrong|incorrect)\b/i, isMissing: /\bmissing\b|छूट|अधूर/i },
  hi: { step: 'चरण', right: 'सही', wrong: 'ग़लत', isRight: /सही|right|correct/i, isWrong: /ग़लत|गलत|wrong|incorrect/i, isMissing: /छूट|अधूर|missing/i },
};

// The verdict's one line, in the child's language: "5 × 6 = 30, not 32." / "5 × 6 = 30 is correct."
export function verdictText(e: Evaluated, lang: Lang): string {
  if (e.right) return lang === 'hi' ? `${e.shown} = ${e.stated} सही है।` : `${e.shown} = ${e.stated} is correct.`;
  return lang === 'hi' ? `${e.shown} = ${e.expected} होता है, ${e.stated} नहीं।` : `${e.shown} = ${e.expected}, not ${e.stated}.`;
}

// The label with its verdict word replaced, keeping "Step N:" as the model wrote it (a label with no colon gains one).
function relabel(label: string, lang: Lang, to: 'right' | 'wrong'): string {
  const at = label.indexOf(':');
  const head = at >= 0 ? label.slice(0, at + 1) : `${label.trim()}:`;
  return `${head} ${VERDICT[lang][to]}`;
}

// The steps block with every verdict that restates a plain equation settled by arithmetic, and a verdict given to a
// step the model left without one when its text is a plain equation. A step marked missing, a verdict without an
// equation, or one already agreeing with the arithmetic, is returned as it came.
export function verifyVerdicts(block: Steps, lang: Lang): Steps {
  let changed = false;
  const { isRight, isWrong, isMissing } = VERDICT[lang];
  const items = block.items.map((item) => {
    const saidWrong = isWrong.test(item.label);
    const saidRight = isRight.test(item.label) && !saidWrong;
    const none = !saidRight && !saidWrong && !isMissing.test(item.label);
    const e = none ? evaluateEquation(item.text) : equationIn(item.text);
    if (!e) return item;
    if ((e.right && saidRight) || (!e.right && saidWrong)) return item;
    if (!saidRight && !saidWrong && !none) return item;
    changed = true;
    return { label: relabel(item.label, lang, e.right ? 'right' : 'wrong'), text: verdictText(e, lang) };
  });
  return changed ? { ...block, items } : block;
}

// ---- a verdict from the reading alone ---------------------------------------------------------------------------------

// The reading's working lines, "Line N: …" (family.homework v2's layout, CHECK_LINE_PREFIX; the typed check builds the
// same), with their numbers.
const READING_LINE = /^\s*line\s*(\d{1,3})\s*[:.)-]\s*(.+?)\s*$/i;
const STEPS_MAX = 5;
const LABEL_MAX = 30;
const TEXT_MAX = 120;

// The verdicts our own arithmetic can give when the model gave none that passed: one item per working line that is a
// plain equation, "Step N" naming the child's own line N. At most five: every wrong line first (they are what the child
// needs), then the right ones, shown in line order. null when no line is an equation we can judge.
export function verdictsFromReading(reading: string, lang: Lang, title: string): Steps | null {
  const judged: { n: number; e: Evaluated }[] = [];
  for (const raw of reading.split('\n')) {
    const m = READING_LINE.exec(raw);
    if (!m) continue;
    const e = evaluateEquation(m[2]);
    if (e) judged.push({ n: Number(m[1]), e });
  }
  const fits = judged
    .map(({ n, e }) => ({ n, e, label: `${VERDICT[lang].step} ${n}: ${VERDICT[lang][e.right ? 'right' : 'wrong']}`, text: verdictText(e, lang) }))
    .filter((x) => x.label.length <= LABEL_MAX && x.text.length <= TEXT_MAX);
  if (fits.length === 0) return null;
  const chosen = [...fits.filter((x) => !x.e.right), ...fits.filter((x) => x.e.right)].slice(0, STEPS_MAX).sort((a, b) => a.n - b.n);
  return { type: 'steps', title, items: chosen.map(({ label, text }) => ({ label, text })) };
}
