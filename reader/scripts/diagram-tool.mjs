#!/usr/bin/env node
// Redrawing a chapter's diagrams without reading the whole chapter file (C527).
//   node reader/scripts/diagram-tool.mjs digest <chapter.json>             what each topic teaches, in short
//   node reader/scripts/diagram-tool.mjs apply  <chapter.json> <patchDir>  put the new diagrams in
// A patch is <patchDir>/<topic id>.json: one diagram step, or a list of them, in reader/CONTRACT.md's shape
// ({ type: "diagram", title, svg, texts, caption, alt, notice }). `apply` replaces the topic's diagram steps with the
// patch (at the place of the first one) and refuses a patch that breaks the contract's diagram rules.
import fs from 'node:fs';
import path from 'node:path';

const [cmd, file, patchDir] = process.argv.slice(2);
if (!['digest', 'apply'].includes(cmd) || !file || (cmd === 'apply' && !patchDir)) {
  console.error('usage: diagram-tool.mjs digest <chapter.json> | apply <chapter.json> <patchDir>');
  process.exit(2);
}
const chapter = JSON.parse(fs.readFileSync(file, 'utf8'));
const cut = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
const isT = (v) => v && typeof v === 'object' && typeof v.en === 'string' && typeof v.hi === 'string';
// Every bilingual text under a value, English and Hindi side by side.
function texts(v, out = []) {
  if (isT(v)) out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => texts(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'svg') texts(x, out);
  return out;
}

if (cmd === 'digest') {
  console.log(`# ${chapter.chapter_key} · Class ${chapter.class} ${chapter.subject_id} · ${chapter.title.en} / ${chapter.title.hi}`);
  console.log(`big idea: ${cut(chapter.big_idea?.en ?? '', 300)}`);
  for (const t of chapter.topics) {
    console.log(`\n## ${t.id} · ${t.title.en} / ${t.title.hi}  (NCERT: ${JSON.stringify(t.ncert ?? null)})`);
    console.log(`outcomes: ${cut(texts(t.outcomes).map((x) => x.en).join(' | '), 400)}`);
    console.log(`terms (each must appear in a diagram label): ${(t.terms ?? []).map((x) => `${x.en} = ${x.hi}`).join('; ')}`);
    for (const s of t.steps) {
      if (s.type === 'diagram') {
        const size = Buffer.byteLength(s.svg ?? '');
        console.log(`- diagram NOW (${size} B): labels ${cut(Object.values(s.texts ?? {}).map((x) => x.en).join(' · '), 300)} — alt: ${cut(s.alt?.en ?? '', 200)}`);
      } else if (s.type === 'lab') console.log(`- lab: ${s.lab ?? s.id ?? ''}`);
      else if (['hook', 'explain', 'keypoints', 'worked', 'activity'].includes(s.type)) console.log(`- ${s.type}: ${cut(texts(s).map((x) => x.en).join(' '), s.type === 'explain' ? 700 : 300)}`);
    }
  }
  process.exit(0);
}

const problems = [];
let done = 0;
for (const name of fs.readdirSync(patchDir).filter((f) => f.endsWith('.json')).sort()) {
  const id = name.slice(0, -5);
  const topic = chapter.topics.find((t) => t.id === id);
  if (!topic) { problems.push(`${name}: no topic ${id} in ${chapter.chapter_key}`); continue; }
  let patch;
  try { patch = JSON.parse(fs.readFileSync(path.join(patchDir, name), 'utf8')); } catch (e) { problems.push(`${name}: not JSON (${e.message})`); continue; }
  const steps = Array.isArray(patch) ? patch : [patch];
  const before = problems.length;
  steps.forEach((s, i) => {
    const at = `${name}[${i}]`;
    if (s.type !== 'diagram') problems.push(`${at}: type must be "diagram"`);
    for (const k of ['title', 'caption', 'alt']) if (!isT(s[k]) || !s[k].en.trim() || !s[k].hi.trim()) problems.push(`${at}: ${k} needs en and hi`);
    if (!Array.isArray(s.notice) || s.notice.length < 1 || !s.notice.every(isT)) problems.push(`${at}: notice needs at least one { en, hi }`);
    const svg = typeof s.svg === 'string' ? s.svg : '';
    if (!/^<svg[^>]*viewBox="[^"]+"/.test(svg) || !svg.trimEnd().endsWith('</svg>')) problems.push(`${at}: svg must be one <svg viewBox=…> element`);
    if (Buffer.byteLength(svg) > 12288) problems.push(`${at}: svg is ${Buffer.byteLength(svg)} B, over 12 KB`);
    if (/<script|<foreignObject|<image|<a[\s>]|\son[a-z]+\s*=|href\s*=|url\(\s*['"]?(?!#)/i.test(svg)) problems.push(`${at}: svg has a script, handler, image, link or outside resource`);
    const keys = [...svg.matchAll(/data-t="([^"]+)"/g)].map((m) => m[1]);
    for (const k of new Set(keys)) if (!isT(s.texts?.[k]) || !s.texts[k].en.trim() || !s.texts[k].hi.trim()) problems.push(`${at}: label ${k} has no en and hi text`);
    for (const k of Object.keys(s.texts ?? {})) if (!keys.includes(k)) problems.push(`${at}: text ${k} is not used by a data-t label`);
    for (const m of svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) if (/[A-Za-zऀ-ॿ]{2,}/.test(m[2])) problems.push(`${at}: a word is drawn into the svg ("${cut(m[2], 30)}"): use data-t`);
    for (const m of svg.matchAll(/@keyframes\s+([\w-]+)/g)) if (!m[1].startsWith(`${id}`) && !/^[a-z]+\d+[a-z0-9-]*-/i.test(m[1])) problems.push(`${at}: keyframes "${m[1]}" must start with the topic id "${id}-"`);
    if (/@keyframes/.test(svg) === false) problems.push(`${at}: no motion (add a gentle @keyframes step-by-step reveal or movement)`);
  });
  const said = steps.flatMap((s) => Object.values(s.texts ?? {})).map((x) => `${x.en}`.toLowerCase()).join(' | ');
  for (const term of topic.terms ?? []) if (!said.includes(term.en.toLowerCase())) problems.push(`${name}: term "${term.en}" is not in any label`);
  if (problems.length > before) continue;
  const first = topic.steps.findIndex((s) => s.type === 'diagram');
  const rest = topic.steps.filter((s) => s.type !== 'diagram');
  const place = first < 0 ? Math.min(2, rest.length) : topic.steps.slice(0, first).filter((s) => s.type !== 'diagram').length;
  topic.steps = [...rest.slice(0, place), ...steps, ...rest.slice(place)];
  done++;
}
if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s); nothing written.`);
  process.exit(1);
}
fs.writeFileSync(file, `${JSON.stringify(chapter, null, 1)}\n`);
console.log(`${chapter.chapter_key}: ${done} topic(s) redrawn`);
