// The tutor's friendly redirect (founder, 15 Nov 2026). When the model says a question is not a learning question, prompt
// v18 has it name the nearest school topic and two questions to tap. This reads that block safely: the topic and the two
// questions are plain short text, never markup, a link or a long passage, and anything else gives no redirect at all (the
// child then gets the plain friendly line). Tapped, a question goes through the same checks as any typed question.

export type Redirect = { topic: string; examples: [string, string] };

const MAX_TOPIC = 60;
const MAX_EXAMPLE = 120;
// Letters, digits, spaces and the plain punctuation of a short school question in any Indian language or English.
const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > max) return null;
  if (/[<>{}\[\]`\\]|https?:|www\.|@/i.test(s)) return null;
  return s;
};

export function parseRedirect(text: string): Redirect | null {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof o !== 'object' || o === null || (o as { type?: unknown }).type !== 'refuse') return null;
  const topic = clean((o as { nearest?: unknown }).nearest, MAX_TOPIC);
  const raw = (o as { examples?: unknown }).examples;
  if (!topic || !Array.isArray(raw)) return null;
  const examples = [...new Set(raw.map((x) => clean(x, MAX_EXAMPLE)).filter((x): x is string => x !== null))].slice(0, 2);
  return examples.length === 2 ? { topic, examples: [examples[0], examples[1]] } : null;
}
