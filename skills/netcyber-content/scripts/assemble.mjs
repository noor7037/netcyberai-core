#!/usr/bin/env node
// Join a chapter written in parts (by one agent in chat mode, or by several topic agents) into the chapter file.
//   node skills/netcyber-content/scripts/assemble.mjs content-inbox/c10-mathematics/u.c10.mathematics.jemh1.ch01
// Reads <dir>/parts/chapter.json (everything except full topics and the test), parts/t01.json … (full topic objects)
// and parts/test.json ({ pass, items }); writes <dir>.json next to the folder.
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve(process.argv[2] || '');
const parts = path.join(dir, 'parts');
const read = (f) => JSON.parse(fs.readFileSync(path.join(parts, f), 'utf8'));
if (!fs.existsSync(path.join(parts, 'chapter.json'))) { console.error(`Missing ${path.join(parts, 'chapter.json')}`); process.exit(2); }
const ch = read('chapter.json');
const files = fs.readdirSync(parts).filter((f) => /^t\d\d\.json$/.test(f)).sort();
ch.topics = files.map((f) => read(f));
const ids = ch.topics.map((t) => t.id);
if (new Set(ids).size !== ids.length) { console.error('Two topic files have the same id.'); process.exit(2); }
if (fs.existsSync(path.join(parts, 'test.json'))) ch.test = read('test.json'); else console.error('Warning: no parts/test.json yet.');
const out = dir + '.json';
fs.writeFileSync(out, JSON.stringify(ch, null, 1) + '\n');
console.log(`Assembled ${files.length} topics into ${path.relative(process.cwd(), out)}`);
