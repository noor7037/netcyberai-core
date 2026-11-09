#!/usr/bin/env node
// NetCyberAI Labs checker. Loads every template under Node and checks every lab definition against the contract
// (labs/CONTRACT.md): the chapter exists in the syllabus, each lab's config passes its template's validate(), each
// guided "do" step names a target and an event the template declares, the steps are complete and bilingual, every
// check item explains every wrong option, and the image rows are well formed.
// Usage: node labs/scripts/check.mjs [path under labs/defs to check only that] [--templates-only]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LABS = path.resolve(HERE, '..');
const ROOT = path.resolve(LABS, '..');
const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith('--'));
const templatesOnly = args.includes('--templates-only');

// ---- load templates ----
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(path.join(LABS, 'lib.js'), 'utf8'), { filename: 'lib.js' });
const tplErrors = [];
for (const f of fs.readdirSync(path.join(LABS, 'templates')).filter((f) => f.endsWith('.js'))) {
  try {
    vm.runInThisContext(fs.readFileSync(path.join(LABS, 'templates', f), 'utf8'), { filename: f });
    const id = f.replace(/\.js$/, '');
    const T = globalThis.NCA_T.get(id);
    if (!T) { tplErrors.push(`${f}: does not register a template with id "${id}"`); continue; }
    const de = T.validate(T.demo || {});
    if (de.length) tplErrors.push(`${f}: its own demo config fails validate(): ${de.join('; ')}`);
    const k = T.keys(T.demo || {});
    if (!k || !Array.isArray(k.targets) || !Array.isArray(k.events)) tplErrors.push(`${f}: keys() must return { targets: [], events: [] }`);
  } catch (e) {
    tplErrors.push(`${f}: ${e.message}`);
  }
}
const catalogue = JSON.parse(fs.readFileSync(path.join(LABS, 'catalogue.json'), 'utf8'));

// ---- syllabus ----
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift().map((h) => h.replace(/^﻿/, ''));
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const chapters = new Map(parseCSV(fs.readFileSync(path.join(ROOT, 'data/content/universal/syllabus/chapters.csv'), 'utf8')).map((c) => [c.key, c]));

// ---- labs ----
const DEV = /[ऀ-ॿ]/;
const bi = (x, where, errs) => {
  if (typeof x === 'string') { if (!x.trim()) errs.push(`${where}: empty`); return; }
  if (!x || typeof x !== 'object' || !x.en || !x.hi) { errs.push(`${where}: needs both en and hi`); return; }
  if (!DEV.test(x.hi)) errs.push(`${where}: hi is not in Devanagari`);
};
const KINDS = ['OBJ', 'SCN', 'CUT', 'SEQ', 'MAC', '3DM', 'MAP', 'DIA'];
const ids = new Map();
let files = 0, labs = 0, images = 0, topics = 0, noLab = 0;
const problems = [];
function walk(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.json') ? [path.join(dir, d.name)] : [])) : []; }
const defsDir = path.join(LABS, 'defs');
const target = only ? path.resolve(only) : defsDir;
for (const file of templatesOnly ? [] : walk(fs.statSync(target).isDirectory() ? target : path.dirname(target)).filter((f) => !only || f.startsWith(target))) {
  files++;
  const rel = path.relative(LABS, file);
  const errs = [];
  let ch;
  try { ch = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { problems.push({ file: rel, errors: ['not valid JSON: ' + e.message] }); continue; }
  const syl = chapters.get(ch.chapter_key);
  if (!syl) errs.push(`chapter_key ${ch.chapter_key} is not in the syllabus`);
  else {
    if (Number(syl.class) !== ch.class) errs.push(`class ${ch.class} does not match the syllabus (${syl.class})`);
    if (syl.subject_id !== ch.subject_id) errs.push(`subject_id ${ch.subject_id} does not match the syllabus (${syl.subject_id})`);
    if (path.basename(file) !== ch.chapter_key + '.json') errs.push('file name must be <chapter_key>.json');
  }
  if (!Array.isArray(ch.topics) || !ch.topics.length) errs.push('topics: at least one');
  const topicNs = new Set((ch.topics || []).map((x) => String(x.n)));
  for (const tp of ch.topics || []) {
    topics++;
    if (!tp.title) errs.push(`topic ${tp.n}: title`);
    if (!Array.isArray(tp.labs)) errs.push(`topic ${tp.n}: labs must be an array`);
    else if (!tp.labs.length) { noLab++; if (!tp.why_no_lab) errs.push(`topic ${tp.n}: no lab and no why_no_lab`); }
    for (const id of tp.labs || []) if (!(ch.labs || []).some((l) => l.id === id)) errs.push(`topic ${tp.n}: lab ${id} is not defined in this file`);
  }
  for (const lab of ch.labs || []) {
    labs++;
    const w = `lab ${lab.id}`;
    if (!/^c\d{1,2}-[a-z_]+-[a-z0-9]+-[a-z0-9]+-[a-z0-9-]+$/.test(lab.id || '')) errs.push(`${w}: id must look like c10-science-jesc1-ch01-slug`);
    if (ids.has(lab.id)) errs.push(`${w}: id also used in ${ids.get(lab.id)}`); else ids.set(lab.id, rel);
    if (!topicNs.has(String(lab.topic))) errs.push(`${w}: topic ${lab.topic} is not in topics`);
    bi(lab.title, `${w} title`, errs);
    const T = globalThis.NCA_T.get(lab.template);
    if (!T) { errs.push(`${w}: template "${lab.template}" does not exist yet`); continue; }
    let ve = [];
    try { ve = T.validate(lab.config || {}); } catch (e) { ve = ['validate threw: ' + e.message]; }
    ve.forEach((m) => errs.push(`${w} config: ${m}`));
    let k = { targets: [], events: [] };
    try { k = T.keys(lab.config || {}); } catch (e) { errs.push(`${w}: keys() threw: ${e.message}`); }
    const st = lab.steps || [];
    if (st.length < 5 || st.length > 12) errs.push(`${w}: 5 to 12 steps`);
    const kinds = st.map((s) => s.kind);
    if (!kinds.includes('do')) errs.push(`${w}: needs a do step`);
    if (!kinds.includes('predict')) errs.push(`${w}: needs a predict step`);
    if (!kinds.includes('explain')) errs.push(`${w}: needs an explain step`);
    if (!kinds.includes('check')) errs.push(`${w}: needs a check step`);
    if (kinds[kinds.length - 1] !== 'explore') errs.push(`${w}: the last step must be explore`);
    st.forEach((s, i) => {
      const sw = `${w} step ${i + 1} (${s.kind})`;
      if (!['do', 'predict', 'explain', 'check', 'explore'].includes(s.kind)) { errs.push(`${sw}: unknown kind`); return; }
      if (s.kind !== 'check') bi(s.say, `${sw} say`, errs);
      if (s.kind === 'do') {
        if (!s.target || !k.targets.some((p) => globalThis.NCA_LIB.matches(p, s.target) || p === s.target)) errs.push(`${sw}: target "${s.target}" is not one the template declares`);
        if (!s.expect || !k.events.some((p) => globalThis.NCA_LIB.matches(p, s.expect) || p === s.expect)) errs.push(`${sw}: expect "${s.expect}" is not an event the template declares`);
      }
      if (s.kind === 'predict') {
        if (!Array.isArray(s.options) || s.options.length < 2 || s.options.length > 4) errs.push(`${sw}: 2 to 4 options`);
        else { s.options.forEach((o, j) => { if (!o.id) errs.push(`${sw}: option ${j + 1} needs an id`); bi({ en: o.en, hi: o.hi }, `${sw} option ${j + 1}`, errs); }); if (!s.options.some((o) => o.id === s.answer)) errs.push(`${sw}: answer is not an option id`); }
      }
      if (s.kind === 'check') {
        if (!Array.isArray(s.items) || s.items.length < 1 || s.items.length > 3) errs.push(`${sw}: 1 to 3 items`);
        (s.items || []).forEach((it, j) => {
          const iw = `${sw} item ${j + 1}`;
          bi(it.q, `${iw} q`, errs); bi(it.why, `${iw} why`, errs);
          if (!Array.isArray(it.options) || it.options.length < 2 || it.options.length > 4) { errs.push(`${iw}: 2 to 4 options`); return; }
          it.options.forEach((o, x) => bi(o, `${iw} option ${x + 1}`, errs));
          if (!Number.isInteger(it.answer) || it.answer < 0 || it.answer >= it.options.length) errs.push(`${iw}: answer must be an option index`);
          if (!Array.isArray(it.wrong) || it.wrong.length !== it.options.length) errs.push(`${iw}: wrong needs one entry per option`);
          else it.wrong.forEach((x, o) => { if (o === it.answer) { if (x !== '') errs.push(`${iw}: wrong[${o}] must be "" (it is the answer)`); } else bi(x, `${iw} wrong ${o + 1}`, errs); });
        });
      }
    });
  }
  for (const im of ch.images || []) {
    images++;
    if (!KINDS.includes(im.kind)) errs.push(`image ${im.n}: kind must be one of ${KINDS.join(' ')}`);
    for (const f of ['n', 'use', 'shows', 'view', 'right']) if (!im[f]) errs.push(`image ${im.n}: ${f} missing`);
  }
  if (errs.length) problems.push({ file: rel, errors: errs });
}

const missingTpl = catalogue.templates.filter((x) => !globalThis.NCA_T.get(x.id)).map((x) => x.id);
console.log(`templates: ${globalThis.NCA_T.all().length} loaded, ${tplErrors.length} with problems; catalogue templates not built yet: ${missingTpl.length ? missingTpl.join(', ') : 'none'}`);
tplErrors.forEach((e) => console.log('  TEMPLATE ' + e));
if (!templatesOnly) {
  console.log(`defs: ${files} chapter files, ${topics} topics (${noLab} without a lab), ${labs} labs, ${images} image rows; ${problems.length} files with problems`);
  for (const p of problems) { console.log(`  ${p.file}`); p.errors.slice(0, 40).forEach((e) => console.log(`    - ${e}`)); if (p.errors.length > 40) console.log(`    … ${p.errors.length - 40} more`); }
}
process.exit(tplErrors.length || problems.length ? 1 : 0);
