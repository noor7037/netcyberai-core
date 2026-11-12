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
// Everyday Delhi-household Hindi (Noor, 12 Nov 2026): bookish words with their spoken form. A failure for Classes 1–8;
// a counted advisory for Classes 9–12 until those chapters get their clean-up pass.
const SPOKEN_HI = { 'केवल': 'सिर्फ़', 'प्रत्येक': 'हर', 'अधिक': 'ज़्यादा', 'सरल': 'आसान', 'कठिन': 'मुश्किल', 'भोजन': 'खाना', 'वृक्ष': 'पेड़', 'पुष्प': 'फूल', 'नेत्र': 'आँख', 'विद्यालय': 'स्कूल', 'पाठशाला': 'स्कूल', 'सहायता': 'मदद', 'प्रयास': 'कोशिश', 'आरंभ': 'शुरू', 'समाप्त': 'ख़त्म', 'एवं': 'और', 'तथा': 'और', 'किंतु': 'लेकिन', 'परंतु': 'लेकिन', 'अतः': 'इसलिए', 'द्वारा': 'से', 'उपरोक्त': 'ऊपर वाला', 'निम्नलिखित': 'नीचे दिए', 'यद्यपि': 'हालाँकि', 'अत्यंत': 'बहुत', 'हेतु': 'के लिए', 'संपूर्ण': 'पूरा' };
const spokenHits = (hi) => Object.keys(SPOKEN_HI).filter((w) => new RegExp(`(?<![\u0900-\u097F])${w}(?![\u0900-\u097F])`).test(hi));
const BARE_EN = /\b(heat|sunlight|grey|gray|energy|light)\b/i;
let total = 0;

for (const file of files) {
  const P = [];
  const W = [];
  const bad = (m) => P.push(m);
  let ch;
  try { ch = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.log(`${rel(file)}: not valid JSON: ${e.message}`); total++; continue; }
  if (ch.class === 1 || ch.class === 2) {
    const issues = [];
    const bad = (m) => issues.push(m);
    const pair = (v, at) => { if (!v || typeof v !== 'object' || typeof v.en !== 'string' || typeof v.hi !== 'string' || !v.en.trim() || !v.hi.trim()) bad(at + ': expected non-empty {en, hi}'); };
    const itemIds = new Set(), blooms = new Set(['remember','understand','apply']);
    const labPath = path.join(ROOT,'labs','defs','c01',ch.subject_id || '',(ch.chapter_key || '') + '.json');
    let labMap = new Map();
    try { for (const l of JSON.parse(fs.readFileSync(labPath,'utf8')).labs || []) labMap.set(l.id,l); } catch { bad('missing or invalid Class 1 lab definition'); }
    for (const k of ['chapter_key','subject_id','book','number']) if (ch[k] == null) bad('missing ' + k);
    if (path.basename(file) !== (ch.chapter_key + '.json')) bad('file name must match chapter_key');
    pair(ch.title,'title'); pair(ch.big_idea,'big_idea');
    if (!Array.isArray(ch.outcomes) || ch.outcomes.length < 3) bad('outcomes: need at least 3'); else ch.outcomes.forEach((v,i)=>pair(v,'outcomes['+i+']'));
    if (!ch.hook) bad('chapter hook missing'); else { pair(ch.hook.scene,'hook.scene'); pair(ch.hook.question,'hook.question'); }
    if (ch.test != null) bad('Class 1 must not include a chapter test');
    const topics = Array.isArray(ch.topics) ? ch.topics : [];
    if (topics.length < 3 || topics.length > 8) bad('Class 1 chapter needs 3–8 short topics');
    if (ch.hook && !topics.some(t=>t.id===ch.hook.answered_in)) bad('hook.answered_in must name a topic');
    const checkItem = (it,where) => {
      if (!it || it.type !== 'mcq') { bad(where + ': Class 1 checks use picture-word MCQs'); return; }
      if (!it.id || itemIds.has(it.id)) bad(where + ': missing or duplicate id'); else itemIds.add(it.id);
      if (!blooms.has(it.bloom)) bad(where + ': bloom must be remember, understand or apply');
      pair(it.q,where+'.q');
      if (!Array.isArray(it.options) || it.options.length < 2 || it.options.length > 3) bad(where + ': needs 2 or 3 options'); else it.options.forEach((v,i)=>pair(v,where+'.options['+i+']'));
      if (!Number.isInteger(it.answer) || it.answer < 0 || it.answer >= (it.options || []).length) bad(where + ': answer index invalid');
      if (!Array.isArray(it.why) || it.why.length !== (it.options || []).length) bad(where + ': why must explain each option'); else it.why.forEach((v,i)=>pair(v,where+'.why['+i+']'));
    };
    topics.forEach((t,ti)=>{
      const w='topics['+ti+'] '+t.id, steps=Array.isArray(t.steps)?t.steps:[], types=steps.map(s=>s.type);
      if (!/^t\d\d$/.test(t.id || '')) bad(w + ': id must look like t01');
      pair(t.title,w+'.title'); pair(t.short,w+'.short');
      if (!(t.minutes >= 4 && t.minutes <= 8)) bad(w + ': duration must be 4–8 minutes');
      if (!Array.isArray(t.outcomes) || !t.outcomes.length) bad(w + ': needs an outcome'); else t.outcomes.forEach((v,i)=>pair(v,w+'.outcomes['+i+']'));
      if (!Array.isArray(t.terms) || !t.terms.length) bad(w + ': needs key terms'); else t.terms.forEach((v,i)=>{ if(!v.en || !v.hi) bad(w+'.terms['+i+']: needs en and hi'); pair(v.gloss,w+'.terms['+i+'].gloss'); });
      for (const required of ['hook','explain','diagram','guided','keypoints','close']) if (!types.includes(required)) bad(w + ': missing ' + required + ' step');
      if (!types.includes('lab')) pair(t.why_no_lab,w+'.why_no_lab');
      const diagramWords=[];
      steps.forEach((s,si)=>{
        const sw=w+'.steps['+si+'] '+s.type;
        if (s.type==='hook') { pair(s.scene,sw+'.scene'); pair(s.question,sw+'.question'); }
        if (s.type==='explain') { pair(s.title,sw+'.title'); pair(s.plain,sw+'.plain'); if(!Array.isArray(s.body)||!s.body.length) bad(sw+': needs short explanation lines'); else s.body.forEach((v,i)=>pair(v,sw+'.body['+i+']')); }
        if (s.type==='diagram') {
          pair(s.title,sw+'.title'); pair(s.caption,sw+'.caption'); pair(s.alt,sw+'.alt');
          const svg=String(s.svg||'');
          if (!/^\s*<svg[\s>]/.test(svg) || !/<\/svg>\s*$/.test(svg) || !/viewBox=/.test(svg)) bad(sw+': needs one inline SVG with viewBox');
          if (/<script|<foreignObject|<image|\son\w+\s*=|href\s*=\s*["'](?!#)/i.test(svg)) bad(sw+': unsafe SVG content');
          if (svg.length > 14000) bad(sw+': SVG exceeds 14 KB');
          const keys=[...svg.matchAll(/data-t="([^"]+)"/g)].map(m=>m[1]);
          if (!keys.length) bad(sw+': needs bilingual data-t labels');
          keys.forEach(k=>{ if(!s.texts || !s.texts[k]) bad(sw+': missing text binding '+k); else { pair(s.texts[k],sw+'.texts.'+k); diagramWords.push(String(s.texts[k].en||'').toLowerCase()); } });
        }
        if (s.type==='lab') {
          pair(s.before,sw+'.before'); pair(s.after,sw+'.after');
          const def=labMap.get(s.lab);
          if (!def) bad(sw+': lab id not found in chapter definition');
          else if (Array.isArray(t.ncert) && t.ncert.length && def.topic !== t.ncert[0]) bad(sw+': lab topic does not match syllabus topic');
        }
        if (s.type==='guided') { checkItem(s.item,sw+'.item'); pair(s.hint,sw+'.hint'); }
        if (s.type==='keypoints') { if(!Array.isArray(s.points)||s.points.length<2||s.points.length>4) bad(sw+': needs 2–4 key points'); else s.points.forEach((v,i)=>pair(v,sw+'.points['+i+']')); }
        if (s.type==='close') { if(!['hook','chapter'].includes(s.answers)) bad(sw+': close answers must be hook or chapter'); pair(s.text,sw+'.text'); }
      });
      for (const term of (t.terms || [])) if (term.en && !diagramWords.some(w=>w.includes(String(term.en).toLowerCase()))) bad(w+': key term '+term.en+' is missing from the diagram');
      const pool=(t.check && t.check.items)||[];
      if (pool.length !== 4 || !t.check || t.check.draw !== 3 || t.check.pass !== 2) bad(w+'.check: needs 4 questions, draw 3, feedback target 2; progress is never locked');
      pool.forEach((v,i)=>checkItem(v,w+'.check.items['+i+']'));
    });
    if (ch.hook && ch.hook.answered_in) { const last=topics.find(t=>t.id===ch.hook.answered_in); if(!last || !last.steps.some(s=>s.type==='close' && s.answers==='chapter')) bad('the final hook must be answered by a chapter close step'); }
    // Shared rules every band follows: spoken Hindi, no LaTeX, no bare English in Hindi prose, readable diagram
    // labels at phone width, images that exist, and a credit for every open-licensed photo (PH- names).
    const assetDirF = path.join(ROOT, 'labs', 'assets', `c${String(ch.class).padStart(2, '0')}`, ch.subject_id || '');
    (function sweep(x, where) {
      if (Array.isArray(x)) return x.forEach((v, i) => sweep(v, `${where}[${i}]`));
      if (!x || typeof x !== 'object') return;
      if (typeof x.hi === 'string' && typeof x.en === 'string') {
        for (const w of BANNED_HI) if (x.hi.includes(w)) bad(`${where}: Hindi uses "${w}" (spoken Hindi: CONTRACT §1)`);
        for (const w of spokenHits(x.hi)) bad(`${where}: say "${SPOKEN_HI[w]}", not "${w}" (everyday Hindi)`);
        for (const lang of ['en', 'hi']) { const m = String(x[lang]).match(/\\[A-Za-z]+|[\^_]\{/); if (m) bad(`${where}: LaTeX "${m[0]}" in ${lang}`); }
      }
      if (x.type === 'diagram' && typeof x.svg === 'string') {
        const fonts = [...x.svg.matchAll(/font-size\s*[=:]\s*"?([\d.]+)/g)].map((m) => +m[1]).filter((v) => v >= 2);
        const vbw = +((x.svg.match(/viewBox\s*=\s*"[\d.\s-]*?([\d.]+)\s+[\d.]+\s*"/) || [])[1] || 360);
        if (fonts.length && (Math.min(...fonts) * 360) / vbw < 13) bad(`${where}: diagram labels too small for a young child at phone width (keep the viewBox about 360 wide, labels 15+)`);
      }
      if (x.type === 'figure' || x.type === 'hook' || x.image) {
        const names = x.type === 'figure' ? x.images || [] : x.image ? [x.image] : [];
        for (const n of names) {
          if (!fs.existsSync(path.join(assetDirF, `${n}.webp`))) bad(`${where}: image ${n} not found in labs/assets/c${String(ch.class).padStart(2, '0')}/${ch.subject_id}/`);
          if (/^PH-/.test(n) && !(typeof x.credit === 'string' && /CC0|CC BY|Public domain|Unsplash|Pexels|Pixabay|GODL|NASA/i.test(x.credit))) bad(`${where}: open-licensed photo ${n} needs "credit": "<author>, <source>, <licence>" (allowed: CC0, CC BY, CC BY-SA, public domain, Unsplash, Pexels, Pixabay licence)`);
        }
      }
      for (const [k, v] of Object.entries(x)) if (k !== 'svg' && k !== 'en') sweep(v, `${where}.${k}`);
    })(ch, 'chapter');
    total += issues.length;
    console.log(file.replace(ROOT + path.sep,'') + ': ' + (issues.length ? issues.length+' problems' : 'ok') + ' — ' + topics.length + ' short topics, ' + topics.reduce((n,t)=>n+((t.check&&t.check.items)||[]).length,0) + ' formative items, no chapter test');
    issues.forEach(m=>console.log('  - '+m));
    continue;
  }
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
      for (const w of spokenHits(x.hi)) { if (ch.class <= 8) bad(`${where}: say "${SPOKEN_HI[w]}", not "${w}" (everyday Hindi)`); else W.push(`spoken Hindi: "${w}" → "${SPOKEN_HI[w]}"`); }
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
  const spokenW = W.filter((w) => w.startsWith('spoken Hindi')).length;
  console.log(`${rel(file)}: ${P.length ? P.length + ' problems' : 'ok'}${DRAFT ? ` (draft, ${W.length - spokenW} quality warnings)` : ''}${spokenW ? ` [${spokenW} bookish Hindi words to clean]` : ''} — ${counts}`);
  P.slice(0, 60).forEach((m) => console.log('  - ' + m));
  if (P.length > 60) console.log(`  … ${P.length - 60} more`);
}
function rel(p) { return path.relative(ROOT, p); }
process.exit(total ? 1 : 0);
