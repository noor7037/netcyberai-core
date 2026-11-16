import type { CommonsPhoto } from './commons';
import { NOT_FOR_CHILDREN } from './commons';
import { arr, getJson, rec, str, type Fetcher } from './adapter-kit';
import { photoUrl } from './photo-hosts';

// The Met Museum (keyless). Its /public/collection/v1/search was retired on 1 Oct 2026 (it now answers 410 and names the
// replacement); /public/collection/v1.1/search is paginated with offset and limit and ignores isPublicDomain, so each of
// the first few objects is read and kept only when isPublicDomain is true (Open Access, CC0).
const API = 'https://collectionapi.metmuseum.org/public/collection';

export async function metPhoto(q: string, f: Fetcher): Promise<CommonsPhoto | null> {
  const body = rec(await getJson(`${API}/v1.1/search?q=${encodeURIComponent(q.slice(0, 100))}&hasImages=true&isPublicDomain=true&offset=0&limit=6`, f));
  for (const id of arr(body.objectIDs).slice(0, 4)) {
    if (!Number.isInteger(id)) continue;
    const o = rec(await getJson(`${API}/v1/objects/${id}`, f));
    const url = photoUrl(o.primaryImageSmall);
    const title = `${o.title ?? ''} ${o.objectName ?? ''}`;
    if (o.isPublicDomain !== true || !url || NOT_FOR_CHILDREN.test(title)) continue;
    return { url, pageUrl: `https://www.metmuseum.org/art/collection/search/${id}`, author: str(o.artistDisplayName, 80) ?? 'The Met', licence: 'CC0 1.0', licenceUrl: null };
  }
  return null;
}
