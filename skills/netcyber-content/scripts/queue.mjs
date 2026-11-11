#!/usr/bin/env node
// The work queue for a build run. The list of chapters comes ONLY from the official syllabus
// (data/content/universal/syllabus/chapters.csv + books.csv), never from an AI's memory, and an item is marked done
// only after this script re-runs every gate itself. Progress lives in content-inbox/QUEUE.json, so a run can stop and
// the next session continues exactly where it left off.
//
//   node skills/netcyber-content/scripts/queue.mjs init --class 12 [--stream science|commerce|humanities] [--subject physics] [--chapter 3] [--include-published]
//   node skills/netcyber-content/scripts/queue.mjs status
//   node skills/netcyber-content/scripts/queue.mjs next            # the next item to work on (marks it in-progress)
//   node skills/netcyber-content/scripts/queue.mjs done <id>       # runs the gates; marks done only if they pass
//   node skills/netcyber-content/scripts/queue.mjs block <id> "<reason>"   # only for a real impossibility; then go on
//
// Item ids: "plan:<class>-<subject>" (the subject's image plan, first) and the chapter keys (u.c12.physics.leph1.ch01).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const INBOX = path.join(ROOT, 'content-inbox');
const QFILE = path.join(INBOX, 'QUEUE.json');
const pad = (n) => String(n).padStart(2, '0');
const csv = (f) => {
  const rows = []; const text = fs.readFileSync(f, 'utf8').replace(/^﻿/, '');
  let field = '', row = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(field); field = ''; } else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [h, ...b] = rows; return b.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
};
const subjDir = (cls, subject) => path.join(INBOX, `c${pad(cls)}-${subject}`);
const chapterFile = (it) => path.join(subjDir(it.class, it.subject_id), `${it.id}.json`);
const labsFile = (it) => path.join(subjDir(it.class, it.subject_id), 'labs', `${it.id}.json`);
const planFile = (cls, subjectName) => {
  const repo = path.join(ROOT, 'data/content/universal/image-plans', `Class-${cls}-${subjectName.replace(/\s+/g, '-')}-images.csv`);
  const inbox = path.join(INBOX, `c${pad(cls)}-image-plans`, `Class-${cls}-${subjectName.replace(/\s+/g, '-')}-images.csv`);
  return fs.existsSync(repo) ? repo : inbox;
};
const load = () => JSON.parse(fs.readFileSync(QFILE, 'utf8'));
const save = (q) => { q.updated = new Date().toISOString(); fs.writeFileSync(QFILE, JSON.stringify(q, null, 1) + '\n'); };
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const cmd = process.argv[2];

if (cmd === 'init') {
  const cls = arg('--class'), stream = arg('--stream'), subject = arg('--subject'), chapter = arg('--chapter');
  if (!cls) { console.error('init needs --class <1–12>'); process.exit(2); }
  const books = Object.fromEntries(csv(path.join(ROOT, 'data/content/universal/syllabus/books.csv')).map((b) => [b.book_code, b]));
  let rows = csv(path.join(ROOT, 'data/content/universal/syllabus/chapters.csv')).filter((r) => r.class === String(+cls) && books[r.book_code] && books[r.book_code].scope === 'core');
  if (stream) rows = rows.filter((r) => { const s = books[r.book_code].streams || 'all'; return s === 'all' || s === '' || s.split(';').includes(stream); });
  if (subject) rows = rows.filter((r) => r.subject_id === subject);
  if (chapter) rows = rows.filter((r) => new RegExp(`\\.(ch|x|s)${pad(chapter)}(\\.|$)`).test(r.key) || r.chapter_no === String(chapter));
  if (!rows.length) { console.error('No syllabus rows match that scope. Check --class/--stream/--subject/--chapter against data/content/universal/syllabus/chapters.csv.'); process.exit(2); }
  const items = [];
  const seenSubj = new Set();
  for (const r of rows) {
    const sk = `${r.class}-${r.subject_id}`;
    if (!seenSubj.has(sk)) {
      seenSubj.add(sk);
      const plan = planFile(r.class, r.subject);
      items.push({ id: `plan:${sk}`, kind: 'image-plan', class: +r.class, subject_id: r.subject_id, subject: r.subject, file: path.relative(ROOT, plan), status: fs.existsSync(plan) ? 'done' : 'pending' });
    }
    const published = fs.existsSync(path.join(ROOT, 'reader/content', `c${pad(r.class)}`, r.subject_id, `${r.key}.json`));
    items.push({ id: r.key, kind: 'chapter', class: +r.class, subject_id: r.subject_id, subject: r.subject, book: r.book_code, book_title: r.book_title, streams: books[r.book_code].streams || 'all', title: r.title, chapter_no: r.chapter_no, notes: r.notes, ncert_text: `labs/.work/txt/${r.book_code}${pad(r.chapter_no || 0)}.txt`, status: published && !process.argv.includes('--include-published') ? 'published' : 'pending' });
  }
  fs.mkdirSync(INBOX, { recursive: true });
  if (fs.existsSync(QFILE) && !process.argv.includes('--force')) { console.error('content-inbox/QUEUE.json already exists. Run `status` to continue it, or add --force to replace it.'); process.exit(2); }
  save({ scope: { class: +cls, stream, subject, chapter }, created: new Date().toISOString(), items });
  console.log(`Queue: ${items.filter((i) => i.kind === 'chapter').length} chapters in ${seenSubj.size} subjects; ${items.filter((i) => i.status === 'pending').length} items to build. Run: node skills/netcyber-content/scripts/queue.mjs next`);
} else if (cmd === 'status') {
  const q = load(); const by = {};
  for (const i of q.items) by[i.status] = (by[i.status] || 0) + 1;
  console.log(`Scope ${JSON.stringify(q.scope)} — ${JSON.stringify(by)}`);
  for (const i of q.items.filter((x) => x.status === 'in-progress' || x.status === 'blocked')) console.log(`  ${i.status}: ${i.id}${i.reason ? ' — ' + i.reason : ''}`);
  const left = q.items.filter((x) => x.status === 'pending' || x.status === 'in-progress').length;
  console.log(left ? `${left} items left. The run is NOT finished: continue with \`queue.mjs next\`.` : 'All items are done, published or blocked. The run is complete.');
} else if (cmd === 'next') {
  const q = load();
  const it = q.items.find((x) => x.status === 'in-progress') || q.items.find((x) => x.status === 'pending');
  if (!it) { console.log('Nothing left: the run is complete. Write content-inbox/RUN-REPORT.md.'); process.exit(0); }
  it.status = 'in-progress'; it.started = it.started || new Date().toISOString(); save(q);
  if (it.kind === 'image-plan') {
    console.log(`NEXT: the image plan for Class ${it.class} ${it.subject}.\nWrite ${it.file} with docs/family-app/handover/PROMPT_IMAGE_PLAN.md (references/images.md). Then: queue.mjs done ${it.id}`);
  } else {
    console.log(`NEXT: ${it.id} — Class ${it.class} ${it.subject}, ${it.book_title}, chapter ${it.chapter_no}: ${it.title}${it.notes ? ' (' + it.notes + ')' : ''}\n  NCERT text: ${it.ncert_text}${fs.existsSync(path.join(ROOT, it.ncert_text)) ? '' : '  (MISSING — use the PDF from books.csv)'}\n  Write:      ${path.relative(ROOT, chapterFile(it))}\n  Labs:       ${path.relative(ROOT, labsFile(it))}\n  Scaffold:   node skills/netcyber-content/scripts/new_chapter.mjs ${it.id}\n  When built: node skills/netcyber-content/scripts/queue.mjs done ${it.id}`);
  }
} else if (cmd === 'done') {
  const q = load(); const it = q.items.find((x) => x.id === process.argv[3]);
  if (!it) { console.error('No such item.'); process.exit(2); }
  const fail = (m) => { console.error(`NOT DONE: ${m}\nFix it and run \`queue.mjs done ${it.id}\` again.`); process.exit(1); };
  if (it.kind === 'image-plan') {
    const f = path.join(ROOT, it.file);
    if (!fs.existsSync(f)) fail(`${it.file} does not exist.`);
    const rows = csv(f); const need = ['file_name', 'chapter', 'topic', 'concept', 'must_show', 'accuracy', 'pin_targets', 'prompt'];
    const miss = need.filter((k) => !(k in (rows[0] || {})));
    if (miss.length) fail(`the plan lacks columns: ${miss.join(', ')}`);
    const chapters = new Set(q.items.filter((x) => x.kind === 'chapter' && x.class === it.class && x.subject_id === it.subject_id).map((x) => String(+x.chapter_no)));
    const covered = new Set(rows.map((r) => String(+r.chapter)));
    const gaps = [...chapters].filter((c) => !covered.has(c));
    if (gaps.length) fail(`no images planned for chapter(s) ${gaps.join(', ')}`);
  } else {
    const cf = chapterFile(it), lf = labsFile(it);
    if (!fs.existsSync(cf)) fail(`${path.relative(ROOT, cf)} does not exist (run assemble.mjs if you wrote parts).`);
    if (!fs.existsSync(lf)) fail(`${path.relative(ROOT, lf)} does not exist.`);
    const run = (args) => { try { execFileSync('node', args, { cwd: ROOT, stdio: 'pipe' }); return null; } catch (e) { return String(e.stdout || '') + String(e.stderr || ''); } };
    const labOut = run(['labs/scripts/check.mjs', lf]);
    if (labOut) fail('labs checker:\n' + labOut.slice(0, 3000));
    const plan = planFile(it.class, it.subject);
    const rd = ['reader/scripts/check.mjs', cf, '--labs', lf]; if (fs.existsSync(plan)) rd.push('--plan', plan);
    const readOut = run(rd);
    if (readOut) fail('reader checker:\n' + readOut.slice(0, 3000));
    const doneNote = path.join(subjDir(it.class, it.subject_id), `DONE-${it.id}.md`);
    if (!fs.existsSync(doneNote)) fail(`write ${path.relative(ROOT, doneNote)} (what you built, new templates, doubts; include the digest).`);
  }
  it.status = 'done'; it.finished = new Date().toISOString(); save(q);
  const left = q.items.filter((x) => x.status === 'pending' || x.status === 'in-progress').length;
  console.log(`DONE: ${it.id}. ${left} items left${left ? ' — continue: queue.mjs next' : ' — the run is complete; write content-inbox/RUN-REPORT.md'}.`);
} else if (cmd === 'block') {
  const q = load(); const it = q.items.find((x) => x.id === process.argv[3]); const reason = process.argv[4];
  if (!it || !reason || reason.length < 20) { console.error('block <id> "<a real reason of at least 20 characters>"'); process.exit(2); }
  it.status = 'blocked'; it.reason = reason; save(q);
  console.log(`Blocked ${it.id}: ${reason}. Continue with the next item: queue.mjs next`);
} else {
  console.log('Commands: init, status, next, done <id>, block <id> "<reason>". See the header of this file.');
}
