import type { CommonsPhoto } from './commons';
import { NOT_FOR_CHILDREN } from './commons';
import { arr, getJson, rec, str, type Fetcher } from './adapter-kit';
import { photoUrl } from './photo-hosts';

// Cleveland Museum of Art Open Access (keyless): CC0 works with an image only (cc0=1, share_license_status checked again).
export async function clevelandPhoto(q: string, f: Fetcher): Promise<CommonsPhoto | null> {
  const body = rec(await getJson(`https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(q.slice(0, 100))}&cc0=1&has_image=1&limit=8`, f));
  for (const a of arr(body.data).map(rec)) {
    const url = photoUrl(rec(rec(a.images).web).url);
    const title = String(a.title ?? '');
    const page = typeof a.url === 'string' && /^https:\/\/(www\.)?clevelandart\.org\//.test(a.url) ? a.url : null;
    if (a.share_license_status !== 'CC0' || !url || !page || NOT_FOR_CHILDREN.test(`${title} ${a.description ?? ''}`)) continue;
    const creator = rec(arr(a.creators)[0]);
    return { url, pageUrl: page, author: str(creator.description, 80) ?? 'Cleveland Museum of Art', licence: 'CC0 1.0', licenceUrl: null };
  }
  return null;
}
