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
  // v21 sources (models3d.ts and the adapters beside it): the still picture of a 3D model, and the new picture sources.
  sketchfab: ['media.sketchfab.com'],
  nasa3d: ['assets.science.nasa.gov'],
  smithsonian3d: ['3d-api.si.edu'],
  polyhaven: ['cdn.polyhaven.com'],
  khronos: ['raw.githubusercontent.com'],
  met: ['images.metmuseum.org'],
  cleveland: ['openaccess-cdn.clevelandart.org'],
  iconify: ['api.iconify.design'],
  earthobs: ['assets.science.nasa.gov'],
};
// A host shared by many owners is kept to one owner's path (raw.githubusercontent.com: the Khronos glTF samples only).
export const HOST_PATH: Record<string, string> = { 'raw.githubusercontent.com': '/KhronosGroup/glTF-Sample-Assets/' };
const pathOk = (u: URL): boolean => !HOST_PATH[u.hostname] || u.pathname.startsWith(HOST_PATH[u.hostname]);
export const ALL_PHOTO_HOSTS: ReadonlySet<string> = new Set(Object.values(PHOTO_HOSTS).flat());

// An https address on one of the picture hosts, with no user name, password or port; null otherwise.
export function photoUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 1000) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && ALL_PHOTO_HOSTS.has(u.hostname) && pathOk(u) ? u.toString() : null;
  } catch {
    return null;
  }
}

// The 3D model hosts (a glTF binary the viewer may load) and the structure files for molecules.
// v21: Sketchfab's signed download host, NASA 3D Resources, Smithsonian 3D, Poly Haven and the Khronos glTF samples.
export const MODEL_HOSTS: ReadonlySet<string> = new Set(['static.poly.pizza', 'media.sketchfab.com', 'sketchfab-prod-media.s3.amazonaws.com', 'pubchem.ncbi.nlm.nih.gov', 'files.rcsb.org', 'assets.science.nasa.gov', '3d-api.si.edu', 'dl.polyhaven.org', 'raw.githubusercontent.com']);
export function modelUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 1000) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && MODEL_HOSTS.has(u.hostname) && pathOk(u) ? u.toString() : null;
  } catch {
    return null;
  }
}
