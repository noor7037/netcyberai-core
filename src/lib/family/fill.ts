// Safe for the phone: no message file is imported here (src/lib/family/words.ts picks the words on the server).
export type Words = Record<string, string>;

// `{name}` in a picked message, filled on the phone.
export function fill(text: string | undefined, params: Record<string, string | number> = {}): string {
  return (text ?? '').replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

// A class as families say it (C263): Nursery, LKG and UKG (-2, -1, 0), then "Class 1" to "Class 12". `word` gives a
// message: the picked words on the phone, or t(lang, …) on the server.
export const CLASS_WORD_KEYS = ['fam.class.label', 'fam.class.nursery', 'fam.class.lkg', 'fam.class.ukg'] as const;
export function classText(word: (key: (typeof CLASS_WORD_KEYS)[number]) => string | undefined, n: number): string {
  if (n === -2) return word('fam.class.nursery') ?? '';
  if (n === -1) return word('fam.class.lkg') ?? '';
  if (n === 0) return word('fam.class.ukg') ?? '';
  return fill(word('fam.class.label'), { n });
}
