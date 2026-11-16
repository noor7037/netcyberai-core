import type { ElabModel } from '@/lib/family/elaboration';
import { NOT_FOR_CHILDREN } from './commons';
import { modelUrl, photoUrl } from './photo-hosts';
import type { Env, Fetcher } from './sources';

// 3D models for the Elaboration Framework's pictures (founder, 16 Nov 2026), used only where 3D teaches better than a
// photograph: a molecule (PubChem 3D), a protein (RCSB Protein Data Bank), a solid object (Poly Pizza, CC0 and CC BY, with
// a free key). The server asks, checks every address against the model hosts (photo-hosts.ts) and keeps a still picture
// beside the model for Data saver and weak phones. NASA 3D and Smithsonian 3D are bulk sources (a script downloads them
// once; there is no live API); Sketchfab's download is a zip of glTF files the lazy viewer cannot open, so it is not asked
// live. A source with no key, no answer or a bad answer is skipped without a word.

export type Model3d = { model: ElabModel; still: string; credit: string; licence: string; page: string; from: string };

const TIMEOUT_MS = 4000;
const UA = 'NetCyberAI-Family/1.0 (3D lookup, server side)';
const get = async (url: string, f: Fetcher, init: RequestInit = {}): Promise<unknown> => {
  const res = await f(url, { ...init, headers: { accept: 'application/json', 'User-Agent': UA, ...(init.headers as Record<string, string> | undefined) }, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// Which 3D source, if any, the words are about: a molecule or compound, a protein, or a solid thing.
export const MOLECULE = /\b(molecule|compound|chlorophyll|glucose|sugar|starch|water|oxygen|carbon dioxide|methane|ethanol|ammonia|benzene|atom|ozone|hydrogen|nitrogen|salt|acid|cellulose|vitamin|caffeine)\b/i;
export const PROTEIN = /\b(protein|enzyme|haemoglobin|hemoglobin|insulin|dna|rna|antibody|ribosome|rubisco)\b/i;
export const SOLID = /\b(volcano|pyramid|skeleton|skull|heart|brain|dinosaur|telescope|satellite|rocket|tree|flower|plant|leaf|cell|bridge|dam|temple|fort|globe|magnet|motor|engine|pendulum)\b/i;
export const kindOf = (words: string): 'molecule' | 'protein' | 'solid' | null => (PROTEIN.test(words) ? 'protein' : MOLECULE.test(words) ? 'molecule' : SOLID.test(words) ? 'solid' : null);

export async function pubchem3d(term: string, f: Fetcher): Promise<Model3d | null> {
  const word = term.trim().split(/\s+/).slice(0, 3).join(' ');
  const body = rec(await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(word)}/cids/JSON`, f));
  const cid = Number(arr(rec(body.IdentifierList).CID)[0]);
  if (!Number.isInteger(cid) || cid <= 0) return null;
  const model = modelUrl(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/SDF?record_type=3d`);
  const still = photoUrl(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG?image_size=large`);
  return model && still ? { model: { format: 'sdf', url: model }, still, credit: 'PubChem', licence: 'Public domain', page: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`, from: 'pubchem' } : null;
}

export async function pdb3d(term: string, f: Fetcher): Promise<Model3d | null> {
  const query = { query: { type: 'terminal', service: 'full_text', parameters: { value: term.slice(0, 80) } }, return_type: 'entry', request_options: { paginate: { start: 0, rows: 1 } } };
  const body = rec(await get(`https://search.rcsb.org/rcsbsearch/v2/query?json=${encodeURIComponent(JSON.stringify(query))}`, f));
  const id = String(rec(arr(body.result_set)[0]).identifier ?? '');
  if (!/^[0-9][A-Za-z0-9]{3}$/.test(id)) return null;
  const model = modelUrl(`https://files.rcsb.org/download/${id.toUpperCase()}.pdb`);
  const still = photoUrl(`https://cdn.rcsb.org/images/structures/${id.toLowerCase()}_assembly-1.jpeg`);
  return model && still ? { model: { format: 'pdb', url: model }, still, credit: 'RCSB Protein Data Bank', licence: 'CC0 1.0', page: `https://www.rcsb.org/structure/${id.toUpperCase()}`, from: 'pdb' } : null;
}

export async function polyPizza3d(term: string, env: Env, f: Fetcher): Promise<Model3d | null> {
  const key = env.POLY_PIZZA_API_KEY;
  if (!key) return null;
  const body = rec(await get(`https://api.poly.pizza/v1.1/search/${encodeURIComponent(term.slice(0, 60))}?Limit=10`, f, { headers: { 'x-auth-token': key } }));
  for (const r of arr(body.results).map(rec)) {
    const licence = /cc0|public domain/i.test(String(r.Licence ?? '')) ? 'CC0 1.0' : /cc-?by(?!-nc)/i.test(String(r.Licence ?? '')) && !/nc|nd/i.test(String(r.Licence)) ? 'CC BY 3.0' : null;
    const model = modelUrl(r.Download);
    const still = photoUrl(r.Thumbnail);
    const author = String(rec(r.Creator).Username ?? '').slice(0, 60);
    if (!licence || !model || !still || !/\.glb(\?|$)/i.test(model) || NOT_FOR_CHILDREN.test(String(r.Title ?? ''))) continue;
    return { model: { format: 'glb', url: model }, still, credit: author || 'Poly Pizza', licence, page: `https://poly.pizza/m/${encodeURIComponent(String(r.ID ?? ''))}`, from: 'polypizza' };
  }
  return null;
}

// The 3D model for a step, or null: only where the words are about a molecule, a protein or a solid thing.
export async function find3d(words: string, term: string, env: Env = process.env as Env, f: Fetcher = fetch): Promise<Model3d | null> {
  const kind = kindOf(`${words} ${term}`);
  if (!kind) return null;
  const tries: (() => Promise<Model3d | null>)[] = kind === 'molecule' ? [() => pubchem3d(term, f)] : kind === 'protein' ? [() => pdb3d(term, f)] : [() => polyPizza3d(term, env, f)];
  for (const t of tries) {
    const m = await t().catch(() => null);
    if (m) return m;
  }
  return null;
}
