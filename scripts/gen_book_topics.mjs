// Writes src/lib/family/book-topics.json: for each chapter of the reader's books, its topics' titles in English and
// Hindi (W22-S1). The Study search reads this small file instead of the chapters themselves (each is ~0.8 MB).
// Run after the reader's content changes: node scripts/gen_book_topics.mjs
// test/family/search.test.ts fails when the file is out of date.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'reader/content');
const index = JSON.parse(readFileSync(path.join(CONTENT, 'index.json'), 'utf8'));
const out = {};
for (const c of index.chapters) {
  if (!c.file) continue;
  const ch = JSON.parse(readFileSync(path.join(CONTENT, c.file), 'utf8'));
  out[c.key] = (ch.topics ?? []).map((t) => ({ id: t.id, en: t.title.en, hi: t.title.hi }));
}
writeFileSync(path.join(ROOT, 'src/lib/family/book-topics.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`book-topics.json: ${Object.keys(out).length} chapters`);
