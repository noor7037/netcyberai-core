#!/usr/bin/env node
// Words on screen, before and after (C235-C). Reads the `words` the harness
// records for each screen (visible-words.mjs: what a reader can see in <main>,
// not screen-reader text or a closed disclosure) from two harness runs.
//
//   node scripts/harness/run.mjs --out <before> --screens app-dashboard,app-my-day,...   (on the old code)
//   node scripts/harness/run.mjs --out <after>  --screens app-dashboard,app-my-day,...   (on the new code)
//   node scripts/harness/word-count.mjs <before> <after> [--width 1440] [--screens a,b]
//
// With one folder it lists that run's counts. Exit 1 if a screen is missing.
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const DECLUTTER_SET = ['app-dashboard', 'app-my-day', 'app-students', 'app-staff', 'app-attendance', 'app-fees', 'app-settings', 'control-dashboard', 'control-school', 'control-whatsapp', 'family-home'];

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dirs = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const widths = flag('--width') ? [Number(flag('--width'))] : [1440, 390];
const screens = flag('--screens') ? flag('--screens').split(',') : DECLUTTER_SET;
if (!dirs.length || dirs.length > 2) {
  console.error('usage: word-count.mjs <before-dir> [<after-dir>] [--width 1440] [--screens a,b]');
  process.exit(2);
}

const counts = (dir) => {
  const report = JSON.parse(readFileSync(path.join(dir, 'report.json'), 'utf8'));
  return new Map(report.screens.filter((r) => typeof r.words === 'number').map((r) => [`${r.name}@${r.width}`, r.words]));
};
const runs = dirs.map(counts);
let missing = 0;
for (const width of widths) {
  const totals = runs.map(() => 0);
  console.log(`\n${width} px`);
  for (const name of screens) {
    const row = runs.map((m) => m.get(`${name}@${width}`));
    if (row.some((v) => v === undefined)) {
      missing++;
      console.log(`  ${name.padEnd(20)} missing`);
      continue;
    }
    row.forEach((v, i) => (totals[i] += v));
    const change = row.length === 2 ? `  ${pct(row[0], row[1])}` : '';
    console.log(`  ${name.padEnd(20)} ${row.map((v) => String(v).padStart(5)).join(' → ')}${change}`);
  }
  console.log(`  ${'total'.padEnd(20)} ${totals.map((v) => String(v).padStart(5)).join(' → ')}${totals.length === 2 ? `  ${pct(totals[0], totals[1])}` : ''}`);
}
process.exit(missing ? 1 : 0);

function pct(a, b) {
  return a ? `${b <= a ? '−' : '+'}${Math.abs(Math.round(((b - a) / a) * 100))}%` : 'n/a';
}
