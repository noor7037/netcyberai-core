// The learner's name in a tutor's answer (W22-S3). A child's first name is personal data and never goes to an AI provider
// (the gateway also scrubs it from what it sends). The tutor prompt (family.resolver v12) asks the model to write the
// literal token {{name}} where it would address the learner; this file swaps the token for the child's first name on our own
// server, after the answer has come back and been safety-checked, and strips the token wherever there is no name to put
// (a prompt version that never writes one, a child with no first name, a shared answer kept for other children). Pure.

export const NAME_TOKEN = /\{\{\s*name\s*\}\}/gi;
const HAS_TOKEN = /\{\{\s*name\s*\}\}/i;

// The most times one answer uses the name: "now and then", never every sentence.
export const NAME_USES_MAX = 2;

// Removes every token and the punctuation and space that held it: "Good try, {{name}}!" reads "Good try!", "Well done
// {{name}}, now" reads "Well done, now", and a token that opens the text drops with its comma ("{{name}}, look" reads "Look").
export function stripName(text: string): string {
  if (!HAS_TOKEN.test(text)) return text;
  let out = text
    .replace(/\s*,\s*\{\{\s*name\s*\}\}(?=\s*[.!?।;:])/gi, '')
    .replace(/\s*,\s*\{\{\s*name\s*\}\}\s*,/gi, ',')
    .replace(/^\s*\{\{\s*name\s*\}\}\s*[,:—-]?\s*/i, '')
    .replace(/\s*\{\{\s*name\s*\}\}/gi, '');
  // A token that opened the text leaves the next word to begin it.
  if (out !== text && /^[a-z]/.test(out) && !/^\s*[a-z]/.test(text)) out = out[0].toUpperCase() + out.slice(1);
  return out.trim() === '' ? '' : out;
}

// A filler for one answer: the first NAME_USES_MAX tokens become the name, the rest are stripped. `name` is used as
// given (a replacer function, so a name with "$" is never read as a pattern). A name the model also wrote beside the token
// ("Asha {{name}}") is not doubled. No name (empty): every token is stripped.
export function nameFiller(name: string | null | undefined): <T>(value: T) => T {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  let used = 0;
  const one = (s: string): string => {
    if (!HAS_TOKEN.test(s)) return s;
    if (!first) return stripName(s);
    // Tokens past the limit go first, so the earliest ones are the ones kept.
    const swapped = stripName(s.replace(NAME_TOKEN, (m) => (used++ < NAME_USES_MAX ? '\u0001' : m))).replace(/\u0001/g, () => first);
    const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return swapped.replace(new RegExp(`(${escaped})(\\s*,)?\\s+${escaped}(?![\\p{L}\\p{N}])`, 'giu'), (_m, a: string, c?: string) => `${a}${c ?? ''}`);
  };
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return one(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return ((value: unknown) => walk(value)) as <T>(value: T) => T;
}

// The same, for one value with no name: every token stripped (a shared answer, kept for children other than this one).
export const withoutName = nameFiller(null);
