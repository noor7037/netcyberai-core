#!/usr/bin/env node
// Scaffold one chapter: creates its inbox folder, copies the chapter's existing labs file as the starting labs file,
// and writes SCAFFOLD.md with the syllabus row, the existing topics and labs, the planned images and the NCERT text
// path, so the writer starts from facts, not memory.
//   node skills/netcyber-content/scripts/new_chapter.mjs u.c10.mathematics.jemh1.ch01
//   node skills/netcyber-content/scripts/new_chapter.mjs 10 mathematics 1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const pad = (n) => String(n).padStart(2, '0');
const csv = (f) => { const t = fs.readFileSync(f, 'utf8').replace(/^﻿/, ''); const out = []; let fld = '', row = [], q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"' && t[i + 1] === '"') { fld += '"'; i++; } else if (c === '"') q = false; else fld += c; } else if (c === '"') q = true; else if (c === ',') { row.push(fld); fld = ''; } else if (c === '\n') { row.push(fld.replace(/\r$/, '')); out.push(row); row = []; fld = ''; } else fld += c; } if (fld || row.length) { row.push(fld); out.push(row); } const [h, ...b] = out; return b.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? '']))); };
const rows = csv(path.join(ROOT, 'data/content/universal/syllabus/chapters.csv'));
const a = process.argv.slice(2);
const row = a.length === 1 ? rows.find((r) => r.key === a[0]) : rows.find((r) => r.class === String(+a[0]) && r.subject_id === a[1] && new RegExp(`\\.ch${pad(a[2])}$`).test(r.key));
if (!row) { console.error('No syllabus row. Use a key from chapters.csv or: <class> <subject_id> <chapter>.'); process.exit(2); }
const cls = pad(row.class), dir = path.join(ROOT, 'content-inbox', `c${cls}-${row.subject_id}`);
fs.mkdirSync(path.join(dir, 'labs'), { recursive: true }); fs.mkdirSync(path.join(dir, row.key, 'parts'), { recursive: true });
const defs = path.join(ROOT, 'labs/defs', `c${cls}`, row.subject_id, `${row.key}.json`);
const labsOut = path.join(dir, 'labs', `${row.key}.json`);
let def = null;
if (fs.existsSync(defs)) { def = JSON.parse(fs.readFileSync(defs, 'utf8')); if (!fs.existsSync(labsOut)) fs.copyFileSync(defs, labsOut); }
const planName = `Class-${+row.class}-${row.subject.replace(/\s+/g, '-')}-images.csv`;
const planPath = [path.join(ROOT, 'data/content/universal/image-plans', planName), path.join(ROOT, 'content-inbox', `c${cls}-image-plans`, planName)].find((p) => fs.existsSync(p));
const plan = planPath ? csv(planPath).filter((r) => String(+r.chapter) === String(+row.chapter_no)) : [];
const txt = `labs/.work/txt/${row.book_code}${pad(row.chapter_no || 0)}.txt`;
const md = [`# Scaffold: ${row.key}`, '', `Class ${+row.class} · ${row.subject} · ${row.book_title} · chapter ${row.chapter_no}: **${row.title}**${row.notes ? ` (${row.notes})` : ''}`, '',
  `- Chapter file to write: \`content-inbox/c${cls}-${row.subject_id}/${row.key}.json\` (or parts in \`${row.key}/parts/\` + assemble.mjs)`,
  `- Labs file (copied from the existing defs, edit it): \`content-inbox/c${cls}-${row.subject_id}/labs/${row.key}.json\``,
  `- NCERT text: \`${txt}\`${fs.existsSync(path.join(ROOT, txt)) ? '' : ' — MISSING here; use the PDF: ' + row.source_url}`,
  `- Image plan: ${planPath ? '`' + path.relative(ROOT, planPath) + '` (' + plan.length + ' files for this chapter)' : 'NONE yet — the subject\'s image plan must be written first (queue item plan:…)'}`, '',
  '## Existing topics and labs (starting point, not a limit)', ''];
if (def) for (const t of def.topics || []) md.push(`- ${t.n} ${typeof t.title === 'string' ? t.title : t.title.en} — labs: ${(t.labs || []).join(', ') || 'none' + (t.why_no_lab ? ' (' + (t.why_no_lab.en || t.why_no_lab) + ')' : '')}`);
else md.push('- (no existing labs file)');
md.push('', '## Planned images for this chapter', '');
for (const r of plan) md.push(`- \`${r.file_name.replace(/\.(png|jpe?g|webp)$/i, '')}\` — topic ${r.topic} — ${r.concept} — pins: ${r.pin_targets}`);
if (!plan.length) md.push('- none');
fs.writeFileSync(path.join(dir, row.key, 'SCAFFOLD.md'), md.join('\n') + '\n');
console.log(`Scaffold written: content-inbox/c${cls}-${row.subject_id}/${row.key}/SCAFFOLD.md`);
