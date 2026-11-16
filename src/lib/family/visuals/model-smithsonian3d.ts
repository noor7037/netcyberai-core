import { NOT_FOR_CHILDREN } from './commons';
import { arr, covers, getJson, rec, str, type Fetcher } from './adapter-kit';
import { modelUrl, photoUrl } from './photo-hosts';
import type { Model3d } from './models3d';

// Smithsonian 3D (3d.si.edu) through the Open Access API (api.data.gov key: SMITHSONIAN_API_KEY or DATA_GOV_API_KEY):
// records with online_media_type "3D Models", a 3d_voyager media item whose usage is CC0, and its Draco-compressed
// glTF binary (about 2 MB; the viewer decodes Draco from /draco/). The keyless 3d-api.si.edu file search has no licence
// field, so it is not used.
export async function smithsonian3d(term: string, f: Fetcher, key: string): Promise<Model3d | null> {
  const q = encodeURIComponent(`${term.slice(0, 60)} AND online_media_type:"3D Models"`);
  const body = rec(rec(await getJson(`https://api.si.edu/openaccess/api/v1.0/search?q=${q}&rows=10&api_key=${encodeURIComponent(key)}`, f)).response);
  for (const row of arr(body.rows).map(rec)) {
    const dn = rec(rec(row.content).descriptiveNonRepeating);
    const title = str(rec(dn.title).content, 200) ?? '';
    if (!covers(term, title) || NOT_FOR_CHILDREN.test(title)) continue;
    const media = arr(rec(dn.online_media).media).map(rec).find((m) => m.type === '3d_voyager' && rec(m.usage).access === 'CC0');
    if (!media) continue;
    const files = arr(media.resources).map((x) => String(rec(x).url ?? ''));
    const model = modelUrl(files.find((u) => /_draco\.glb$/i.test(u)) ?? files.find((u) => /-100k-2048_std\.glb$/i.test(u)));
    const still = photoUrl(media.thumbnail);
    if (!model || !still) continue;
    const page = typeof dn.record_link === 'string' && /^https?:\/\/[^/]*si\.edu\//.test(dn.record_link) ? dn.record_link.replace(/^http:/, 'https:') : 'https://3d.si.edu';
    return { model: { format: 'glb', url: model }, still, credit: str(dn.data_source, 80) ?? 'Smithsonian', licence: 'CC0 1.0', page, from: 'smithsonian3d' };
  }
  return null;
}
