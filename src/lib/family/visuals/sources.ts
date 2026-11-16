import { PHOTO_LICENCE } from '@/lib/family/blocks';
import { NOT_FOR_CHILDREN, searchCommons, type CommonsPhoto } from './commons';
import { searchOpenverse } from './openverse';
import { photoUrl } from './photo-hosts';

// The registry of picture sources (founder, 16 Nov 2026; .claude/commands/visual-sources.md): free for commercial use
// only. Every source is listed with how it is reached (LIVE: searched on the server at answer time; BULK: downloaded
// once by a script; EMBED; CODE), the key it needs and the licence it is filtered to. A LIVE source with an adapter below
// is asked in the order its subject routes (`route`); a source whose key is not in the environment is skipped silently,
// as is one that fails, answers late or has nothing. Wikimedia's "assessed" files are a ranking bonus in commons.ts, not a
// filter. Nothing here is shown to a child with a label: the author, licence and page stay in the data for the one
// Picture credits page.

export type SourceId = string;
export type Access = 'live' | 'bulk' | 'embed' | 'code';
// `served`: a 3D or animation source asked by models3d.ts (not a photograph adapter). `planned`: listed, no adapter yet
// (the note says why). Every row has an adapter, is served elsewhere (model3d, animation, embed, code) or is planned.
export type SourceDef = { id: SourceId; name: string; access: Access; key: string | null; licence: string; content: string; adapter?: Adapter; note?: string; served?: 'model3d' | 'animation'; planned?: true };
export type Photo = CommonsPhoto & { source: SourceId };
export type Env = Record<string, string | undefined>;
export type Fetcher = typeof fetch;
export type Adapter = (query: string, env: Env, fetcher: Fetcher) => Promise<CommonsPhoto | null>;

const TIMEOUT_MS = 4000;
const UA = 'NetCyberAI-Family/1.0 (licensed picture lookup, server side)';

async function getJson(url: string, fetcher: Fetcher, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetcher(url, { headers: { accept: 'application/json', 'User-Agent': UA, ...headers }, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}
const str = (v: unknown, max = 120): string | null => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const clean = (q: string) => encodeURIComponent(q.slice(0, 100));
const httpsPage = (v: unknown, host: RegExp): string | null => {
  try {
    const u = new URL(String(v));
    return u.protocol === 'https:' && host.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
};

// NASA Image and Video Library: public domain; Earth, space, weather. Items marked otherwise (a copyright line) are skipped.
export const nasa: Adapter = async (q, _env, f) => {
  const body = rec(rec(await getJson(`https://images-api.nasa.gov/search?q=${clean(q)}&media_type=image&page_size=10`, f)).collection);
  for (const it of arr(body.items)) {
    const d = rec(arr(it.data)[0]);
    const link = arr(it.links).find((l) => l.rel === 'preview');
    const id = str(d.nasa_id, 60);
    const url = photoUrl(link?.href);
    const title = `${d.title ?? ''} ${d.description ?? ''}`;
    if (!id || !url || NOT_FOR_CHILDREN.test(title) || /copyright|courtesy|©/i.test(String(d.description ?? ''))) continue;
    return { url, pageUrl: `https://images.nasa.gov/details/${encodeURIComponent(id)}`, author: str(d.secondary_creator) ?? str(d.photographer) ?? str(d.center, 40) ?? 'NASA', licence: 'Public domain', licenceUrl: null };
  }
  return null;
};

// iNaturalist: research-grade observations with a CC0 or CC BY photograph (animals, plants).
export const inaturalist: Adapter = async (q, _env, f) => {
  const body = rec(await getJson(`https://api.inaturalist.org/v1/observations?q=${clean(q)}&per_page=10&quality_grade=research&photos=true&photo_license=cc0,cc-by&order_by=votes`, f));
  for (const o of arr(body.results)) {
    const p = rec(arr(o.photos)[0]);
    const code = String(p.license_code ?? '').toLowerCase();
    const licence = code === 'cc0' ? 'CC0 1.0' : code === 'cc-by' ? 'CC BY 4.0' : null;
    const url = photoUrl(typeof p.url === 'string' ? p.url.replace('/square.', '/medium.') : null);
    const author = str(p.attribution, 120) ?? str(rec(o.user).login, 60);
    const page = httpsPage(o.uri, /(^|\.)inaturalist\.org$/);
    if (licence && url && author && page && PHOTO_LICENCE.test(licence)) return { url, pageUrl: page, author, licence, licenceUrl: null };
  }
  return null;
};

// Wellcome Collection: public domain, CC0 or CC BY only (their IIIF image at 640 px).
export const wellcome: Adapter = async (q, _env, f) => {
  const body = rec(await getJson(`https://api.wellcomecollection.org/catalogue/v2/images?query=${clean(q)}&pageSize=10&locations.license=pdm,cc0,cc-by`, f));
  for (const r of arr(body.results)) {
    const loc = rec(arr(r.locations)[0]);
    const id = str(rec(loc.license).id, 12);
    const licence = id === 'pdm' ? 'Public domain' : id === 'cc0' ? 'CC0 1.0' : id === 'cc-by' ? 'CC BY 4.0' : null;
    const base = typeof loc.url === 'string' ? loc.url.replace(/\/info\.json$/, '') : '';
    const url = photoUrl(base ? `${base}/full/640,/0/default.jpg` : null);
    const src = rec(r.source);
    const title = str(src.title, 200) ?? '';
    if (!licence || !url || NOT_FOR_CHILDREN.test(title) || !str(r.id, 20)) continue;
    return { url, pageUrl: `https://wellcomecollection.org/works/${encodeURIComponent(String(src.id ?? r.id))}`, author: str(loc.credit) ?? 'Wellcome Collection', licence, licenceUrl: null };
  }
  return null;
};

// Pixabay (free key): its own licence, free for commercial use; safe search on.
export const pixabay: Adapter = async (q, env, f) => {
  const key = env.PIXABAY_API_KEY;
  if (!key) return null;
  const body = rec(await getJson(`https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${clean(q)}&image_type=photo&safesearch=true&per_page=10&orientation=horizontal`, f));
  for (const h of arr(body.hits)) {
    const url = photoUrl(h.webformatURL);
    if (url && !NOT_FOR_CHILDREN.test(String(h.tags ?? ''))) return { url, pageUrl: httpsPage(h.pageURL, /(^|\.)pixabay\.com$/) ?? 'https://pixabay.com', author: str(h.user, 60) ?? 'Pixabay', licence: 'CC0 1.0', licenceUrl: null };
  }
  return null;
};

// Pexels (free key): the Pexels licence, free for commercial use.
export const pexels: Adapter = async (q, env, f) => {
  const key = env.PEXELS_API_KEY;
  if (!key) return null;
  const body = rec(await getJson(`https://api.pexels.com/v1/search?query=${clean(q)}&per_page=10&orientation=landscape`, f, { Authorization: key }));
  for (const p of arr(body.photos)) {
    const url = photoUrl(rec(p.src).large);
    if (url && !NOT_FOR_CHILDREN.test(String(p.alt ?? ''))) return { url, pageUrl: httpsPage(p.url, /(^|\.)pexels\.com$/) ?? 'https://www.pexels.com', author: str(p.photographer, 60) ?? 'Pexels', licence: 'CC0 1.0', licenceUrl: null };
  }
  return null;
};

// Unsplash (free key): hotlinked, as its API guidelines ask; the download is reported to Unsplash.
export const unsplash: Adapter = async (q, env, f) => {
  const key = env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  const auth = { Authorization: `Client-ID ${key}` };
  const body = rec(await getJson(`https://api.unsplash.com/search/photos?query=${clean(q)}&per_page=10&orientation=landscape&content_filter=high`, f, auth));
  for (const p of arr(body.results)) {
    const url = photoUrl(rec(p.urls).regular);
    if (!url || NOT_FOR_CHILDREN.test(`${p.alt_description ?? ''} ${p.description ?? ''}`)) continue;
    const ping = httpsPage(rec(p.links).download_location, /^api\.unsplash\.com$/);
    if (ping) void getJson(ping, f, auth).catch(() => {});
    return { url, pageUrl: httpsPage(rec(p.links).html, /(^|\.)unsplash\.com$/) ?? 'https://unsplash.com', author: str(rec(p.user).name, 60) ?? 'Unsplash', licence: 'CC0 1.0', licenceUrl: null };
  }
  return null;
};

// Smithsonian Open Access (free api.data.gov key): CC0 records only.
export const smithsonian: Adapter = async (q, env, f) => {
  const key = env.SMITHSONIAN_API_KEY ?? env.DATA_GOV_API_KEY;
  if (!key) return null;
  const body = rec(rec(await getJson(`https://api.si.edu/openaccess/api/v1.0/search?q=${clean(`${q} AND online_media_type:"Images"`)}&rows=10&api_key=${encodeURIComponent(key)}`, f)).response);
  for (const row of arr(body.rows)) {
    const c = rec(row.content);
    const media = arr(rec(rec(c.descriptiveNonRepeating).online_media).media).find((m) => m.type === 'Images' && rec(m.usage).access === 'CC0');
    const url = photoUrl(media?.content);
    const title = str(rec(rec(c.descriptiveNonRepeating).title).content, 200) ?? '';
    const page = httpsPage(rec(c.descriptiveNonRepeating).record_link, /(^|\.)si\.edu$/);
    if (url && page && !NOT_FOR_CHILDREN.test(title)) return { url, pageUrl: page, author: str(rec(c.descriptiveNonRepeating).data_source, 80) ?? 'Smithsonian', licence: 'CC0 1.0', licenceUrl: null };
  }
  return null;
};

// Art Institute of Chicago: public-domain works only (history and art).
export const aic: Adapter = async (q, _env, f) => {
  const body = rec(await getJson(`https://api.artic.edu/api/v1/artworks/search?q=${clean(q)}&limit=10&fields=id,title,image_id,is_public_domain,artist_title&query[term][is_public_domain]=true`, f));
  for (const a of arr(body.data)) {
    const image = str(a.image_id, 80);
    if (a.is_public_domain !== true || !image || !/^[A-Za-z0-9-]+$/.test(image) || NOT_FOR_CHILDREN.test(String(a.title ?? ''))) continue;
    const url = photoUrl(`https://www.artic.edu/iiif/2/${image}/full/843,/0/default.jpg`);
    if (url) return { url, pageUrl: `https://www.artic.edu/artworks/${Number(a.id)}`, author: str(a.artist_title, 80) ?? 'Art Institute of Chicago', licence: 'CC0 1.0', licenceUrl: null };
  }
  return null;
};

// v21 picture adapters, each in its own file and loaded with import() on first use.
const metAdapter: Adapter = async (q, _e, f) => (await import('./pic-met')).metPhoto(q, f);
const clevelandAdapter: Adapter = async (q, _e, f) => (await import('./pic-cleveland')).clevelandPhoto(q, f);
const iconifyAdapter: Adapter = async (q, _e, f) => (await import('./pic-iconify')).iconifyPicture(q, f);
const earthObsAdapter: Adapter = async (q, _e, f) => (await import('./pic-earthobs')).earthObsPhoto(q, f);
const P = (d: SourceDef, note: string): SourceDef => ({ ...d, planned: true, note });
const M = (d: SourceDef, note?: string): SourceDef => ({ ...d, served: 'model3d', ...(note ? { note } : {}) });

const wrapCommons: Adapter = (q, _e, f) => searchCommons(q, f);
const wrapOpenverse: Adapter = (q, _e, f) => searchOpenverse(q, f);

const S = (id: string, name: string, access: Access, key: string | null, licence: string, content: string, adapter?: Adapter, note?: string): SourceDef => ({ id, name, access, key, licence, content, ...(adapter ? { adapter } : {}), ...(note ? { note } : {}) });
// The 50 sources of visual-sources.md (rows 1 to 50), then the embedded simulation sources added 16 Nov 2026. Those with an adapter are LIVE here; the others are listed for the
// bulk scripts and the embeds, and are never searched at answer time.
export const SOURCES: readonly SourceDef[] = [
  S('commons', 'Wikimedia Commons', 'live', null, 'PD, CC0, CC BY, CC BY-SA', 'photo, diagram', wrapCommons),
  S('openverse', 'Openverse', 'live', null, 'PD, CC0, CC BY, CC BY-SA', 'photo, illustration', wrapOpenverse),
  S('unsplash', 'Unsplash', 'live', 'UNSPLASH_ACCESS_KEY', 'Unsplash licence', 'photo', unsplash),
  S('pexels', 'Pexels', 'live', 'PEXELS_API_KEY', 'Pexels licence', 'photo', pexels),
  S('pixabay', 'Pixabay', 'live', 'PIXABAY_API_KEY', 'Pixabay licence', 'photo, illustration', pixabay),
  S('nasa', 'NASA Image and Video Library', 'live', null, 'Public domain', 'space, Earth', nasa),
  S('smithsonian', 'Smithsonian Open Access', 'live', 'SMITHSONIAN_API_KEY', 'CC0', 'photo', smithsonian),
  S('met', 'The Met Museum', 'live', null, 'Public domain (CC0)', 'history, art', metAdapter, 'v1/search retired 2026-10-01; v1.1/search plus v1/objects (isPublicDomain checked per object).'),
  S('aic', 'Art Institute of Chicago', 'live', null, 'Public domain', 'history, art', aic),
  S('cleveland', 'Cleveland Museum of Art', 'live', null, 'CC0', 'photo', clevelandAdapter),
  P(S('rijksmuseum', 'Rijksmuseum', 'live', 'RIJKSMUSEUM_API_KEY', 'CC0', 'photo'), 'Not built in v21.'),
  P(S('europeana', 'Europeana', 'live', 'EUROPEANA_API_KEY', 'CC0, PD, CC BY, CC BY-SA', 'photo'), 'Not built in v21.'),
  P(S('loc', 'Library of Congress', 'live', null, 'PD', 'photo, map'), 'loc.gov answers automated requests with a bot challenge (403, 16 Nov 2026); no adapter.'),
  P(S('nypl', 'NYPL Digital Collections', 'live', 'NYPL_API_KEY', 'PD', 'illustration, map'), 'Not built in v21.'),
  P(S('dpla', 'Digital Public Library of America', 'live', 'DPLA_API_KEY', 'PD, CC0', 'photo'), 'Not built in v21.'),
  P(S('flickr', 'Flickr', 'live', 'FLICKR_API_KEY', 'PD, CC0', 'photo'), 'Not built in v21.'),
  S('inaturalist', 'iNaturalist', 'live', null, 'CC0, CC BY', 'animals, plants', inaturalist),
  S('wellcome', 'Wellcome Collection', 'live', null, 'PD, CC0, CC BY', 'body, medicine', wellcome),
  P(S('bhl', 'Biodiversity Heritage Library', 'live', 'BHL_API_KEY', 'PD', 'nature illustration'), 'Not built in v21.'),
  M(S('pubchem', 'PubChem', 'live', null, 'PD', '2D and 3D molecules')),
  M(S('pdb', 'RCSB Protein Data Bank', 'live', null, 'CC0', '3D molecules')),
  P(S('cdc', 'CDC Public Health Image Library', 'bulk', null, 'PD items only', 'health'), 'No public JSON API (the old address redirects to the website); a person would pick PD items by hand.'),
  S('earthobs', 'NASA Earth Observatory', 'live', null, 'PD', 'geography, weather', earthObsAdapter),
  P(S('esa', 'ESA / Hubble / Webb', 'bulk', null, 'CC BY', 'space'), 'esahubble.org and esawebb.org have no JSON search; a bulk pick is needed.'),
  P(S('naturalearth', 'Natural Earth', 'bulk', null, 'PD', 'map data'), 'Map data for drawn maps, not a picture search.'),
  S('iconify', 'Iconify', 'live', null, 'Apache 2.0, MIT, CC BY 4.0 (three emoji sets)', 'icon', iconifyAdapter),
  P(S('emoji', 'Fluent / Noto Emoji', 'bulk', null, 'MIT, Apache', 'emoji'), 'Reached live through Iconify (noto, fluent-emoji-flat).'),
  P(S('peeps', 'Open Peeps, Humaaans', 'bulk', null, 'CC0', 'illustration'), 'No API; a bulk pick is needed.'),
  P(S('undraw', 'unDraw', 'bulk', null, 'unDraw licence', 'illustration'), 'Only an undocumented site search; its licence forbids building a collection of its illustrations. Not called.'),
  P(S('openclipart', 'Openclipart', 'bulk', null, 'CC0', 'clipart'), 'Its JSON search is gone (redirects to the home page, 16 Nov 2026).'),
  P(S('servier', 'Servier Medical Art', 'bulk', null, 'CC BY 4.0', 'biology diagram'), 'No public search API; a bulk pick of its CC BY slides is needed.'),
  P(S('openstax', 'OpenStax figures', 'bulk', null, 'CC BY 4.0', 'Class 11-12 science'), 'No figure API; a bulk pick is needed.'),
  P(S('rawpixel', 'Rawpixel public domain', 'bulk', null, 'CC0', 'illustration, photo'), 'No API; a bulk pick is needed.'),
  P(S('oldbook', 'Old Book Illustrations', 'bulk', null, 'PD', 'illustration'), 'No API; a bulk pick is needed.'),
  P(S('getty', 'Getty Open Content', 'bulk', null, 'Getty open content', 'art, history'), 'Not built in v21.'),
  { ...S('anim', 'Animation set (our own SVG animations, public/anim)', 'live', null, 'CC0 (own work)', 'animation'), served: 'animation', note: 'LottieFiles has no public key and is never called; our own set in public/anim/index.json.' },
  P(S('mixkit', 'Mixkit, Coverr', 'bulk', null, 'their free licences', 'short video'), 'No API; video is not used in an answer step.'),
  M(S('nasa3d', 'NASA 3D Resources', 'live', null, 'PD', '3D glTF'), 'No API: data/nasa3d.json lists 95 models from science.nasa.gov/3d-resources.'),
  M(S('smithsonian3d', 'Smithsonian 3D', 'live', 'SMITHSONIAN_API_KEY', 'CC0', '3D')),
  P(S('nih3d', 'NIH 3D', 'bulk', null, 'CC0, CC BY', '3D body, cells'), 'No documented public search API found (16 Nov 2026).'),
  P(S('bodyparts3d', 'BodyParts3D / Z-Anatomy', 'bulk', null, 'CC BY-SA', '3D anatomy'), 'OBJ bulk files only; would need converting to glTF.'),
  M(S('polypizza', 'Poly Pizza', 'live', 'POLY_PIZZA_API_KEY', 'CC0, CC BY', '3D low-poly')),
  M(S('sketchfab', 'Sketchfab', 'live', 'SKETCHFAB_TOKEN', 'CC0, CC BY, CC BY-SA; downloadable only', '3D')),
  M(S('polyhaven', 'Poly Haven', 'live', null, 'CC0', '3D models')),
  P(S('ambientcg', 'ambientCG', 'live', null, 'CC0', '3D textures'), 'Textures and materials only, not a model a step can show.'),
  P(S('kenney', 'Kenney, Quaternius, KayKit', 'bulk', null, 'CC0', '3D and 2D for young classes'), 'Zip packs only, no per-model address; a bulk pick into storage is needed.'),
  M(S('khronos', 'Khronos glTF samples', 'live', null, 'CC0, CC BY per model', '3D'), 'Five curated models referenced by their raw addresses (model-khronos.ts).'),
  S('phet', 'PhET Interactive Simulations', 'embed', null, 'CC BY 4.0', 'interactive'),
  S('concord', 'Concord Consortium', 'embed', null, 'CC BY, MIT', 'interactive'),
  // Embedded simulations (Noor, 16 Nov 2026): never searched by the AI; each is approved by a person into content.curated_topic_sims
  // (scripts/seed_curated_sims.ts) and shown in step 4 of an answer as a tap-to-load "Try it yourself" card. Their order of preference
  // is EMBED_ORDER (embed-order.ts); a source whose pages block embedding is not seeded.
  S('geogebra', 'GeoGebra', 'embed', null, 'GeoGebra terms; materials CC BY-NC-SA unless the author says otherwise', 'maths interactive, Classes 3 to 12'),
  S('nasa_eyes', 'NASA Eyes', 'embed', null, 'Public domain', 'planets, Earth and space in 3D'),
  S('hhmi', 'HHMI BioInteractive', 'embed', null, 'CC BY-NC-ND for most resources', 'biology interactive'),
  S('labxchange', 'LabXchange', 'embed', null, 'CC BY, per resource', 'biology, Classes 9 to 12'),
  S('desmos', 'Desmos', 'embed', null, 'Desmos terms', 'graphs, higher classes'),
  S('googlearts', 'Google Arts and Culture', 'embed', null, 'Google terms', 'history, Indian heritage'),
  S('wolfram', 'Wolfram Demonstrations', 'embed', null, 'CC BY-NC-SA (heavy: last choice)', 'interactive demonstrations'),
  S('katex', 'Mermaid, KaTeX', 'code', null, 'MIT', 'diagrams, equations'),
];

// The order each subject asks the live sources (the first with a photograph wins). A query that is about space or
// Earth goes to NASA first, whatever the subject.
const SPACE = /\b(planet|moon|sun|star|galaxy|space|earth|orbit|eclipse|cloud|storm|cyclone|monsoon|volcano|glacier|satellite|atmosphere|climate)\b/i;
const NATURE: SourceId[] = ['inaturalist', 'commons', 'openverse', 'pixabay', 'pexels', 'unsplash'];
const BODY: SourceId[] = ['wellcome', 'commons', 'openverse', 'pixabay', 'pexels'];
const PAST: SourceId[] = ['commons', 'smithsonian', 'aic', 'openverse', 'unsplash', 'pexels'];
const GENERAL: SourceId[] = ['commons', 'openverse', 'pixabay', 'pexels', 'unsplash'];
const ROUTE: Record<string, SourceId[]> = {
  biology: NATURE, evs: NATURE, science: NATURE, physics: GENERAL, chemistry: GENERAL, geography: ['nasa', ...GENERAL],
  history: PAST, social_science: PAST, political_science: PAST, economics: GENERAL, civics: PAST,
};
const BODYWORDS = /\b(heart|lung|brain|kidney|blood|bone|muscle|digest|stomach|organ|cell|body|skin|eye|ear)\b/i;

export function routeFor(subject: string | null, query: string): SourceId[] {
  const base = ROUTE[subject ?? ''] ?? GENERAL;
  const order = BODYWORDS.test(query) && NATURE.includes(base[0]) ? BODY : base;
  return SPACE.test(query) ? ['nasa', ...order.filter((s) => s !== 'nasa')] : [...order];
}

// The sources that can be asked now: a LIVE adapter, with its key in the environment (or none needed).
export function askable(ids: readonly SourceId[], env: Env): SourceDef[] {
  return ids.map((id) => SOURCES.find((s) => s.id === id)).filter((s): s is SourceDef => !!s && s.access === 'live' && !!s.adapter && (!s.key || !!env[s.key]));
}

// One picture for a query: the routed sources in order, each with its own time limit; one that fails, is late or has no
// key is skipped without a word. null when none has one.
export async function searchSources(query: string, opts: { subject: string | null; env?: Env; fetcher?: Fetcher; budgetMs?: number } = { subject: null }): Promise<Photo | null> {
  const env = opts.env ?? (process.env as Env);
  const fetcher = opts.fetcher ?? fetch;
  const until = Date.now() + (opts.budgetMs ?? 8000);
  for (const s of askable(routeFor(opts.subject, query), env)) {
    if (Date.now() > until) break;
    const hit = await s.adapter!(query, env, fetcher).catch(() => null);
    if (hit) return { ...hit, source: s.id };
  }
  return null;
}
