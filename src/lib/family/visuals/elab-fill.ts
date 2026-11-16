import type { ElabPic, Elaboration } from '@/lib/family/elaboration';
import { find3d, type Model3d } from './models3d';
import { searchSources, type Photo } from './sources';

// The server's half of the Elaboration Framework's pictures (founder, 16 Nov 2026): every step gets a real visual. A step
// keeps the open chapter's own authored diagram when it has one; every other step gets a licensed photograph found for
// the step's own search words (the routed sources of sources.ts, the subject deciding the order), and the second step a 3D
// model where 3D teaches better (a molecule, a protein, a solid thing). A card the server drew stays only for a step
// where no source had anything. No label goes on any picture; the credit stays in the pic's data.

export type ElabFillOptions = {
  subject: string | null;
  search?: (query: string, subject: string | null) => Promise<Photo | null>;
  model?: (words: string, term: string) => Promise<Model3d | null>;
};

const ALT = ['', 'types', 'everyday', 'activity', 'uses'];
const HIT_MS = 24 * 60 * 60 * 1000;
const MISS_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; photo: Photo | null }>();

const cached = async (q: string, subject: string | null, search: NonNullable<ElabFillOptions['search']>): Promise<Photo | null> => {
  const key = `${subject ?? ''}|${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (hit.photo ? HIT_MS : MISS_MS)) return hit.photo;
  const photo = await search(q, subject).catch(() => null);
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), photo });
  return photo;
};
export const forgetElabPhotos = (): void => cache.clear();

// A caption is the step's first sentences up to 240 characters, whole: a long step (a process or a why answer) is never cut mid-word.
export const captionOf = (text: string): string => {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= 240) return t;
  const parts = t.match(/[^.!?।]+[.!?।]+/g) ?? [];
  let out = '';
  for (const s of parts) if ((out + s).trim().length <= 240) out = `${out}${s}`;
  return (out.trim() || t.slice(0, 240).trimEnd());
};
const photoPic = (p: Photo, caption: string): ElabPic => ({ svg: '', kind: 'photo', url: p.url, caption: captionOf(caption), credit: p.author, licence: p.licence, source: p.pageUrl, from: p.source });

export async function fillElaboration(b: Elaboration, o: ElabFillOptions): Promise<Elaboration> {
  const search = o.search ?? ((q, subject) => searchSources(q, { subject }));
  const texts = [b.definition.text, b.levels.basic, b.real_life.text, b.try_it.question, b.future.text];
  // The step's own words first, then the English topic (the tutor named it), then the term: a source with nothing for one form is asked with the next.
  const topicQ = (b.topic?.en ?? b.term).trim();
  const queryOf = (i: number) => (b.queries[i] || b.topic?.en || b.term).trim();
  const found = await Promise.all(b.pics.map((p, i) => (p?.kind === 'diagram' ? Promise.resolve(null) : cached(queryOf(i), o.subject, search).then((hit) => hit ?? (queryOf(i) !== topicQ ? cached(topicQ, o.subject, search) : null)).then((hit) => hit ?? (topicQ !== b.term ? cached(b.term, o.subject, search) : null)))));
  // No picture twice: a step that found a photograph an earlier step already shows looks again with its own angle.
  const seen = new Set<string>();
  for (let i = 0; i < found.length; i++) {
    let p = found[i];
    if (p && seen.has(p.url)) p = (await cached(`${topicQ} ${ALT[i]}`.trim(), o.subject, search)) ?? null;
    if (p && !seen.has(p.url)) seen.add(p.url);
    else p = null;
    found[i] = p;
  }
  const three = await (o.model ?? ((w, t) => find3d(w, t)))(`${b.levels.basic} ${b.levels.intermediate} ${queryOf(1)}`, topicQ).catch(() => null);
  const pics = b.pics.map((p, i): ElabPic | null => {
    if (i === 1 && three && p?.kind !== 'diagram') return { svg: '', kind: 'model3d', url: three.still, caption: captionOf(texts[i]), credit: three.credit, licence: three.licence, source: three.page, from: three.from, model: three.model };
    if (p?.kind === 'diagram') return p;
    const hit = found[i];
    return hit ? photoPic(hit, texts[i]) : p;
  });
  return { ...b, pics };
}
