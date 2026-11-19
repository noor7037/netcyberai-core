import { covers } from './adapter-kit';
import { modelUrl, photoUrl } from './photo-hosts';
import type { Model3d } from './models3d';

// Khronos glTF models (github.com/KhronosGroup/glTF-Sample-Assets): a small curated set with a free licence that
// a child may meet in a lesson, referenced at their stable raw addresses (not copied: the set is 0.2 to 5.8 MB a model).
// Licences read from each model's metadata.json on 16 Nov 2026. Matched locally by tags.
const BASE = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/';
export const KHRONOS: readonly { name: string; tags: string; licence: string; credit: string }[] = [
  { name: 'Fox', tags: 'fox animal wild animal mammal', licence: 'CC BY 4.0', credit: 'PixelMannen, tomkranis' },
  { name: 'GlassVaseFlowers', tags: 'flower flowers vase', licence: 'CC0 1.0', credit: 'Eric Chadwick, Rico Cilliers' },
  { name: 'DiffuseTransmissionPlant', tags: 'plant leaf leaves house plant potted plant', licence: 'CC BY 4.0', credit: 'Eric Chadwick, Rico Cilliers' },
  { name: 'ToyCar', tags: 'toy car toy vehicle', licence: 'CC0 1.0', credit: 'Guido Odendahl, Eric Chadwick' },
  { name: 'SheenChair', tags: 'chair furniture', licence: 'CC0 1.0', credit: 'Eric Chadwick' },
];

export function khronos3d(term: string): Model3d | null {
  const m = KHRONOS.find((k) => covers(term, k.tags));
  if (!m) return null;
  const model = modelUrl(`${BASE}${m.name}/glTF-Binary/${m.name}.glb`);
  const still = photoUrl(`${BASE}${m.name}/screenshot/screenshot.jpg`);
  return model && still ? { model: { format: 'glb', url: model }, still, credit: m.credit, licence: m.licence, page: `https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/${m.name}`, from: 'khronos' } : null;
}
