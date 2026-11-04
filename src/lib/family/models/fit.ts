// Where a 3D model belongs (W19-D), like simFits for the simulations: the question, its syllabus line or the block's own
// title must carry one of the model's words (./catalog.ts `words`), or the block is dropped, whatever the model wrote.
// English words match at the start of a word ("digest" fits "digestion", "rain" does not fit "brain"); Hindi words
// match anywhere (a Devanagari word takes endings and joins).

import { MODELS, type ModelKey } from './catalog';

const LATIN = /^[\x20-\x7e]+$/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const normal = (text: string): string => text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');

// Whether `name` occurs in `t` (already normal): a Latin name at a word start, a Devanagari one anywhere.
export function hasName(t: string, name: string): boolean {
  const n = normal(name);
  if (!n) return false;
  if (!LATIN.test(n)) return t.includes(n);
  return new RegExp(`(^|[^a-z0-9])${escape(n)}`).test(t);
}

export function modelFits(key: ModelKey, text: string): boolean {
  const t = normal(text);
  return MODELS[key].words.some((w) => hasName(t, w));
}
