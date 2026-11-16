// Builds scripts/seed/curated_sims.csv from scripts/sims/candidates.mjs, keeping only simulations that load and allow
// embedding (Noor, 16 Nov 2026). Run on purpose:  node scripts/sims/build_sims_csv.mjs
// Each candidate is fetched: it must answer 200, carry no X-Frame-Options that refuses a page of another site, and no
// Content-Security-Policy frame-ancestors that does. PhET's Hindi page is looked for beside the English one. A PhET
// preview picture is saved small into public/sims/ (so no third-party picture loads before a child taps).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { NASA_EYES, PHET } from './candidates.mjs';
import { OLABS_KEYWORDS, PHET_MORE, TOPIC_HI, VLABS } from './candidates-v21.mjs';

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
const seen = new Set();
const add = (r) => {
  const key = [r.embed_url, r.class, r.subject, r.topic, r.language].join("|");
  if (seen.has(key)) return;
  seen.add(key);
  rows.push(COLS.map((c) => q(r[c] ?? "")).join(","));
};
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

for (const [slug, title, cls, subject, chapter, topics] of [...PHET, ...PHET_MORE]) {
  const p = await phet(slug);
  if (!p.en.ok) { dropped.push(`phet ${slug}: ${p.en.why}`); continue; }
  const enTitle = pageTitle(p.en.text, title);
  for (const topic of topics) {
    const common = { class: cls, subject, chapter_name: chapter, topic, source: 'phet', licence: 'CC BY 4.0 (PhET Interactive Simulations, University of Colorado Boulder)', preview: p.preview, page_url: `https://phet.colorado.edu/en/simulations/${slug}` };
    add({ ...common, language: 'en', title: enTitle, embed_url: `${p.base}_en.html` });
    if (p.hi.ok) {
      add({ ...common, language: 'hi', title: p.titleHi || enTitle, embed_url: `${p.base}_hi.html` });
      if (TOPIC_HI[topic]) add({ ...common, topic: TOPIC_HI[topic], language: 'hi', title: p.titleHi || enTitle, embed_url: `${p.base}_hi.html` });
    }
  }
}
for (const [url, title, cls, subject, chapter, topics] of VLABS) {
  const r = await embeddable(url);
  if (!r.ok) { dropped.push(`virtual labs ${url}: ${r.why}`); continue; }
  for (const topic of topics) add({ class: cls, subject, chapter_name: chapter, topic, language: 'en', source: 'vlabs', title, embed_url: url, page_url: url, licence: 'Virtual Labs, Amrita Vishwa Vidyapeetham (MoE NMEICT)' });
}
// OLabs: link cards (the site refuses framing and answers scripts with 403, so its own lab listing, saved in olabs-listing.json, is trusted as it is).
const olabs = JSON.parse(readFileSync(new URL('./olabs-listing.json', import.meta.url), 'utf8'));
for (const [subject, cls, query, title] of olabs) {
  const url = `https://www.olabs.edu.in/?${query}`;
  const topics = [...new Set([title.slice(0, 190), ...OLABS_KEYWORDS.filter(([re]) => re.test(title)).map(([, t]) => t)])];
  for (const topic of topics) add({ class: String(cls), subject, chapter_name: '', topic, language: 'en', source: 'olabs', title: title.slice(0, 150), embed_url: url, page_url: url, licence: 'OLabs, CDAC and Amrita Vishwa Vidyapeetham (MoE)' });
}
for (const [url, title, cls, subject, chapter, topics] of NASA_EYES) {
  const r = await embeddable(url);
  if (!r.ok) { dropped.push(`nasa eyes ${url}: ${r.why}`); continue; }
  for (const topic of topics) add({ class: cls, subject, chapter_name: chapter, topic, language: 'en', source: 'nasa_eyes', title, embed_url: url, page_url: url, licence: 'NASA, public domain (NASA Eyes)' });
}
// HHMI BioInteractive: its pages refuse to be embedded and answer scripts with a block page, so none is kept.
const hhmi = await embeddable('https://www.biointeractive.org/classroom-resources/photosynthesis');
if (!hhmi.ok) dropped.push(`hhmi biointeractive: ${hhmi.why}`);
writeFileSync(out, [COLS.join(','), ...rows].join('\n') + '\n');
console.log(`wrote ${rows.length} rows to ${out}`);
for (const d of dropped) console.log('dropped:', d);
