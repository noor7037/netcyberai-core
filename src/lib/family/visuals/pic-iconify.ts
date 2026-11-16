import type { CommonsPhoto } from './commons';
import { arr, covers, getJson, rec, type Fetcher } from './adapter-kit';
import { photoUrl } from './photo-hosts';

// Iconify (keyless): colour emoji-style pictures for the youngest classes, from three sets only, each with a licence free
// for commercial use (read from api.iconify.design/collections on 16 Nov 2026). The icon's own name must hold every word.
export const ICON_SETS: Record<string, { licence: string; author: string }> = {
  noto: { licence: 'Apache 2.0', author: 'Google Noto Emoji' },
  'fluent-emoji-flat': { licence: 'MIT', author: 'Microsoft Fluent Emoji' },
  twemoji: { licence: 'CC BY 4.0', author: 'Twitter Emoji' },
};

export async function iconifyPicture(q: string, f: Fetcher): Promise<CommonsPhoto | null> {
  const body = rec(await getJson(`https://api.iconify.design/search?query=${encodeURIComponent(q.slice(0, 60))}&prefixes=${Object.keys(ICON_SETS).join(',')}&limit=32`, f));
  for (const name of arr(body.icons)) {
    const [set, icon] = String(name).split(':');
    if (!ICON_SETS[set] || !icon || !/^[a-z0-9-]{1,60}$/.test(icon) || !covers(q, icon.replace(/-/g, ' '))) continue;
    const url = photoUrl(`https://api.iconify.design/${set}/${icon}.svg?width=480`);
    if (url) return { url, pageUrl: `https://icon-sets.iconify.design/${set}/${icon}/`, author: ICON_SETS[set].author, licence: ICON_SETS[set].licence, licenceUrl: null };
  }
  return null;
}
