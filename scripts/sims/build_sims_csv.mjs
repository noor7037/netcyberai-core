// Builds scripts/seed/curated_sims.csv from scripts/sims/candidates.mjs, keeping only simulations that load and allow
// embedding (Noor, 16 Nov 2026). Run on purpose:  node scripts/sims/build_sims_csv.mjs
// Each candidate is fetched: it must answer 200, carry no X-Frame-Options that refuses a page of another site, and no
// Content-Security-Policy frame-ancestors that does. PhET's Hindi page is looked for beside the English one. A PhET
// preview picture is saved small into public/sims/ (so no third-party picture loads before a child taps).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { GEOGEBRA, NASA_EYES, PHET } from './candidates.mjs';

const UA = 'Mozilla/5.0 (compatible; NetCyberAI-sim-check/1.0)';
const out = new URL('../seed/curated_sims.csv', import.meta.url).pathname;
const previews = new URL('../../public/sims/', import.meta.url).pathname;
mkdirSync(previews, { recursive: true });

async function embeddable(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
    if (res.status !== 200) return { ok: false, why: `status ${res.status}` };
    const xfo = (res.headers.get('x-frame-options') ?? '').toLowerCase();
    if (xfo.includes('deny') || xfo.includes('sameorigin')) return { ok: false, why: `x-frame-options ${xfo}` };
    const fa = /frame-ancestors([^;]*)/i.exec(res.headers.get('content-security-policy') ?? '');
    if (fa && !/\*|https:(?!\/)|\bhttps\b\s*(;|$)/.test(fa[1]) && !/\*/.test(fa[1])) return { ok: false, why: `frame-ancestors ${fa[1].trim()}` };
    const text = await res.text();
    return { ok: true, text };
  } catch (e) {
    return { ok: false, why: String(e?.message ?? e) };
  }
}
const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
const rows = [];
const dropped = [];
const COLS = ['class', 'subject', 'chapter_number', 'chapter_name', 'topic', 'language', 'source', 'title', 'embed_url', 'page_url', 'licence', 'preview'];
const add = (r) => rows.push(COLS.map((c) => q(r[c] ?? '')).join(','));
const pageTitle = (html, fallback) => {
  const m = /<title>([^<]{3,120})<\/title>/i.exec(html ?? '');
  if (!m) return fallback;
  // PhET writes its titles as HTML entities with direction marks and sometimes a version number; a debug title is never used.
  const t = m[1].replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&nbsp;/g, ' ').replace(/[\u202a-\u202e\u200e\u200f\u00a0]/g, ' ').replace(/\s*\d+\.\d+\.\d+\s*$/, '').replace(/\s+/g, ' ').trim();
  return !t || /scenery|debug/i.test(t) ? fallback : t;
};

const phetCache = new Map();
async function phet(slug) {
  if (phetCache.has(slug)) return phetCache.get(slug);
  const base = `https://phet.colorado.edu/sims/html/${slug}/latest/${slug}`;
  const en = await embeddable(`${base}_en.html`);
  const hi = en.ok ? await embeddable(`${base}_hi.html`) : { ok: false };
  let preview = '';
  if (en.ok) {
    const file = `${previews}${slug}.jpg`;
    if (!existsSync(file)) {
      const tmp = `/tmp/phet-${slug}.png`;
      try {
        const img = await fetch(`${base}-600.png`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(25000) });
        if (img.ok) {
          writeFileSync(tmp, Buffer.from(await img.arrayBuffer()));
          execFileSync('sips', ['-Z', '360', '-s', 'format', 'jpeg', '-s', 'formatOptions', '60', tmp, '--out', file], { stdio: 'ignore' });
          rmSync(tmp, { force: true });
        }
      } catch { /* no preview: the card is drawn */ }
    }
    if (existsSync(file)) preview = `/sims/${slug}.jpg`;
  }
  const v = { base, en, hi, preview, titleHi: hi.ok ? pageTitle(hi.text, '') : '' };
  phetCache.set(slug, v);
  return v;
}

for (const [slug, title, cls, subject, chapter, topics] of PHET) {
  const p = await phet(slug);
  if (!p.en.ok) { dropped.push(`phet ${slug}: ${p.en.why}`); continue; }
  for (const topic of topics) {
    const common = { class: cls, subject, chapter_name: chapter, topic, source: 'phet', licence: 'CC BY 4.0 (PhET Interactive Simulations, University of Colorado Boulder)', preview: p.preview, page_url: `https://phet.colorado.edu/en/simulations/${slug}` };
    add({ ...common, language: 'en', title, embed_url: `${p.base}_en.html` });
    if (p.hi.ok) add({ ...common, language: 'hi', title: p.titleHi || title, embed_url: `${p.base}_hi.html` });
  }
}
for (const [url, title, cls, subject, chapter, topics] of NASA_EYES) {
  const r = await embeddable(url);
  if (!r.ok) { dropped.push(`nasa eyes ${url}: ${r.why}`); continue; }
  for (const topic of topics) add({ class: cls, subject, chapter_name: chapter, topic, language: 'en', source: 'nasa_eyes', title, embed_url: url, page_url: url, licence: 'NASA, public domain (NASA Eyes)' });
}
for (const [query, cls, subject, chapter, topics] of GEOGEBRA) {
  let picked = null;
  try {
    const res = await fetch('https://www.geogebra.org/api/json.php', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: { '-api': '1.0.0', task: { '-type': 'fetch', fields: { field: [{ '-name': 'title' }, { '-name': 'id' }] }, filters: { field: [{ '-name': 'search', '#text': query }] }, order: { '-by': 'relevance', '-type': 'desc' }, limit: { '-num': '8' } } } }), signal: AbortSignal.timeout(25000) });
    const items = (await res.json())?.responses?.response?.item ?? [];
    const key = query.split(' ').filter((w) => w.length > 3);
    for (const it of items) {
      if (!it?.id || !it?.title || !key.some((k) => it.title.toLowerCase().includes(k.toLowerCase().slice(0, 5)))) continue;
      const r = await embeddable(`https://www.geogebra.org/m/${it.id}`);
      if (r.ok) { picked = it; break; }
    }
  } catch { /* dropped below */ }
  if (!picked) { dropped.push(`geogebra "${query}": none verified`); continue; }
  for (const topic of topics) add({ class: cls, subject, chapter_name: chapter, topic, language: 'en', source: 'geogebra', title: picked.title, embed_url: `https://www.geogebra.org/m/${picked.id}`, page_url: `https://www.geogebra.org/m/${picked.id}`, licence: 'GeoGebra (embedded in its own player; materials CC BY-NC-SA unless the author says otherwise)' });
}
// HHMI BioInteractive: its pages refuse to be embedded and answer scripts with a block page, so none is kept.
const hhmi = await embeddable('https://www.biointeractive.org/classroom-resources/photosynthesis');
if (!hhmi.ok) dropped.push(`hhmi biointeractive: ${hhmi.why}`);
writeFileSync(out, [COLS.join(','), ...rows].join('\n') + '\n');
console.log(`wrote ${rows.length} rows to ${out}`);
for (const d of dropped) console.log('dropped:', d);
