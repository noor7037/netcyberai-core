#!/usr/bin/env node
// Checks chapter files for the NetCyberAI reader against reader/CONTRACT.md.
// Usage: node reader/scripts/check.mjs [file.json | dir]   (default: every file under reader/content)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const READER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(READER, '..');
// Options for a chapter that is not in the repository yet (an outside AI's delivery in content-inbox/):
//   --labs <file>   the chapter's labs file (labs/defs format) instead of labs/defs/…
//   --plan <csv>    the subject's image plan; planned file names count as existing images
const opt = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const LABS_OVERRIDE = opt('--labs') ? path.resolve(opt('--labs')) : null;
const PLANNED = new Set();
if (opt('--plan')) for (const line of fs.readFileSync(path.resolve(opt('--plan')), 'utf8').split(/\r?\n/).slice(1)) { const f = line.replace(/^\uFEFF/, '').split(',')[0].trim(); if (f) PLANNED.add(f.replace(/\.(png|jpe?g|webp)$/i, '')); }
const positional = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));
const arg = positional[0] ? path.resolve(positional[0]) : path.join(READER, 'content');
const files = fs.statSync(arg).isDirectory() ? walk(arg).filter((f) => f.endsWith('.json') && !['index.json', 'book.json', 'books.json'].includes(path.basename(f))) : [arg];
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])); }

const DEV = /[\u0900-\u097F]/;
// A text that is only formulas, equations, numbers or symbols reads the same in both languages.
const formulaOnly = (s) => !/[a-z]{3,}/.test(s.replace(/\{\{eq:[^}]*\}\}/g, '').replace(/\((s|l|g|aq)\)/g, '').replace(/\b(sin|cos|tan|cot|sec|cosec|log|lim|max|min|mod|HCF|LCM)\b/gi, ''));
const STEP_TYPES = new Set(['retrieve', 'hook', 'explain', 'diagram', 'figure', 'equation', 'table', 'activity', 'worked', 'lab', 'guided', 'misconception', 'keypoints', 'examtip', 'close']);
const REQUIRED = ['retrieve', 'explain', 'worked', 'guided', 'misconception', 'keypoints'];
const BLOOM = new Set(['remember', 'understand', 'apply', 'analyse', 'evaluate', 'create']);
const AUTO = new Set(['mcq', 'ar', 'case']);
// Bookish or wrong Hindi the founder ruled out (feedback part 2 §2–§8): never in a "hi" string.
const BANNED_HI = ['फाटक', 'प्रयोगशाला', 'अध्याय परीक्षा', 'आदर्श उत्तर', 'हल-और-परीक्षण', 'धूसर', 'तश्तरी', 'प्रायः', 'गहरी बोतल', 'रंग का रंग', 'अधोलेख', 'चकाचौंध', 'स्वयं', 'आवश्यक', 'वायुरोधी', 'धूम-कक्ष', 'धुआँ-कक्ष', 'बहुविकल्पी', 'उत्तीर्ण', 'सम्पर्क', 'गतिविधि', 'किग्रा', 'पीछा करो', 'शुभ संख्या', 'रेफ़्रिजरेटर'];
const BARE_EN = /\b(heat|sunlight|grey|gray|energy|light)\b/i;
let total = 0;

for (const file of files) {
  const P = [];
  const W = [];
  const bad = (m) => P.push(m);
  let ch;
  try { ch = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.log(`${rel(file)}: not valid JSON: ${e.message}`); total++; continue; }
  const assetDir = path.join(ROOT, 'labs', 'assets', `c${String(ch.class).padStart(2, '0')}`, ch.subject_id || '');
  const labFile = LABS_OVERRIDE || path.join(ROOT, 'labs', 'defs', `c${String(ch.class).padStart(2, '0')}`, ch.subject_id || '', `${ch.chapter_key}.json`);
  let labIds = new Set();
  try { labIds = new Set(JSON.parse(fs.readFileSync(labFile, 'utf8')).labs.map((l) => l.id)); } catch (e) { bad(`no labs/defs file at ${rel(labFile)}`); }
  const ids = new Set();
  const answers = [];
  const usedImages = new Set();

  const T = (x, where, opt) => {
    if (x == null) { if (!opt) bad(`${where}: missing text`); return; }
    if (typeof x !== 'object' || typeof x.en !== 'string' || typeof x.hi !== 'string') return bad(`${where}: must be {en, hi}`);
    if (!x.en.trim()) bad(`${where}: empty English`);
    if (!x.hi.trim()) bad(`${where}: empty Hindi`);
    else if (!DEV.test(x.hi) && !(x.hi.trim() === x.en.trim() && formulaOnly(x.en))) bad(`${where}: Hindi has no Devanagari`);
  };
  const TA = (a, where, min = 1) => { if (!Array.isArray(a) || a.length < min) return bad(`${where}: needs at least ${min}`); a.forEach((x, i) => T(x, `${where}[${i}]`)); };
  const img = (name, where) => {
    if (typeof name !== 'string') return bad(`${where}: image name must be a string`);
    usedImages.add(name);
    if (!PLANNED.has(name) && !fs.existsSync(path.join(assetDir, `${name}.webp`))) bad(`${where}: image ${name} not found in ${rel(assetDir)}`);
  };
  const mcqParts = (o, where) => {
    T(o.q, `${where}.q`);
    if (!Array.isArray(o.options) || o.options.length !== 4) bad(`${where}: needs 4 options`); else o.options.forEach((x, i) => {
      T(x, `${where}.options[${i}]`);
      // A Hindi option must not carry a bracketed Hindi addition its English lacks (it gives the answer away).
      if (x && x.hi && x.en && !x.en.includes('(') && /\([^)]*[\u0900-\u097F][^)]*\)/.test(x.hi)) bad(`${where}.options[${i}]: Hindi adds a bracketed note the English does not have`);
    });
    if (!Number.isInteger(o.answer) || o.answer < 0 || o.answer > 3) bad(`${where}: answer must be 0–3`); else answers.push(o.answer);
    if (!Array.isArray(o.why) || o.why.length !== 4) bad(`${where}: why must explain all 4 options`); else o.why.forEach((x, i) => T(x, `${where}.why[${i}]`));
  };
  const item = (it, where, autoOnly) => {
    if (!it || typeof it !== 'object') return bad(`${where}: missing item`);
    if (!it.id) bad(`${where}: no id`); else if (ids.has(it.id)) bad(`${where}: duplicate id ${it.id}`); else ids.add(it.id);
    if (!BLOOM.has(it.bloom)) bad(`${where}: bloom must be one of ${[...BLOOM].join('/')}`);
    if (autoOnly && !AUTO.has(it.type)) bad(`${where}: must be auto-marked (mcq, ar, case), got ${it.type}`);
    if (it.type === 'mcq') mcqParts(it, where);
    else if (it.type === 'ar') {
      T(it.assertion, `${where}.assertion`); T(it.reason, `${where}.reason`);
      if (!Number.isInteger(it.answer) || it.answer < 0 || it.answer > 3) bad(`${where}: answer must be 0–3`);
      if (!Array.isArray(it.why) || it.why.length !== 4) bad(`${where}: why must explain all 4 options`); else it.why.forEach((x, i) => T(x, `${where}.why[${i}]`));
    } else if (it.type === 'case') {
      T(it.stem, `${where}.stem`);
      if (it.image) img(it.image, `${where}.image`);
      if (!Array.isArray(it.parts) || it.parts.length < 2 || it.parts.length > 4) bad(`${where}: case needs 2–4 parts`); else it.parts.forEach((p, i) => mcqParts(p, `${where}.parts[${i}]`));
    } else if (it.type === 'short' || it.type === 'long') {
      T(it.q, `${where}.q`); T(it.model, `${where}.model`);
      const m = it.marks;
      if (it.type === 'short' && ![2, 3].includes(m)) bad(`${where}: short marks must be 2 or 3`);
      if (it.type === 'long' && m !== 5) bad(`${where}: long marks must be 5`);
      if (!Array.isArray(it.rubric) || it.rubric.length !== m) bad(`${where}: rubric needs one point per mark (${m})`); else it.rubric.forEach((x, i) => T(x, `${where}.rubric[${i}]`));
    } else bad(`${where}: unknown item type ${it.type}`);
  };
  const marksOf = (it) => (it.type === 'case' ? (it.parts || []).length : it.type === 'short' || it.type === 'long' ? it.marks || 0 : 1);

  // A published draft ("status": "draft") must pass every correctness rule; the quality bars that its writer is still
  // meeting (label size at phone width, the lab share, unused images) are reported as warnings until it is upgraded.
  const DRAFT = ch.status === 'draft';
  const soft = (m) => (DRAFT ? W.push(m) : bad(m));
  for (const k of ['chapter_key', 'class', 'subject_id', 'number']) if (ch[k] == null) bad(`missing ${k}`);
  if (path.basename(file) !== `${ch.chapter_key}.json`) bad(`file name must be ${ch.chapter_key}.json`);
  T(ch.title, 'title'); T(ch.big_idea, 'big_idea'); TA(ch.outcomes, 'outcomes', 3);
  const topics = Array.isArray(ch.topics) ? ch.topics : [];
  if (topics.length < 4 || topics.length > 10) bad(`topics: ${topics.length} (want 4–10)`);
  const topicIds = new Set(topics.map((t) => t.id));
  if (!ch.hook) bad('chapter hook missing'); else {
    T(ch.hook.scene, 'hook.scene'); T(ch.hook.question, 'hook.question');
    if (ch.hook.image) img(ch.hook.image, 'hook.image');
    if (!topicIds.has(ch.hook.answered_in)) bad(`hook.answered_in ${ch.hook.answered_in} is not a topic`);
    else { const t = topics.find((x) => x.id === ch.hook.answered_in); if (!t.steps.some((s) => s.type === 'close' && s.answers === 'chapter')) bad(`topic ${t.id} must have a close step with answers: "chapter"`); }
  }

  topics.forEach((t, ti) => {
    const w = `topics[${ti}] ${t.id}`;
    if (!/^t\d\d$/.test(t.id || '')) bad(`${w}: id must look like t01`);
    T(t.title, `${w}.title`); T(t.short, `${w}.short`); TA(t.outcomes, `${w}.outcomes`);
    if (!Array.isArray(t.terms) || !t.terms.length) bad(`${w}: needs key terms`); else t.terms.forEach((x, i) => { if (!x.en || !DEV.test(x.hi || '')) bad(`${w}.terms[${i}]: needs en and Devanagari hi`); T(x.gloss, `${w}.terms[${i}].gloss`); });
    const steps = Array.isArray(t.steps) ? t.steps : [];
    const types = steps.map((s) => s.type);
    for (const r of REQUIRED) if (!types.includes(r)) bad(`${w}: missing a ${r} step`);
    if (types[0] !== 'retrieve') bad(`${w}: the first step must be retrieve`);
    const hooks = steps.filter((s) => s.type === 'hook').length, closes = steps.filter((s) => s.type === 'close' && s.answers === 'hook').length;
    if (hooks && !closes) bad(`${w}: has a hook but no close step that answers it`);
    const firstExplain = types.indexOf('explain');
    steps.forEach((s, si) => {
      const sw = `${w}.steps[${si}] ${s.type}`;
      if (!STEP_TYPES.has(s.type)) return bad(`${sw}: unknown step type`);
      switch (s.type) {
        case 'retrieve': item(s.item, `${sw}.item`, true); T(s.from, `${sw}.from`); break;
        case 'hook': T(s.scene, `${sw}.scene`); T(s.question, `${sw}.question`); if (s.image) img(s.image, `${sw}.image`); break;
        case 'explain': T(s.title, `${sw}.title`); T(s.plain, `${sw}.plain`); TA(s.body, `${sw}.body`); T(s.board, `${sw}.board`, true); if (s.points) TA(s.points, `${sw}.points`); break;
        case 'diagram': {
          T(s.title, `${sw}.title`); T(s.caption, `${sw}.caption`); T(s.alt, `${sw}.alt`); if (s.notice) TA(s.notice, `${sw}.notice`);
          const svg = String(s.svg || '');
          if (!/^\s*<svg[\s>]/.test(svg) || !/<\/svg>\s*$/.test(svg)) bad(`${sw}: svg must be one <svg>…</svg> element`);
          if (!/viewBox=/.test(svg)) bad(`${sw}: svg needs a viewBox`);
          if (/<script|<foreignObject|<image|\son\w+\s*=|href\s*=\s*["'](?!#)/i.test(svg)) bad(`${sw}: svg has script, foreignObject, image, an on… handler or an external link`);
          const fonts = [...svg.matchAll(/font-size\s*[=:]\s*"?([\d.]+)/g)].map((m) => +m[1]).filter((v) => v >= 2);
          const vbw = +((svg.match(/viewBox\s*=\s*"[\d.\s-]*?([\d.]+)\s+[\d.]+\s*"/) || [])[1] || 360);
          const eff = fonts.length ? (Math.min(...fonts) * 360) / vbw : 99;
          if (eff < 11) soft(`${sw}: the smallest label is ${Math.min(...fonts)} on a ${vbw}-wide viewBox, about ${eff.toFixed(1)} at phone width (keep the viewBox about 360 wide and labels 13+, never under 11)`);
          if (svg.length > 14000) bad(`${sw}: svg is ${svg.length} characters (keep it under about 12 KB)`);
          const keys = [...svg.matchAll(/data-t="([^"]+)"/g)].map((m) => m[1]);
          if (!keys.length) bad(`${sw}: svg has no <text data-t> labels; a full-topic diagram needs its words`);
          for (const k of keys) { if (!s.texts || !s.texts[k]) bad(`${sw}: texts.${k} missing`); else T(s.texts[k], `${sw}.texts.${k}`); }
          for (const m of svg.matchAll(/<text(?![^>]*data-t=)[^>]*>([^<]*)<\/text>/g)) if (/[A-Za-z]{3,}|[\u0900-\u097F]/.test(m[1].replace(/[A-Z][a-z]?\d*/g, ''))) bad(`${sw}: words written straight into the svg ("${m[1].slice(0, 30)}"); use <text data-t>`);
          break;
        }
        case 'figure':
          if (!Array.isArray(s.images) || !s.images.length) bad(`${sw}: needs images`); else s.images.forEach((n, i) => img(n, `${sw}.images[${i}]`));
          T(s.caption, `${sw}.caption`); T(s.alt, `${sw}.alt`); TA(s.notice, `${sw}.notice`);
          (s.labels || []).forEach((l, i) => { T(l.text, `${sw}.labels[${i}]`); if (!(l.x >= 0 && l.x <= 100 && l.y >= 0 && l.y <= 100)) bad(`${sw}.labels[${i}]: x and y must be 0–100`); });
          break;
        case 'equation': if (typeof s.eq !== 'string' || !s.eq.includes('->')) bad(`${sw}: eq must contain ->`); T(s.say, `${sw}.say`); T(s.note, `${sw}.note`, true); break;
        case 'table': T(s.caption, `${sw}.caption`); TA(s.head, `${sw}.head`); if (!Array.isArray(s.rows) || !s.rows.length) bad(`${sw}: needs rows`); else s.rows.forEach((r, i) => { if (!Array.isArray(r) || r.length !== s.head.length) bad(`${sw}.rows[${i}]: needs ${s.head.length} cells`); else r.forEach((c, j) => T(c, `${sw}.rows[${i}][${j}]`)); }); break;
        case 'activity': if (!/^Activity \d+\.\d+$/.test(s.ncert || '')) bad(`${sw}: ncert must look like "Activity 1.6"`); T(s.title, `${sw}.title`); TA(s.materials, `${sw}.materials`); TA(s.steps, `${sw}.steps`); T(s.observe, `${sw}.observe`); T(s.explain, `${sw}.explain`); T(s.safety, `${sw}.safety`, true); if (s.image) img(s.image, `${sw}.image`); break;
        case 'worked': T(s.problem, `${sw}.problem`); TA(s.steps, `${sw}.steps`, 2); T(s.answer, `${sw}.answer`); if (!s.faded) bad(`${sw}: needs a faded "your turn"`); else { T(s.faded.problem, `${sw}.faded.problem`); TA(s.faded.shown, `${sw}.faded.shown`); item(s.faded.item, `${sw}.faded.item`, true); } break;
        case 'lab': if (!labIds.has(s.lab)) bad(`${sw}: lab ${s.lab} not in ${rel(labFile)}`); if (si < firstExplain) bad(`${sw}: a lab must come after the explain step`); T(s.before, `${sw}.before`); T(s.after, `${sw}.after`); break;
        case 'guided': item(s.item, `${sw}.item`, true); T(s.hint, `${sw}.hint`); break;
        case 'misconception': T(s.wrong, `${sw}.wrong`); T(s.right, `${sw}.right`); T(s.why, `${sw}.why`); break;
        case 'keypoints': TA(s.points, `${sw}.points`, 3); break;
        case 'examtip': T(s.tip, `${sw}.tip`); T(s.marks, `${sw}.marks`, true); if (si < firstExplain) bad(`${sw}: exam tip must come after the concept`); break;
        case 'close': if (!['hook', 'chapter'].includes(s.answers)) bad(`${sw}: answers must be hook or chapter`); T(s.text, `${sw}.text`); break;
      }
    });
    if (!types.includes('diagram')) bad(`${w}: no diagram step — every topic needs a full-topic visual`);
    else {
      // "Everything is defined, everything is visual": each key term of the topic appears in the topic's diagrams.
      const words = steps.filter((x) => x.type === 'diagram').flatMap((x) => Object.values(x.texts || {}).map((v) => (v && v.en ? v.en.toLowerCase() : ''))).join(' | ');
      for (const term of t.terms || []) {
        const stem = String(term.en || '').toLowerCase().replace(/\(.*?\)/g, '').trim().replace(/(es|s)$/, '');
        if (stem && !words.includes(stem)) bad(`${w}: key term "${term.en}" is not shown in any of the topic's diagrams`);
      }
    }
    if (!types.includes('lab')) T(t.why_no_lab, `${w}.why_no_lab (no lab step, so say in one line why none is needed)`);
    const pool = (t.check && t.check.items) || [];
    if (pool.length !== 8) bad(`${w}.check: needs exactly 8 items, has ${pool.length}`);
    if (!t.check || t.check.draw !== 5 || t.check.pass !== 4) bad(`${w}.check: draw must be 5 and pass 4`);
    pool.forEach((it, i) => item(it, `${w}.check.items[${i}]`, true));
  });

  // A lab wherever the topic needs one: at most 30% of a chapter's topics may go without (each with its reason).
  const noLab = topics.filter((t) => !(t.steps || []).some((x) => x.type === 'lab'));
  if (topics.length && noLab.length > Math.ceil(0.3 * topics.length)) soft(`${noLab.length} of ${topics.length} topics have no lab (${noLab.map((t) => t.id).join(', ')}); at most ${Math.ceil(0.3 * topics.length)} may go without — build or reuse a lab (labs/CONTRACT.md, skill §6)`);
  const test = (ch.test && ch.test.items) || [];
  if (test.length !== 20) bad(`test: needs 20 items, has ${test.length}`);
  if (!ch.test || ch.test.pass !== 0.7) bad('test.pass must be 0.7');
  test.forEach((it, i) => item(it, `test.items[${i}]`, false));
  const n = (k) => test.filter((x) => x.type === k).length;
  if (n('case') < 3) bad(`test: needs at least 3 case items (has ${n('case')})`);
  if (n('ar') < 3) bad(`test: needs at least 3 assertion-reason items (has ${n('ar')})`);
  if (n('short') < 4) bad(`test: needs at least 4 short items (has ${n('short')})`);
  if (n('long') < 1) bad(`test: needs at least 1 long item (has ${n('long')})`);
  const marks = test.reduce((a, x) => a + marksOf(x), 0);
  const constructed = test.filter((x) => x.type === 'short' || x.type === 'long').reduce((a, x) => a + marksOf(x), 0);
  const comp = test.filter((x) => x.type === 'case' || x.type === 'ar' || (x.type === 'mcq' && x.comp)).reduce((a, x) => a + marksOf(x), 0);
  const plain = test.filter((x) => x.type === 'mcq' && !x.comp).reduce((a, x) => a + marksOf(x), 0);
  const pc = (v) => Math.round((v / marks) * 100);
  if (marks && (pc(comp) < 45 || pc(comp) > 55 || pc(plain) < 15 || pc(plain) > 25 || pc(constructed) < 25 || pc(constructed) > 35)) bad(`test mix by marks is ${pc(comp)}/${pc(plain)}/${pc(constructed)} (competency/plain MCQ/constructed); CBSE wants 50/20/30 (45–55, 15–25, 25–35)`);
  // Spoken-Hindi and language-hygiene sweep over every "hi" string in the chapter.
  (function sweep(x, where) {
    if (Array.isArray(x)) return x.forEach((v, i) => sweep(v, `${where}[${i}]`));
    if (!x || typeof x !== 'object') return;
    if (typeof x.hi === 'string' && typeof x.en === 'string') {
      for (const w of BANNED_HI) if (x.hi.includes(w)) bad(`${where}: Hindi uses "${w}" (see CONTRACT §1)`);
      for (const lang of ['en', 'hi']) { const m = String(x[lang]).match(/\\[A-Za-z]+|[\^_]\{/); if (m) bad(`${where}: LaTeX "${m[0]}" in ${lang}; write maths as plain symbols (π, ×, ², √, ∠, θ, °)`); }
      const bare = x.hi.replace(/\{\{eq:[^}]*\}\}/g, '').replace(/\([^)]*[A-Za-z][^)]*\)/g, '');
      if (BARE_EN.test(bare)) bad(`${where}: English word "${bare.match(BARE_EN)[0]}" left in Hindi prose`);
    }
    for (const [k, v] of Object.entries(x)) if (k !== 'svg' && k !== 'en') sweep(v, `${where}.${k}`);
  })(ch, 'chapter');
  if (answers.length >= 20) {
    const c = [0, 0, 0, 0]; answers.forEach((a) => c[a]++);
    const top = Math.max(...c) / answers.length;
    if (top > 0.35) bad(`answer spread: one option index holds ${Math.round(top * 100)}% of MCQ answers (${c.join('/')}); keep each under 35%`);
  }
  const unused = fs.existsSync(assetDir) ? fs.readdirSync(assetDir).filter((f) => new RegExp(`^C${String(ch.class).padStart(2, '0')}-[A-Z]+-CH${String(ch.number).padStart(2, '0')}-`).test(f) && f.endsWith('.webp') && !f.endsWith('.640.webp')).map((f) => f.slice(0, -5)).filter((nm) => !usedImages.has(nm)) : [];
  if (unused.length) soft(`images of this chapter not used: ${unused.join(', ')}`);

  total += P.length;
  const counts = `${topics.length} topics, ${topics.reduce((a, t) => a + ((t.check && t.check.items) || []).length, 0)} topic items, ${test.length} test items (${marks} marks), ${usedImages.size} images`;
  console.log(`${rel(file)}: ${P.length ? P.length + ' problems' : 'ok'}${DRAFT ? ` (draft, ${W.length} quality warnings)` : ''} — ${counts}`);
  P.slice(0, 60).forEach((m) => console.log('  - ' + m));
  if (P.length > 60) console.log(`  … ${P.length - 60} more`);
}
function rel(p) { return path.relative(ROOT, p); }
process.exit(total ? 1 : 0);
