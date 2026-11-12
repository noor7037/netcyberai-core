#!/usr/bin/env node
// Writes every book's reader/content/c<NN>/<subject>/index.json, its search.json (the tutor's topic search) and the registry reader/content/books.json from the
// chapter files, lab defs and each book's book.json (see books-lib.mjs). Run it after adding or changing a chapter.
// Usage: node reader/scripts/index.mjs
import fs from 'node:fs';
import path from 'node:path';
import { READER, buildAll } from './books-lib.mjs';

const content = path.join(READER, 'content');
const { files, books } = buildAll(content);
for (const [rel, text] of Object.entries(files)) fs.writeFileSync(path.join(content, rel), text);
for (const b of books) console.log(`c${b.class}/${b.subject_id} (${b.id}; ${b.boards.join(', ')}): ${b.chapters.length} chapters, ${b.chapters.filter((c) => c.file).length} with reader content`);
console.log(`books.json: ${books.length} book(s)`);
