import type { CommonsPhoto } from './commons';
import { NOT_FOR_CHILDREN } from './commons';
import { arr, covers, getJson, rec, type Fetcher } from './adapter-kit';
import { photoUrl } from './photo-hosts';

// NASA Earth Observatory (keyless; now on science.nasa.gov): its image-of-the-day posts through the site's WordPress API,
// with the featured picture embedded; the post's title must hold every word of the query (the site search is full
// text). Public domain; a caption naming a copyright or a "courtesy" owner is skipped.
export async function earthObsPhoto(q: string, f: Fetcher): Promise<CommonsPhoto | null> {
  const list = arr(await getJson(`https://science.nasa.gov/wp-json/wp/v2/posts?search=${encodeURIComponent(q.slice(0, 80))}&per_page=10&_fields=link,title,_links,_embedded&_embed=wp:featuredmedia`, f)).map(rec);
  for (const p of list) {
    const link = typeof p.link === 'string' && p.link.startsWith('https://science.nasa.gov/earth/earth-observatory/') ? p.link : null;
    const m = rec(arr(rec(p._embedded)['wp:featuredmedia'])[0]);
    const url = photoUrl(m.source_url);
    const words = `${rec(p.title).rendered ?? ''} ${rec(m.caption).rendered ?? ''}`;
    if (!link || !url || !covers(q, String(rec(p.title).rendered ?? '')) || !/\/assets\/science\/esd\/eo\//.test(url) || NOT_FOR_CHILDREN.test(words) || /copyright|courtesy|©/i.test(words)) continue;
    return { url, pageUrl: link, author: 'NASA Earth Observatory', licence: 'Public domain', licenceUrl: null };
  }
  return null;
}
