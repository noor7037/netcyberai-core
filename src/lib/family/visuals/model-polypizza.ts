import { NOT_FOR_CHILDREN } from './commons';
import { arr, covers, freeLicence, getJson, rec, str, type Fetcher } from './adapter-kit';
import { modelUrl, photoUrl } from './photo-hosts';
import type { Model3d } from './models3d';

// Poly Pizza (POLY_PIZZA_API_KEY): low-poly models, CC0 or CC BY only, as a glTF binary on static.poly.pizza. The title
// must hold every word of the term.
export async function polyPizza3d(term: string, f: Fetcher, key: string): Promise<Model3d | null> {
  const body = rec(await getJson(`https://api.poly.pizza/v1.1/search/${encodeURIComponent(term.slice(0, 60))}?Limit=10`, f, { 'x-auth-token': key }));
  for (const r of arr(body.results).map(rec)) {
    const licence = freeLicence(r.Licence);
    const model = modelUrl(r.Download);
    const still = photoUrl(r.Thumbnail);
    const title = String(r.Title ?? '');
    if (!licence || !model || !still || !/\.glb(\?|$)/i.test(model) || !covers(term, `${title} ${arr(r.Tags).join(' ')}`) || NOT_FOR_CHILDREN.test(title)) continue;
    return { model: { format: 'glb', url: model }, still, credit: str(rec(r.Creator).Username, 60) ?? 'Poly Pizza', licence, page: `https://poly.pizza/m/${encodeURIComponent(String(r.ID ?? ''))}`, from: 'polypizza' };
  }
  return null;
}
