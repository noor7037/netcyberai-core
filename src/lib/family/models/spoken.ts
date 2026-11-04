// The part a spoken sentence names (W19-D voice sync): as the tutor's voice says "the cerebellum keeps us balanced", the
// model highlights the cerebellum. Pure. The part whose label or other name (./catalog.ts `also`) appears in the
// sentence; the longest name wins ("right atrium" over "atrium", "inner core" over "core"). Names in the child's
// language first, then the other language's (a Hindi answer may write "Cornea" in English).

import { MODELS, type ModelKey, type ModelLang } from './catalog';
import { hasName, normal } from './fit';

export function partSpokenIn(modelKey: ModelKey, sentence: string | null | undefined, lang: ModelLang): string | null {
  if (!sentence) return null;
  const t = normal(sentence);
  const other: ModelLang = lang === 'hi' ? 'en' : 'hi';
  const pick = (names: (part: (typeof MODELS)[ModelKey]['parts'][number]) => readonly string[]): string | null => {
    let best: { key: string; length: number } | null = null;
    for (const part of MODELS[modelKey].parts) {
      for (const name of names(part)) {
        if (hasName(t, name) && (!best || name.length > best.length)) best = { key: part.key, length: name.length };
      }
    }
    return best?.key ?? null;
  };
  const latin = (s: string) => /^[\x20-\x7e]+$/.test(s);
  // The child's language: its label, and the other names written in its script.
  const own = pick((part) => [part[lang], ...(part.also ?? []).filter((a) => latin(a) === (lang === 'en'))]);
  if (own) return own;
  return pick((part) => [part[other], ...(part.also ?? []).filter((a) => latin(a) === (other === 'en'))]);
}
