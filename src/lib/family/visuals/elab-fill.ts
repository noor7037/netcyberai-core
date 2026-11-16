import type { ElabPic, Elaboration } from '@/lib/family/elaboration';
import { runVisualAnswer, type WithDb } from './limits';
import { cachedVisual, classBand, forgetVisualCache } from './shared-cache';
import { richPic, richSteps, type Rich } from './models3d';
import { searchSources, type Photo } from './sources';

// The server's half of the Elaboration Framework's pictures (founder, 16 Nov 2026): every step gets a real visual. A step
// keeps the open chapter's own authored diagram when it has one; every other step gets a licensed photograph found for
// the step's own search words (the routed sources of sources.ts, the subject deciding the order), and the second step a 3D
// model where 3D teaches better (a molecule, a protein, a solid thing). A card the server drew stays only for a step
// where no source had anything. No label goes on any picture; the credit stays in the pic's data.
//
// v21: every search goes through the shared cache (shared-cache.ts: this server's memory, then content.visual_cache when
// `withDb` is given, by words, subject and class band), so the steps of one answer asking the same words, or many
// children asking at once, spend one search; the whole answer runs under one cap of outside calls (limits.ts). A step
// whose words found nothing that fits keeps its authored diagram or card (never a random photograph).

export type ElabFillOptions = {
  subject: string | null;
  classLevel?: number | null;
  withDb?: WithDb;
  search?: (query: string, subject: string | null) => Promise<Photo | null>;
  // v21: the 3D model or animation of each step from the tutor's English `q3d` terms (models3d.ts).
  rich?: (q3d: readonly string[], keep: readonly boolean[]) => Promise<(Rich | null)[]>;
};

const ALT = ['', 'types', 'everyday', 'activity', 'uses'];

export const forgetElabPhotos = (): void => forgetVisualCache();

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

export function fillElaboration(b: Elaboration, o: ElabFillOptions): Promise<Elaboration> {
  return runVisualAnswer({ withDb: o.withDb }, () => fill(b, o));
}

async function fill(b: Elaboration, o: ElabFillOptions): Promise<Elaboration> {
  const search = o.search ?? ((q, subject) => searchSources(q, { subject }));
  const band = classBand(o.classLevel);
  const cached = (q: string, subject: string | null, s: NonNullable<ElabFillOptions['search']>): Promise<Photo | null> => cachedVisual('photo', q, subject, band, () => s(q, subject));
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
  // v21 3D: the tutor's English term per step (an older block without `q3d` asks with its English topic on step 2 only).
  const rich = await (o.rich ?? richSteps)(b.q3d ?? ['', b.topic?.en ?? '', '', '', ''], b.pics.map((p) => p?.kind === 'diagram')).catch(() => []);
  const pics = b.pics.map((p, i): ElabPic | null => {
    if (rich[i] && p?.kind !== 'diagram') return richPic(rich[i]!, captionOf(texts[i]));
    if (p?.kind === 'diagram') return p;
    const hit = found[i];
    return hit ? photoPic(hit, texts[i]) : p;
  });
  return { ...b, pics };
}
