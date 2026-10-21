// The Concept Resolver's typed blocks (docs/family-app/02 §4, 03 §6; M1-5, C251). The model fills these as DATA, one
// JSON object per line; our components draw them. Nothing here is ever rendered as markup or run as code:
// - every block is checked against its shape; an unknown type, a missing field or a field of the wrong kind drops it;
// - text fields are plain text: markup characters and Markdown marks are taken out, lengths are capped;
// - a worked example's arithmetic is recomputed here (calc), and one wrong step drops the whole example;
// - a check or practice item whose question carries arithmetic must have its keyed option equal to the computed answer;
// - links come only from official hosts (SOURCE_HOSTS), https only.
// Pure: no database, no network. Safe for the phone (no message file imported).

export const BLOCK_SCHEMA_VERSION = 1;

export type Explanation = { type: 'explanation'; title: string; idea: string; example: string; steps: string[]; terms: { en: string; local: string }[] };
export type WorkedStep = { text: string; expression?: string; result?: string };
export type WorkedExample = { type: 'worked_example'; problem: string; steps: WorkedStep[]; answer: string };
export type KeyPoints = { type: 'key_points'; points: string[] };
export type Diagram = { type: 'diagram'; title: string; kind: 'flow' | 'cycle'; nodes: { id: string; label: string }[]; edges: { from: string; to: string; label?: string }[] };
export type QuizItem = { id: string; question: string; options: string[]; answer: number; hint: string; why: string; wrong: string[]; expression?: string };
export type Check = { type: 'check'; items: QuizItem[] };
export type Practice = { type: 'practice'; items: QuizItem[] };
export type EnglishMoment = { type: 'english_moment'; words: { en: string; meaning: string }[]; sentence: string; pattern: string; sayIt: string };
export type Sources = { type: 'sources'; links: { label: string; url: string }[] };
export type Block = Explanation | WorkedExample | KeyPoints | Diagram | Check | Practice | EnglishMoment | Sources;
export type BlockType = Block['type'];
export const BLOCK_TYPES: readonly BlockType[] = ['explanation', 'worked_example', 'key_points', 'diagram', 'check', 'practice', 'english_moment', 'sources'];

// Every response must teach, check and give practice (08 §7); the others come when they fit.
export const REQUIRED_BLOCKS: readonly BlockType[] = ['explanation', 'check', 'practice'];

// Official pages a source link may point to (allowlist; anything else is dropped, never shown).
export const SOURCE_HOSTS: readonly string[] = ['ncert.nic.in', 'cbseacademic.nic.in', 'www.cbse.gov.in', 'cbse.gov.in', 'diksha.gov.in', 'epathshala.nic.in', 'www.education.gov.in'];

// ---- plain text ----

// Markup and Markdown marks out, spaces tidied, length capped. The result is shown as text by React, so nothing in it
// can become markup either way; this keeps "**bold**" and "<b>" from appearing as raw characters on screen.
export function plain(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/\*\*|__|`+|^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > 0 && s.length <= max ? s : s.length > max ? s.slice(0, max).trimEnd() : null;
}

const list = <T>(v: unknown, min: number, max: number, each: (x: unknown) => T | null): T[] | null => {
  if (!Array.isArray(v)) return null;
  const out = v.slice(0, max).map(each).filter((x): x is T => x !== null);
  return out.length >= min ? out : null;
};

// ---- arithmetic, recomputed ----

// A small, safe calculator: numbers (with decimals), + - × * / ÷ ^, brackets, and a trailing % on a number. No names,
// no functions, nothing else; anything outside this grammar is "not arithmetic" (null), never evaluated.
export function calc(expression: string): number | null {
  const src = expression.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '');
  if (!/^[0-9.+\-*/^()%]+$/.test(src) || src.length > 120) return null;
  let i = 0;
  const peek = () => src[i];
  const number = (): number | null => {
    const m = /^\d+(?:\.\d+)?/.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    let n = Number(m[0]);
    if (peek() === '%') {
      i++;
      n /= 100;
    }
    return n;
  };
  const factor = (): number | null => {
    if (peek() === '-') {
      i++;
      const f = factor();
      return f === null ? null : -f;
    }
    if (peek() === '(') {
      i++;
      const e = expr();
      if (e === null || peek() !== ')') return null;
      i++;
      return e;
    }
    return number();
  };
  const power = (): number | null => {
    const base = factor();
    if (base === null) return null;
    if (peek() === '^') {
      i++;
      const exp = power();
      if (exp === null || Math.abs(exp) > 64) return null;
      return base ** exp;
    }
    return base;
  };
  const term = (): number | null => {
    let left = power();
    while (left !== null && (peek() === '*' || peek() === '/')) {
      const op = src[i++];
      const right = power();
      if (right === null) return null;
      if (op === '/' && right === 0) return null;
      left = op === '*' ? left * right : left / right;
    }
    return left;
  };
  const expr = (): number | null => {
    let left = term();
    while (left !== null && (peek() === '+' || peek() === '-')) {
      const op = src[i++];
      const right = term();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };
  const value = expr();
  return value !== null && i === src.length && Number.isFinite(value) ? value : null;
}

// The number a result states ("12", "12.5", "3/4", "= 40 cm" → 40). null when it states none.
export function statedNumber(text: string): number | null {
  const t = text.replace(/,/g, '').replace(/−/g, '-');
  const frac = /(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(t);
  if (frac && Number(frac[2]) !== 0) return Number(frac[1]) / Number(frac[2]);
  const m = /-?\d+(?:\.\d+)?/.exec(t);
  return m ? Number(m[0]) : null;
}

export const sameNumber = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-6, Math.abs(a) * 1e-4);

// ---- each block ----

function quizItem(v: unknown): QuizItem | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const id = typeof o.id === 'string' && /^[a-z0-9_-]{1,20}$/i.test(o.id) ? o.id : null;
  const question = plain(o.question, 400);
  const options = list(o.options, 2, 4, (x) => plain(x, 160));
  const answer = Number(o.answer);
  const hint = plain(o.hint, 300);
  const why = plain(o.why, 400);
  if (!id || !question || !options || options.length !== (Array.isArray(o.options) ? Math.min(o.options.length, 4) : 0)) return null;
  if (!Number.isInteger(answer) || answer < 0 || answer >= options.length || !hint || !why) return null;
  const wrong = options.map((_, k) => (k === answer ? '' : (plain(Array.isArray(o.wrong) ? o.wrong[k] : null, 400) ?? why)));
  const item: QuizItem = { id, question, options, answer, hint, why, wrong };
  if (typeof o.expression === 'string' && o.expression.trim()) {
    // The question's own arithmetic: its keyed option must be what the arithmetic gives, or the item is dropped.
    const value = calc(o.expression);
    const keyed = statedNumber(options[answer]);
    if (value === null || keyed === null || !sameNumber(value, keyed)) return null;
    item.expression = o.expression.slice(0, 120);
  }
  return item;
}

export function checkBlock(raw: unknown): Block | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  switch (o.type) {
    case 'explanation': {
      const title = plain(o.title, 120);
      const idea = plain(o.idea, 300);
      const example = plain(o.example, 600);
      const steps = list(o.steps, 2, 6, (x) => plain(x, 400));
      const terms = list(o.terms, 0, 8, (x) => {
        const t = (x ?? {}) as Record<string, unknown>;
        const en = plain(t.en, 60);
        const local = plain(t.local, 60);
        return en && local ? { en, local } : null;
      });
      return title && idea && example && steps && terms ? { type: 'explanation', title, idea, example, steps, terms } : null;
    }
    case 'worked_example': {
      const problem = plain(o.problem, 500);
      const answer = plain(o.answer, 200);
      const rawSteps = Array.isArray(o.steps) ? o.steps.slice(0, 8) : [];
      const steps: WorkedStep[] = [];
      for (const s of rawSteps) {
        const st = (s ?? {}) as Record<string, unknown>;
        const text = plain(st.text, 400);
        if (!text) return null;
        const step: WorkedStep = { text };
        if (typeof st.expression === 'string' && st.expression.trim()) {
          // Every numeric step is recomputed; one that does not hold drops the whole example (03 §6 step 6).
          const value = calc(st.expression);
          const stated = typeof st.result === 'string' || typeof st.result === 'number' ? statedNumber(String(st.result)) : null;
          if (value === null || stated === null || !sameNumber(value, stated)) return null;
          step.expression = st.expression.slice(0, 120);
          step.result = String(st.result).slice(0, 40);
        }
        steps.push(step);
      }
      return problem && answer && steps.length >= 1 ? { type: 'worked_example', problem, steps, answer } : null;
    }
    case 'key_points': {
      const points = list(o.points, 2, 6, (x) => plain(x, 240));
      return points ? { type: 'key_points', points } : null;
    }
    case 'diagram': {
      const title = plain(o.title, 120);
      const kind = o.kind === 'cycle' ? 'cycle' : 'flow';
      const nodes = list(o.nodes, 2, 8, (x) => {
        const n = (x ?? {}) as Record<string, unknown>;
        const id = typeof n.id === 'string' && /^[a-z0-9_-]{1,20}$/i.test(n.id) ? n.id : null;
        const label = plain(n.label, 60);
        return id && label ? { id, label } : null;
      });
      if (!title || !nodes) return null;
      const ids = new Set(nodes.map((n) => n.id));
      const edges = (list(o.edges, 1, 12, (x) => {
        const e = (x ?? {}) as Record<string, unknown>;
        const from = typeof e.from === 'string' && ids.has(e.from) ? e.from : null;
        const to = typeof e.to === 'string' && ids.has(e.to) ? e.to : null;
        const label = e.label === undefined ? undefined : (plain(e.label, 40) ?? undefined);
        return from && to && from !== to ? { from, to, ...(label ? { label } : {}) } : null;
      }) ?? null);
      return edges ? { type: 'diagram', title, kind, nodes, edges } : null;
    }
    case 'check':
    case 'practice': {
      const items = list(o.items, 1, 3, quizItem);
      return items ? ({ type: o.type, items } as Check | Practice) : null;
    }
    case 'english_moment': {
      const words = list(o.words, 1, 3, (x) => {
        const w = (x ?? {}) as Record<string, unknown>;
        const en = plain(w.en, 40);
        const meaning = plain(w.meaning, 80);
        return en && meaning ? { en, meaning } : null;
      });
      const sentence = plain(o.sentence, 200);
      const pattern = plain(o.pattern, 200);
      const sayIt = plain(o.sayIt, 200);
      return words && sentence && pattern && sayIt ? { type: 'english_moment', words, sentence, pattern, sayIt } : null;
    }
    case 'sources': {
      const links = list(o.links, 1, 4, (x) => {
        const l = (x ?? {}) as Record<string, unknown>;
        const label = plain(l.label, 120);
        return label && typeof l.url === 'string' && allowedSource(l.url) ? { label, url: new URL(l.url).toString() } : null;
      });
      return links ? { type: 'sources', links } : null;
    }
    default:
      return null;
  }
}

export function allowedSource(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && SOURCE_HOSTS.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

// One line of model output → a block, or null. Text around the JSON (a stray "```json") is ignored.
export function parseBlockLine(line: string): Block | null {
  const start = line.indexOf('{');
  const end = line.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return checkBlock(JSON.parse(line.slice(start, end + 1)));
  } catch {
    return null;
  }
}

// A whole response's blocks: the first of each type that passed, in a fixed teaching order. null when a required
// block is missing (the response is then not shown as complete and never cached).
const ORDER: BlockType[] = ['explanation', 'worked_example', 'diagram', 'key_points', 'check', 'practice', 'english_moment', 'sources'];
export function completeResponse(blocks: Block[]): Block[] | null {
  const first = new Map<BlockType, Block>();
  for (const b of blocks) if (!first.has(b.type)) first.set(b.type, b);
  if (!REQUIRED_BLOCKS.every((t) => first.has(t))) return null;
  return ORDER.filter((t) => first.has(t)).map((t) => first.get(t)!);
}
