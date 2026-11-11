#!/usr/bin/env node
// A short review digest of a chapter file: structure per topic, visuals, labs, the test mix, the answer spread, the
// terms in both languages, and every question with its key (so a reviewer can re-solve them without reading the
// whole 500 KB file).  node skills/netcyber-content/scripts/digest.mjs <chapter.json> > digest.md
import fs from 'node:fs';
const f = process.argv[2];
if (!f) { console.error('usage: digest.mjs <chapter.json>'); process.exit(2); }
const ch = JSON.parse(fs.readFileSync(f, 'utf8'));
const en = (x) => (x && typeof x === 'object' ? x.en : x) || '';
const hi = (x) => (x && typeof x === 'object' ? x.hi : '') || '';
const clip = (s, n = 140) => String(s).replace(/\s+/g, ' ').slice(0, n);
const L = [];
L.push(`# Digest: ${ch.chapter_key} — ${en(ch.title)} / ${hi(ch.title)}`, '', `Big idea: ${en(ch.big_idea)}`, `Hook: ${clip(en(ch.hook && ch.hook.question))} → answered in ${ch.hook && ch.hook.answered_in}`, '');
L.push('| Topic | Steps | Diagrams | Figures (images) | Labs | why_no_lab | Terms | Check items | Bloom spread |', '|---|---|---|---|---|---|---|---|---|');
const answers = [0, 0, 0, 0];
const allItems = [];
for (const t of ch.topics || []) {
  const st = t.steps || [];
  const c = (k) => st.filter((s) => s.type === k).length;
  const imgs = st.filter((s) => s.type === 'figure').reduce((a, s) => a + (s.images || []).length, 0);
  const labs = st.filter((s) => s.type === 'lab').map((s) => s.lab.split('-').slice(-2).join('-'));
  const items = (t.check && t.check.items) || [];
  const bloom = {}; items.forEach((i) => { bloom[i.bloom] = (bloom[i.bloom] || 0) + 1; });
  L.push(`| ${t.id} ${clip(en(t.title), 50)} | ${st.length} | ${c('diagram')} | ${c('figure')} (${imgs}) | ${labs.join(', ') || '—'} | ${t.why_no_lab ? clip(en(t.why_no_lab), 60) : ''} | ${(t.terms || []).length} | ${items.length} | ${Object.entries(bloom).map(([k, v]) => k.slice(0, 3) + v).join(' ')} |`);
  st.forEach((s) => { if (s.item) allItems.push([`${t.id} ${s.type}`, s.item]); if (s.faded && s.faded.item) allItems.push([`${t.id} faded`, s.faded.item]); });
  items.forEach((i) => allItems.push([`${t.id} check`, i]));
}
const test = (ch.test && ch.test.items) || [];
test.forEach((i) => allItems.push(['test', i]));
const marks = (i) => (i.type === 'case' ? (i.parts || []).length : i.type === 'short' || i.type === 'long' ? i.marks : 1);
const total = test.reduce((a, i) => a + marks(i), 0);
const comp = test.filter((i) => i.type === 'case' || i.type === 'ar' || (i.type === 'mcq' && i.comp)).reduce((a, i) => a + marks(i), 0);
const plain = test.filter((i) => i.type === 'mcq' && !i.comp).reduce((a, i) => a + marks(i), 0);
const pct = (v) => (total ? Math.round((v / total) * 100) : 0);
L.push('', `Test: ${test.length} items, ${total} marks — competency ${pct(comp)}% / plain MCQ ${pct(plain)}% / constructed ${pct(total - comp - plain)}%`);
for (const [, i] of allItems) { if (i.type === 'mcq') answers[i.answer]++; if (i.type === 'case') (i.parts || []).forEach((p) => answers[p.answer]++); }
const n = answers.reduce((a, b) => a + b, 0);
L.push(`Answer positions (mcq + case parts): A ${answers[0]} · B ${answers[1]} · C ${answers[2]} · D ${answers[3]} (max ${n ? Math.round((Math.max(...answers) / n) * 100) : 0}%)`, '');
L.push('## Terms (EN — HI)', '');
for (const t of ch.topics || []) L.push(`- ${t.id}: ${(t.terms || []).map((x) => `${x.en} — ${x.hi}`).join('; ')}`);
L.push('', '## Plain explanations (first explain step of each topic)', '');
for (const t of ch.topics || []) { const e = (t.steps || []).find((s) => s.type === 'explain'); if (e) L.push(`- **${t.id}** EN: ${clip(en(e.plain), 220)}`, `  HI: ${clip(hi(e.plain), 220)}`); }
L.push('', '## Every question and its key (re-solve each)', '');
const opt = (o, k) => `${'ABCD'[k]}: ${clip(en(o[k]), 90)}`;
for (const [where, i] of allItems) {
  if (i.type === 'mcq') L.push(`- [${where} ${i.id}${i.comp ? ' comp' : ''}] ${clip(en(i.q), 200)} → **${opt(i.options, i.answer)}**`);
  else if (i.type === 'ar') L.push(`- [${where} ${i.id} AR] A: ${clip(en(i.assertion), 120)} | R: ${clip(en(i.reason), 120)} → **${i.answer}**`);
  else if (i.type === 'case') { L.push(`- [${where} ${i.id} case] ${clip(en(i.stem), 200)}`); (i.parts || []).forEach((p, k) => L.push(`  - ${k + 1}. ${clip(en(p.q), 160)} → **${opt(p.options, p.answer)}**`)); }
  else L.push(`- [${where} ${i.id} ${i.type} ${i.marks}m] ${clip(en(i.q), 200)} → model: ${clip(en(i.model), 220)}`);
}
console.log(L.join('\n'));
