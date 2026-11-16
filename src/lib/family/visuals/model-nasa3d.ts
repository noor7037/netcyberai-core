import { covers } from './adapter-kit';
import { modelUrl, photoUrl } from './photo-hosts';
import type { Model3d } from './models3d';
import INDEX from './data/nasa3d.json';

// NASA 3D Resources (science.nasa.gov/3d-resources; nasa3d.arc.nasa.gov now redirects there). There is no search API, so
// data/nasa3d.json lists the models once (title, glTF binary, still picture on assets.science.nasa.gov; 95 models under
// 8 MB whose files sit in their own folder). Public domain. Keyless and local: no request at answer time.
type Row = { id: string; title: string; glb: string; still: string };

export function nasa3d(term: string): Model3d | null {
  for (const r of INDEX as Row[]) {
    if (!covers(term, r.title)) continue;
    const model = modelUrl(r.glb);
    const still = photoUrl(r.still);
    if (model && still) return { model: { format: 'glb', url: model }, still, credit: 'NASA', licence: 'Public domain', page: `https://science.nasa.gov/3d-resources/${r.id}/`, from: 'nasa3d' };
  }
  return null;
}
