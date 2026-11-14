import { OPENVERSE_IMAGE_HOST, OPENVERSE_PAGE_HOST, PHOTO_LICENCE, openversePage } from '@/lib/family/blocks';
import { NOT_FOR_CHILDREN, TIMEOUT_MS, onHost, words, type CommonsPhoto } from './commons';

// Licensed photographs from Openverse (C526), the second source, asked only when Commons finds nothing (fill.ts
// searchPhoto). The same rules as the Commons path: the server, never the phone, asks; the address is fixed here; a
// redirect, an error status, an answer that is not JSON or no answer within the time limit is no photograph; only CC0,
// public domain, CC BY and CC BY-SA, with an author to credit; nothing marked mature, and nothing whose title or tags name
// something not for children (the same word list as Commons). The search asks for those licences and for no mature
// content, and every result is checked again here, so a change on Openverse's side cannot let one through.
//
// The phone is given Openverse's own small thumbnail of the image (one fixed host, the image's id in the address) and
// the image's page on openverse.org (its credit, with the original's licence, author and link). No key is used: the
// anonymous rate is enough for a fallback, and each query's result is kept in this server's memory for a day (a miss
// for an hour), so a popular question does not ask again. The Commons cache table (content.image_picks) accepts only
// Commons addresses, so an Openverse photograph is not written there.

export const OPENVERSE_API = 'https://api.openverse.org/v1/images/';
export const OPENVERSE_LICENCES = 'cc0,pdm,by,by-sa';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const HIT_MS = 24 * 60 * 60 * 1000;
export const MISS_MS = 60 * 60 * 1000;
const CACHE_MAX = 300;

export function openverseSearchUrl(query: string): string {
  const q = new URLSearchParams({ q: query, license: OPENVERSE_LICENCES, mature: 'false', page_size: '10' });
  return `${OPENVERSE_API}?${q.toString()}`;
}

// Openverse's licence code and version as the words the credit shows, or null outside the allowed licences.
export function openverseLicence(code: unknown, version: unknown): string | null {
  if (typeof code !== 'string') return null;
  const v = typeof version === 'string' && /^\d\.\d$/.test(version) ? ` ${version}` : '';
  const c = code.trim().toLowerCase();
  const s = c === 'cc0' ? 'CC0 1.0' : c === 'pdm' ? 'Public domain' : c === 'by' ? `CC BY${v}` : c === 'by-sa' ? `CC BY-SA${v}` : null;
  return s && PHOTO_LICENCE.test(s) ? s : null;
}

type Result = { id?: unknown; title?: unknown; creator?: unknown; license?: unknown; license_version?: unknown; license_url?: unknown; mature?: unknown; width?: unknown; height?: unknown; tags?: unknown };

const tagWords = (tags: unknown): string => (Array.isArray(tags) ? tags.map((t) => (t && typeof (t as { name?: unknown }).name === 'string' ? (t as { name: string }).name : '')).join(' ') : '');

// The best licensed photograph in one Openverse answer, or null: an allowed licence, an author, not mature, nothing in
// its title or tags not for children; a landscape picture first, then Openverse's own order.
export function pickOpenverse(answer: unknown): CommonsPhoto | null {
  const results = (answer as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return null;
  const found: { photo: CommonsPhoto; rank: number }[] = [];
  results.forEach((r: Result, order) => {
    if (!r || typeof r.id !== 'string' || !ID.test(r.id) || r.mature !== false) return;
    const licence = openverseLicence(r.license, r.license_version);
    const author = words(r.creator, 120);
    const about = `${typeof r.title === 'string' ? r.title : ''} ${tagWords(r.tags)}`;
    if (!licence || !author || NOT_FOR_CHILDREN.test(about)) return;
    const url = onHost(`https://${OPENVERSE_IMAGE_HOST}/v1/images/${r.id}/thumb/`, OPENVERSE_IMAGE_HOST);
    if (!url) return;
    const pageUrl = openversePage(url);
    if (!onHost(pageUrl, OPENVERSE_PAGE_HOST)) return;
    const licenceUrl = onHost(r.license_url, 'creativecommons.org');
    const landscape = !(Number(r.width) < Number(r.height));
    found.push({ photo: { url, pageUrl, author, licence, licenceUrl }, rank: (landscape ? 0 : 1000) + order });
  });
  found.sort((a, b) => a.rank - b.rank);
  return found[0]?.photo ?? null;
}

const cache = new Map<string, { photo: CommonsPhoto | null; until: number }>();
const keyOf = (q: string): string => q.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
export const clearOpenverseCache = (): void => cache.clear();

// One search (or this server's remembered answer to it), or null on any failure.
export async function searchOpenverse(query: string, fetcher: typeof fetch = fetch, now: () => number = Date.now): Promise<CommonsPhoto | null> {
  const key = keyOf(query);
  if (!key) return null;
  const kept = cache.get(key);
  if (kept && kept.until > now()) return kept.photo;
  let photo: CommonsPhoto | null = null;
  try {
    const res = await fetcher(openverseSearchUrl(key), {
      headers: { accept: 'application/json', 'User-Agent': 'NetCyberAI-Family/1.0 (licensed photo lookup, server side)' },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    photo = pickOpenverse(await res.json());
  } catch {
    return null;
  }
  cache.delete(key);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { photo, until: now() + (photo ? HIT_MS : MISS_MS) });
  return photo;
}
