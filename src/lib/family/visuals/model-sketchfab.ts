import { NOT_FOR_CHILDREN } from './commons';
import { arr, covers, freeLicence, getJson, rec, str, type Env, type Fetcher } from './adapter-kit';
import { modelUrl, photoUrl } from './photo-hosts';
import type { Model3d } from './models3d';

// Sketchfab (SKETCHFAB_TOKEN). The search is open; the glTF binary needs the token (Download API). Only models that are
// downloadable, not age-restricted, with a free licence (CC0, CC BY, CC BY-SA: never NC or ND), whose name or tags hold
// every word of the term and nothing in NOT_FOR_CHILDREN. Staff picks are asked first. The download address Sketchfab
// gives is signed and short-lived: the still picture (media.sketchfab.com) stays when it has expired.
export async function sketchfab3d(term: string, env: Env, f: Fetcher, token: string): Promise<Model3d | null> {
  void env;
  const q = encodeURIComponent(term.slice(0, 60));
  const body = rec(await getJson(`https://api.sketchfab.com/v3/search?type=models&q=${q}&downloadable=true&archives_flavours=false&sort_by=-likeCount&count=24`, f));
  const picks = arr(body.results).map(rec).sort((a, b) => Number(!!b.staffpickedAt) - Number(!!a.staffpickedAt));
  let asked = 0;
  for (const r of picks) {
    const uid = str(r.uid, 40);
    const licence = freeLicence(rec(r.license).label ?? rec(r.license).slug);
    const tags = arr(r.tags).map((t) => String(rec(t).name ?? '')).join(' ');
    const name = String(r.name ?? '');
    if (!uid || !/^[a-f0-9]{32}$/.test(uid) || !licence || r.isDownloadable !== true || r.isAgeRestricted === true) continue;
    if (!covers(term, `${name} ${tags}`) || NOT_FOR_CHILDREN.test(`${name} ${tags} ${r.description ?? ''}`)) continue;
    const thumbs = arr(rec(r.thumbnails).images).map(rec).sort((a, b) => Math.abs(Number(a.width) - 640) - Math.abs(Number(b.width) - 640));
    const still = photoUrl(thumbs[0]?.url);
    if (!still) continue;
    if (++asked > 3) break;
    const dl = rec(await getJson(`https://api.sketchfab.com/v3/models/${uid}/download`, f, { Authorization: `Token ${token}` }));
    const glb = rec(dl.glb);
    const model = modelUrl(glb.url);
    if (!model || Number(glb.size) > 15_000_000) continue;
    return { model: { format: 'glb', url: model }, still, credit: str(rec(r.user).displayName, 60) ?? 'Sketchfab', licence, page: `https://sketchfab.com/3d-models/${uid}`, from: 'sketchfab' };
  }
  return null;
}
