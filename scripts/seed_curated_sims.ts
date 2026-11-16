// Loads the verified simulations (scripts/seed/curated_sims.csv, built by scripts/sims/build_sims_csv.mjs) into
// content.curated_topic_sims, idempotently: a row already there (the same address, class, subject, topic and language) is updated, never doubled.
// Needs DATABASE_URL, connecting as the platform role. Run only on purpose, on the database you mean (the table comes from the
// migration 20261116150000_curated_topic_sims.sql):
//   DATABASE_URL=... npx tsx scripts/seed_curated_sims.ts [file.csv]
// Check the file without writing:
//   npx tsx scripts/seed_curated_sims.ts --check [file.csv]
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { classSpan, simRowsFromCsv, simUpsertSql } from '../src/lib/family/curated-sims';

const args = process.argv.slice(2);
const check = args.includes('--check');
const file = args.find((a) => !a.startsWith('--')) ?? new URL('./seed/curated_sims.csv', import.meta.url).pathname;
const { rows, skipped } = simRowsFromCsv(readFileSync(file, 'utf8'));
for (const s of skipped) console.warn(`line ${s.line}: skipped (${s.why})`);
console.log(`read ${rows.length} simulations, skipped ${skipped.length}`);
{
  // Counts: rows per subject and per class (a band such as 3-8 counts once in each class it holds, 1 to 12), and the distinct simulations.
  const bySubject = new Map<string, number>();
  const bySource = new Map<string, Set<string>>();
  const byClass = new Map<number, Set<string>>();
  for (const r of rows) {
    bySubject.set(r.subject, (bySubject.get(r.subject) ?? 0) + 1);
    (bySource.get(r.source) ?? bySource.set(r.source, new Set()).get(r.source)!).add(r.embed_url);
    const span = classSpan(r.class);
    for (let c = Math.max(span?.[0] ?? 99, 1); span && c <= Math.min(span[1], 12); c++) (byClass.get(c) ?? byClass.set(c, new Set()).get(c)!).add(`${r.subject}|${r.embed_url}`);
  }
  console.log(`distinct simulations: ${new Set(rows.map((r) => r.embed_url)).size} (${[...bySource].map(([s, u]) => `${s} ${u.size}`).join(', ')})`);
  console.log(`rows per subject: ${[...bySubject].sort().map(([s, n]) => `${s} ${n}`).join(', ')}`);
  console.log(`simulations per class: ${[...byClass].sort((a, b) => a[0] - b[0]).map(([c, u]) => `${c}: ${u.size}`).join(', ')}`);
  const bySubjectBand = new Map<string, number>();
  for (const r of rows) bySubjectBand.set(`${r.subject} ${r.class}`, (bySubjectBand.get(`${r.subject} ${r.class}`) ?? 0) + 1);
  console.log(`rows per subject and class band: ${[...bySubjectBand].sort().map(([k, n]) => `${k} = ${n}`).join('; ')}`);
}

async function main(): Promise<void> {
  if (check) return;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    for (let i = 0; i < rows.length; i += 100) await pool.query(simUpsertSql(rows.slice(i, i + 100)));
    const { rows: n } = await pool.query('select count(*)::int as n from content.curated_topic_sims where approved');
    console.log(`content.curated_topic_sims holds ${n[0].n} approved simulations`);
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
