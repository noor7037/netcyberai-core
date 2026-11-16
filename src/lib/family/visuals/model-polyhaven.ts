import { NOT_FOR_CHILDREN } from './commons';
import { arr, covers, getJson, rec, str, type Fetcher } from './adapter-kit';
import { modelUrl, photoUrl } from './photo-hosts';
import type { Model3d } from './models3d';

// Poly Haven (api.polyhaven.com, keyless): every asset is CC0. The list of about 500 models is asked once a day and
// matched here by name, tags and categories; the 1k glTF (its .bin and textures beside it on dl.polyhaven.org, which the
// viewer maps) is the model and the CDN thumbnail the still.
type Asset = { id: string; text: string; author: string };
let list: { at: number; rows: Asset[] } | null = null;
const DAY = 24 * 60 * 60 * 1000;
export const forgetPolyHaven = (): void => {
  list = null;
};

async function models(f: Fetcher): Promise<Asset[]> {
  if (list && Date.now() - list.at < DAY) return list.rows;
  const body = rec(await getJson('https://api.polyhaven.com/assets?t=models', f));
  const rows = Object.entries(body).map(([id, v]) => {
    const a = rec(v);
    return { id, text: `${a.name ?? ''} ${arr(a.tags).join(' ')} ${arr(a.categories).join(' ')}`, author: Object.keys(rec(a.authors))[0] ?? 'Poly Haven' };
  }).filter((a) => /^[A-Za-z0-9_]+$/.test(a.id));
  list = { at: Date.now(), rows };
  return rows;
}

export async function polyHaven3d(term: string, f: Fetcher): Promise<Model3d | null> {
  const hit = (await models(f)).find((a) => covers(term, a.text) && !NOT_FOR_CHILDREN.test(a.text));
  if (!hit) return null;
  const files = rec(await getJson(`https://api.polyhaven.com/files/${hit.id}`, f));
  const model = modelUrl(rec(rec(rec(files.gltf)['1k']).gltf).url);
  const still = photoUrl(`https://cdn.polyhaven.com/asset_img/thumbs/${hit.id}.png?width=640`);
  if (!model || !still) return null;
  return { model: { format: 'glb', url: model }, still, credit: str(hit.author, 60) ?? 'Poly Haven', licence: 'CC0 1.0', page: `https://polyhaven.com/a/${hit.id}`, from: 'polyhaven' };
}
