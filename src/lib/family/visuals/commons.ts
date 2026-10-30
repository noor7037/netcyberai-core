import { PHOTO_HOST, PHOTO_LICENCE, PHOTO_PAGE_HOST, plain } from '@/lib/family/blocks';

// Licensed photographs from Wikimedia Commons (W9-C, docs/39 §3). The server, never the phone, asks Commons' search for
// the model's words and keeps only a file whose licence is CC0, CC BY, CC BY-SA (any version) or public domain, with an
// author to credit. Nothing is generated and nothing is guessed: no licensed hit, or no answer, is no photograph.
//
// The address is fixed here (as the YouTube adapter's is), a redirect is a failure, and every address in the answer is
// checked for its host before it is kept. For a child's screen the search looks only among the pictures Commons'
// reviewers have assessed (quality, featured and valued images), skips a file with a personality or other restriction,
// and skips one whose title or categories name something not for children.

export type CommonsPhoto = { url: string; pageUrl: string; author: string; licence: string; licenceUrl: string | null };

export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const TIMEOUT_MS = 4000;
const WIDTH = 960;
const MAX_BYTES = 2 * 1024 * 1024;
const ASSESSED = 'incategory:Quality_images|Featured_pictures_on_Wikimedia_Commons|Valued_images';
const NOT_FOR_CHILDREN = /\b(nud(e|ity)|naked|sex(ual)?|erotic|porn|corpse|dead body|autopsy|gore|wound|injur(y|ies)|surgery|execution|lynch|tortur|genital|weapon|gun|drug)/i;

export function commonsSearchUrl(query: string): string {
  const q = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: '10',
    gsrsearch: `${query} filetype:bitmap ${ASSESSED}`,
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: String(WIDTH),
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|Restrictions|Categories',
  });
  return `${COMMONS_API}?${q.toString()}`;
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };
// Commons gives the author as HTML (often a link to the user's page): the words only.
const words = (html: unknown, max: number): string | null => {
  if (typeof html !== 'string') return null;
  const text = plain(html.replace(/<[^>]*>/g, ' ').replace(/&(amp|quot|#39|lt|gt|nbsp);/g, (e) => ENTITIES[e] ?? ' '), 2000);
  return text && text.length <= max ? text : null;
};

// "CC-BY-SA-3.0" (older files) reads as "CC BY-SA 3.0"; anything outside the allowed licences is null.
export function allowedLicence(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/^CC-BY(-SA)?-(\d\.\d)$/i, (_m, sa: string | undefined, ver: string) => `CC BY${sa ? '-SA' : ''} ${ver}`);
  return PHOTO_LICENCE.test(s) ? s : null;
}

const onHost = (v: unknown, host: string): string | null => {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && u.hostname === host && !u.port && !u.username ? u.toString() : null;
  } catch {
    return null;
  }
};

type Page = { title?: unknown; index?: unknown; imageinfo?: { url?: unknown; thumburl?: unknown; descriptionurl?: unknown; mime?: unknown; size?: unknown; width?: unknown; height?: unknown; extmetadata?: Record<string, { value?: unknown } | undefined> }[] };

// The best licensed photograph in one search answer, or null: a JPEG or PNG with an allowed licence, an author, no
// restriction and nothing in its title or categories that is not for children; a landscape picture under 2 MB first,
// then Commons' own order.
export function pickPhoto(answer: unknown): CommonsPhoto | null {
  const pages = (answer as { query?: { pages?: unknown } } | null)?.query?.pages;
  if (!Array.isArray(pages)) return null;
  const found: { photo: CommonsPhoto; rank: number }[] = [];
  for (const p of pages as Page[]) {
    const ii = Array.isArray(p?.imageinfo) ? p.imageinfo[0] : undefined;
    const meta = ii?.extmetadata ?? {};
    if (!ii || (ii.mime !== 'image/jpeg' && ii.mime !== 'image/png')) continue;
    const licence = allowedLicence(meta.LicenseShortName?.value);
    const author = words(meta.Artist?.value, 120);
    const restricted = typeof meta.Restrictions?.value === 'string' && meta.Restrictions.value.trim() !== '';
    const about = `${typeof p.title === 'string' ? p.title : ''} ${typeof meta.Categories?.value === 'string' ? meta.Categories.value : ''}`;
    const url = onHost(ii.thumburl, PHOTO_HOST) ?? onHost(ii.url, PHOTO_HOST);
    const pageUrl = onHost(ii.descriptionurl, PHOTO_PAGE_HOST);
    if (!licence || !author || restricted || NOT_FOR_CHILDREN.test(about) || !url || !pageUrl || !new URL(pageUrl).pathname.startsWith('/wiki/File:')) continue;
    const licenceUrl = onHost(meta.LicenseUrl?.value, 'creativecommons.org');
    const landscape = Number(ii.width) >= Number(ii.height);
    const small = Number(ii.size) > 0 && Number(ii.size) < MAX_BYTES;
    const order = typeof p.index === 'number' ? p.index : found.length;
    found.push({ photo: { url, pageUrl, author, licence, licenceUrl }, rank: (landscape ? 0 : 2000) + (small ? 0 : 1000) + order });
  }
  found.sort((a, b) => a.rank - b.rank);
  return found[0]?.photo ?? null;
}

// One search, or null on any failure (no answer in time, a redirect, an error status, an answer that is not JSON).
export async function searchCommons(query: string, fetcher: typeof fetch = fetch): Promise<CommonsPhoto | null> {
  try {
    const res = await fetcher(commonsSearchUrl(query), {
      headers: { accept: 'application/json', 'User-Agent': 'NetCyberAI-Family/1.0 (licensed photo lookup, server side)' },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return pickPhoto(await res.json());
  } catch {
    return null;
  }
}
