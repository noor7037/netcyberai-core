#!/usr/bin/env node
// Builds reader/content/index.json: every chapter of a subject from the syllabus, with the reader file when it exists.
// Usage: node reader/scripts/index.mjs   (Class 10 Science for now)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const READER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(READER, '..');
const defsDir = path.join(ROOT, 'labs/defs/c10/science');
const chapters = fs.readdirSync(defsDir).filter((f) => /^u\.c10\.science\.jesc1\.ch\d\d\.json$/.test(f)).sort().map((f) => {
  const def = JSON.parse(fs.readFileSync(path.join(defsDir, f), 'utf8'));
  const number = +f.match(/ch(\d\d)/)[1];
  const rel = `c10/science/${f}`;
  const file = path.join(READER, 'content', rel);
  const out = { key: def.chapter_key, number, title: { en: def.title, hi: def.title }, file: null, topics: 0, minutes: 0, image: null };
  if (fs.existsSync(file)) {
    const ch = JSON.parse(fs.readFileSync(file, 'utf8'));
    Object.assign(out, { title: ch.title, file: rel, topics: ch.topics.length, minutes: ch.minutes || ch.topics.reduce((a, t) => a + (t.minutes || 0), 0), image: ch.hook && ch.hook.image });
  }
  return out;
});
fs.writeFileSync(path.join(READER, 'content/index.json'), JSON.stringify({ class: 10, subject_id: 'science', chapters }, null, 1) + '\n');
console.log(`index.json: ${chapters.length} chapters, ${chapters.filter((c) => c.file).length} with reader content`);
