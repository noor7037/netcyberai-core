import type { ElabModel, ElabPic } from '@/lib/family/elaboration';
import { arr, cachedVisual, getJson, keyOf, rec, wordsOf, type Env, type Fetcher } from './adapter-kit';
import { guarded } from './limits';
import { modelUrl, photoUrl } from './photo-hosts';
import type { Anim } from './anim-source';

// 3D models and animations for the Elaboration Framework's pictures (v21, 16 Nov 2026). The tutor gives one short
// English search term per step (`q3d`, "" for a step that needs none), so this works for an answer in any language: no
// word lists in Hindi or English decide whether a step gets 3D. Every 3D source is asked with the term in turn:
//   PubChem (molecules) and the Protein Data Bank first, only when the term looks like a compound or a protein name;
//   then NASA 3D Resources and the Khronos glTF models (local lists, no request); then Smithsonian 3D, Sketchfab and Poly
//   Pizza (each with its own key) and Poly Haven (keyless).
// A source with no key is skipped (one log line), a failing or late one is skipped, and HTTP 429 pauses it (`guarded`).
// When no source has a model for a step, the repo's own animation set may answer instead. At most two such pictures an
// answer, step 2 first; a step with an authored diagram keeps it. Every adapter is loaded with import() here, on the server.

export type { Env, Fetcher };
export type Model3d = { model: ElabModel; still: string; credit: string; licence: string; page: string; from: string };

const BUDGET_MS = 7000;

// The term names a chemical or a protein (PubChem and the PDB are asked first only then). A term that merely ends like a
// compound ("-ide", "-ose", "-ol"...) is tried with PubChem last, after the text sources, so "satellite" never gets a molecule.
export const MOLECULE = /\b(molecule|compound|chlorophyll|glucose|sucrose|sugar|starch|water molecule|oxygen|carbon dioxide|methane|ethanol|ammonia|benzene|ozone|hydrogen|nitrogen|sodium chloride|common salt|acid|cellulose|vitamin|caffeine|aspirin|calcium carbonate)\b/i;
const CHEM_ENDING = /\b[a-z]{3,}(?:ide|ate|ite|ose|ane|ene|yne|ol)\b/i;
const NOT_ENZYME = /\b(phase|base|case|database|increase|decrease|purchase|release|disease|vase|chase|ease|lease|erase|phrase|showcase|staircase|suitcase|briefcase|crease)\b/i;
export const PROTEIN = /\b(protein|enzyme|haemoglobin|hemoglobin|insulin|dna|rna|antibody|ribosome|rubisco|keratin|collagen)\b/i;
export const proteinLike = (t: string): boolean => PROTEIN.test(t) || (/\b[a-z]{4,}ase\b/i.test(t) && !NOT_ENZYME.test(t));
export const chemLike = (t: string): boolean => MOLECULE.test(t) && !proteinLike(t);
const chemEnding = (t: string): boolean => !chemLike(t) && !proteinLike(t) && t.split(/\s+/).length <= 3 && CHEM_ENDING.test(t);

export async function pubchem3d(term: string, f: Fetcher): Promise<Model3d | null> {
  const word = term.trim().split(/\s+/).slice(0, 3).join(' ');
  const body = rec(await getJson(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(word)}/cids/JSON`, f));
  const cid = Number(arr(rec(body.IdentifierList).CID)[0]);
  if (!Number.isInteger(cid) || cid <= 0) return null;
  const model = modelUrl(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/SDF?record_type=3d`);
  const still = photoUrl(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG?image_size=large`);
  return model && still ? { model: { format: 'sdf', url: model }, still, credit: 'PubChem', licence: 'Public domain', page: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`, from: 'pubchem' } : null;
}

export async function pdb3d(term: string, f: Fetcher): Promise<Model3d | null> {
  const query = { query: { type: 'terminal', service: 'full_text', parameters: { value: term.slice(0, 80) } }, return_type: 'entry', request_options: { paginate: { start: 0, rows: 1 } } };
  const body = rec(await getJson(`https://search.rcsb.org/rcsbsearch/v2/query?json=${encodeURIComponent(JSON.stringify(query))}`, f));
  const id = String(rec(arr(body.result_set)[0]).identifier ?? '');
  if (!/^[0-9][A-Za-z0-9]{3}$/.test(id)) return null;
  const model = modelUrl(`https://files.rcsb.org/download/${id.toUpperCase()}.pdb`);
  const still = photoUrl(`https://cdn.rcsb.org/images/structures/${id.toLowerCase()}_assembly-1.jpeg`);
  return model && still ? { model: { format: 'pdb', url: model }, still, credit: 'RCSB Protein Data Bank', licence: 'CC0 1.0', page: `https://www.rcsb.org/structure/${id.toUpperCase()}`, from: 'pdb' } : null;
}

// One 3D source: its id (the SOURCES row and the `guarded` counter), the key it needs, and how it is asked.
export type Source3d = { id: string; key?: string | string[]; when?: (term: string) => boolean; run: (term: string, f: Fetcher, key: string) => Promise<Model3d | null> };
export const MODEL_SOURCES: readonly Source3d[] = [
  { id: 'pdb', when: proteinLike, run: (t, f) => pdb3d(t, f) },
  { id: 'pubchem', when: chemLike, run: (t, f) => pubchem3d(t, f) },
  { id: 'nasa3d', run: async (t) => (await import('./model-nasa3d')).nasa3d(t) },
  { id: 'khronos', run: async (t) => (await import('./model-khronos')).khronos3d(t) },
  { id: 'smithsonian3d', key: ['SMITHSONIAN_API_KEY', 'DATA_GOV_API_KEY'], run: async (t, f, k) => (await import('./model-smithsonian3d')).smithsonian3d(t, f, k) },
  { id: 'sketchfab', key: 'SKETCHFAB_TOKEN', run: async (t, f, k) => (await import('./model-sketchfab')).sketchfab3d(t, {}, f, k) },
  { id: 'polypizza', key: 'POLY_PIZZA_API_KEY', run: async (t, f, k) => (await import('./model-polypizza')).polyPizza3d(t, f, k) },
  { id: 'polyhaven', run: async (t, f) => (await import('./model-polyhaven')).polyHaven3d(t, f) },
  { id: 'pubchem', when: chemEnding, run: (t, f) => pubchem3d(t, f) },
];

const keyFor = (s: Source3d, env: Env): string | null => {
  if (!s.key) return '';
  const names = Array.isArray(s.key) ? s.key : [s.key];
  for (const n of names) if (env[n]) return env[n]!;
  return keyOf(s.id, names.join(' or '), env);
};

// The 3D model for one English term, or null. An empty term returns at once, with no request.
export async function find3d(term: string, env: Env = process.env as Env, f: Fetcher = fetch, sources: readonly Source3d[] = MODEL_SOURCES): Promise<Model3d | null> {
  const t = (term ?? '').trim().slice(0, 80);
  if (!wordsOf(t).length) return null;
  return cachedVisual('model3d', t, null, null, async () => {
    const until = Date.now() + BUDGET_MS;
    for (const s of sources) {
      if (Date.now() > until) break;
      if (s.when && !s.when(t)) continue;
      const key = keyFor(s, env);
      if (key === null) continue;
      const m = await guarded(s.id, () => s.run(t, f, key));
      if (m) return m;
    }
    return null;
  });
}

export async function findAnim(term: string): Promise<Anim | null> {
  return wordsOf(term ?? '').length ? (await import('./anim-source')).findAnimation(term) : null;
}

export type Rich = { kind: 'model3d'; m: Model3d } | { kind: 'animation'; a: Anim };
export const MAX_RICH = 2;
const ORDER = [1, 0, 2, 3, 4];

// The 3D model or animation of each step (null for most): step 2 first, then the others, at most MAX_RICH, never on a
// step that keeps an authored diagram (`keep`).
export async function richSteps(q3d: readonly string[], keep: readonly boolean[], o: { find?: (t: string) => Promise<Model3d | null>; anim?: (t: string) => Promise<Anim | null> } = {}): Promise<(Rich | null)[]> {
  const find = o.find ?? ((t: string) => find3d(t));
  const anim = o.anim ?? findAnim;
  const out: (Rich | null)[] = q3d.map(() => null);
  let n = 0;
  for (const i of ORDER) {
    if (n >= MAX_RICH) break;
    const t = (q3d[i] ?? '').trim();
    if (!t || keep[i]) continue;
    const m = await find(t).catch(() => null);
    const a = m ? null : await anim(t).catch(() => null);
    out[i] = m ? { kind: 'model3d', m } : a ? { kind: 'animation', a } : null;
    if (out[i]) n++;
  }
  return out;
}

// A step's picture from its 3D model or animation (the caption is the step's own).
export function richPic(r: Rich, caption: string): ElabPic {
  if (r.kind === 'model3d') return { svg: '', kind: 'model3d', url: r.m.still, caption, credit: r.m.credit, licence: r.m.licence, source: r.m.page, from: r.m.from, model: r.m.model };
  return { svg: '', kind: 'animation', url: r.a.url, caption, credit: r.a.credit, licence: r.a.licence, from: 'anim' };
}
