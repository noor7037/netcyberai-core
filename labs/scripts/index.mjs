#!/usr/bin/env node
// Builds labs/index.json (what the gallery lists) from every chapter file in labs/defs and the template catalogue.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LABS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(path.join(d, x.name)) : x.name.endsWith('.json') ? [path.join(d, x.name)] : [])) : []);
const cat = JSON.parse(fs.readFileSync(path.join(LABS, 'catalogue.json'), 'utf8'));
const built = new Set(fs.readdirSync(path.join(LABS, 'templates')).map((f) => f.replace(/\.js$/, '')));
const labs = [];
for (const file of walk(path.join(LABS, 'defs')).sort()) {
  let ch;
  try { ch = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
  for (const l of ch.labs || []) {
    if (!built.has(l.template)) continue;
    const tp = (ch.topics || []).find((x) => String(x.n) === String(l.topic));
    labs.push({ id: l.id, title: l.title, class: ch.class, subject_id: ch.subject_id, chapter_key: ch.chapter_key, chapter_title: ch.title, topic: l.topic, topic_title: tp ? tp.title : '', template: l.template, minutes: l.minutes || 5, level: l.level || 'core', lang: l.lang, file: path.relative(LABS, file).split(path.sep).join('/') });
  }
}
labs.sort((a, b) => a.class - b.class || a.subject_id.localeCompare(b.subject_id) || a.chapter_key.localeCompare(b.chapter_key, undefined, { numeric: true }) || String(a.topic).localeCompare(String(b.topic), undefined, { numeric: true }));
const templates = Object.fromEntries(cat.templates.filter((x) => built.has(x.id)).map((x) => [x.id, { name: x.name, about: x.about, colour: x.colour }]));
fs.writeFileSync(path.join(LABS, 'index.json'), JSON.stringify({ generated: new Date().toISOString(), templates, labs }));
console.log(`index.json: ${labs.length} labs on ${Object.keys(templates).length} templates`);
