import { covers, wordsOf } from './adapter-kit';
import INDEX from '../../../../public/anim/index.json';

// The animation source (v21): our own small SVG animations in public/anim (CSS motion that stops under reduced motion),
// listed in public/anim/index.json with English tags. LottieFiles has no public key and is never called. An English
// term picks the file whose title or a tag holds every word of it; among several, the one with the fewest extra words
// (the closest tag) wins. Local, keyless, no request.
export type AnimRow = { id: string; title: string; tags: string[]; licence: string; credit: string; source: string | null; file: string };
export type Anim = { url: string; title: string; licence: string; credit: string; id: string };
export const ANIM_INDEX = INDEX as AnimRow[];

export function findAnimation(term: string, index: readonly AnimRow[] = ANIM_INDEX): Anim | null {
  if (!wordsOf(term).length) return null;
  let best: { r: AnimRow; extra: number } | null = null;
  for (const r of index) {
    if (!/^[a-z0-9-]+\.svg$/.test(r.file)) continue;
    for (const t of [...r.tags, r.title]) {
      if (!covers(term, t)) continue;
      const extra = wordsOf(t).length - wordsOf(term).length;
      if (!best || extra < best.extra) best = { r, extra };
    }
  }
  return best ? { url: `/anim/${best.r.file}`, title: best.r.title, licence: best.r.licence, credit: best.r.credit, id: best.r.id } : null;
}
