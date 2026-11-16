// The hosts a kept picture may come from, and the page host of its credit (visual-sources.md, 16 Nov 2026). Free of any
// server code, so the phone's bundle can check a stored picture's address. Every adapter in sources.ts returns only an
// address on its own host, and the elaboration block's reader checks it again against this list.
export const PHOTO_HOSTS: Record<string, readonly string[]> = {
  commons: ['upload.wikimedia.org'],
  openverse: ['api.openverse.org'],
  nasa: ['images-assets.nasa.gov'],
  inaturalist: ['inaturalist-open-data.s3.amazonaws.com', 'static.inaturalist.org'],
  wellcome: ['iiif.wellcomecollection.org'],
  pixabay: ['pixabay.com', 'cdn.pixabay.com'],
  pexels: ['images.pexels.com'],
  unsplash: ['images.unsplash.com'],
  smithsonian: ['ids.si.edu'],
  aic: ['www.artic.edu'],
  pubchem: ['pubchem.ncbi.nlm.nih.gov'],
  pdb: ['cdn.rcsb.org'],
  polypizza: ['static.poly.pizza'],
};
export const ALL_PHOTO_HOSTS: ReadonlySet<string> = new Set(Object.values(PHOTO_HOSTS).flat());

// An https address on one of the picture hosts, with no user name, password or port; null otherwise.
export function photoUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 1000) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && ALL_PHOTO_HOSTS.has(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

// The 3D model hosts (a glTF binary the viewer may load) and the structure files for molecules.
export const MODEL_HOSTS: ReadonlySet<string> = new Set(['static.poly.pizza', 'media.sketchfab.com', 'pubchem.ncbi.nlm.nih.gov', 'files.rcsb.org']);
export function modelUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 1000) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && MODEL_HOSTS.has(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}
