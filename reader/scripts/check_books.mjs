#!/usr/bin/env node
// Checks the chapter reader's books (reader/content/c<NN>/<subject>/) the way the Family app uses them. Fails when:
//   - a book folder has chapter files but no valid book.json (id like ncert.jesc1, boards, optional catalog)
//   - a chapter file is not named for its book, or is missing from the book's index
//   - an index or books.json differs from what index.mjs writes from the files now (stale: run `node reader/scripts/index.mjs`)
//   - a board is not one of the boards in data/catalog/*.csv
//   - a catalog key is not a chapter of the catalog's board, class and subject, or is named twice
//   - a chapter has no labs/defs file, or names a lab its defs file lacks
// Usage: node reader/scripts/check_books.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, READER, bookFolders, buildAll } from './books-lib.mjs';

const P = [];
const bad = (m) => P.push(m);

// The committed catalog: board, class, subject and chapter keys (the first six columns hold no commas).
const chapterKeys = new Set(); // `${board}|${class}|${subject}|${key}`
const boards = new Set();
const catDir = path.join(ROOT, 'data/catalog');
for (const f of fs.readdirSync(catDir).filter((x) => x.endsWith('.csv'))) {
  for (const line of fs.readFileSync(path.join(catDir, f), 'utf8').split(/\r?\n/).slice(1)) {
    const c = line.split(',');
    if (c.length < 6 || !c[0]) continue;
    boards.add(c[0]);
    if (c[4] === 'chapter') chapterKeys.add(`${c[0]}|${c[1]}|${c[2]}|${c[5]}`);
  }
}

const content = path.join(READER, 'content');
const folders = bookFolders(content);
const metas = new Map();
for (const f of folders) {
  const where = `reader/content/${f.rel}`;
  const chapterFiles = f.files.filter((x) => /^u\..*\.json$/.test(x));
  if (!f.files.includes('book.json')) { bad(`${where}: has chapter files but no book.json`); continue; }
  let meta;
  try { meta = JSON.parse(fs.readFileSync(path.join(f.dir, 'book.json'), 'utf8')); } catch (e) { bad(`${where}/book.json: not valid JSON: ${e.message}`); continue; }
  if (!/^[a-z]+\.[a-z0-9]+$/.test(meta.id || '')) { bad(`${where}/book.json: id must look like ncert.jesc1`); continue; }
  const code = meta.id.split('.')[1];
  if (!Array.isArray(meta.boards) || !meta.boards.length) bad(`${where}/book.json: boards must list at least one board`);
  else for (const b of meta.boards) if (!boards.has(b)) bad(`${where}/book.json: unknown board ${b} (known: ${[...boards].sort().join(', ')})`);
  metas.set(f.rel, meta);

  const prefix = `u.${f.cls}.${f.subject}.${code}.ch`;
  for (const file of chapterFiles) {
    if (!new RegExp(`^${prefix.replace(/\./g, '\\.')}\\d\\d\\.json$`).test(file)) { bad(`${where}/${file}: not a chapter of ${meta.id} (expected ${prefix}NN.json)`); continue; }
    const key = file.replace(/\.json$/, '');
    const defFile = path.join(ROOT, 'labs/defs', f.cls, f.subject, file);
    let labIds = null;
    try { labIds = new Set(JSON.parse(fs.readFileSync(defFile, 'utf8')).labs.map((l) => l.id)); } catch (e) { bad(`${where}/${file}: no lab defs file at labs/defs/${f.cls}/${f.subject}/${file}`); }
    try {
      const ch = JSON.parse(fs.readFileSync(path.join(f.dir, file), 'utf8'));
      if (ch.chapter_key !== key) bad(`${where}/${file}: chapter_key is ${ch.chapter_key}, expected ${key}`);
      if (labIds) (function walk(x) {
        if (Array.isArray(x)) return x.forEach(walk);
        if (!x || typeof x !== 'object') return;
        if (x.type === 'lab' && typeof x.lab === 'string' && !labIds.has(x.lab)) bad(`${where}/${file}: lab ${x.lab} is not in its labs/defs file`);
        Object.values(x).forEach(walk);
      })(ch);
    } catch (e) { bad(`${where}/${file}: not valid JSON: ${e.message}`); }
  }

  const cat = meta.catalog;
  if (cat) {
    if (!meta.boards.includes(cat.board)) bad(`${where}/book.json: catalog.board ${cat.board} is not one of the book's boards`);
    const seen = new Set();
    for (const [n, key] of Object.entries(cat.chapters || {})) {
      if (!chapterKeys.has(`${cat.board}|${+f.cls.slice(1)}|${f.subject}|${key}`)) bad(`${where}/book.json: catalog key ${key} (chapter ${n}) is not a ${cat.board} Class ${+f.cls.slice(1)} ${f.subject} chapter in data/catalog/*.csv`);
      if (seen.has(key)) bad(`${where}/book.json: catalog key ${key} named twice`);
      seen.add(key);
    }
  }
}

// Stale: what is committed against what index.mjs writes now.
const { files, books } = buildAll(content);
for (const [rel, text] of Object.entries(files)) {
  const f = path.join(content, rel);
  if (!fs.existsSync(f)) bad(`reader/content/${rel} is missing: run node reader/scripts/index.mjs`);
  else if (fs.readFileSync(f, 'utf8') !== text) bad(`reader/content/${rel} is stale: run node reader/scripts/index.mjs`);
}
for (const b of books) {
  const rel = `c${String(b.class).padStart(2, '0')}/${b.subject_id}`;
  const fs2 = folders.find((x) => x.rel === rel);
  for (const file of fs2.files.filter((x) => /^u\..*\.json$/.test(x))) {
    if (!b.chapters.some((c) => c.file === `${rel}/${file}`)) bad(`reader/content/${rel}/${file} is not in the book's index (no labs/defs file for it?)`);
  }
}

if (P.length) { console.log(`books: ${P.length} problems`); P.forEach((m) => console.log('  - ' + m)); process.exit(1); }
console.log(`books: ok (${books.length} book(s), ${books.reduce((a, b) => a + b.chapters.filter((c) => c.file).length, 0)} chapters)`);
