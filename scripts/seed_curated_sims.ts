// Loads the verified simulations (scripts/seed/curated_sims.csv, built by scripts/sims/build_sims_csv.mjs) into
// content.curated_topic_sims, idempotently: a row already there (the same address, class, subject, topic and language) is updated, never doubled.
// Needs DATABASE_URL, connecting as the platform role. Run only on purpose, on the database you mean (the table comes from the
// migration 20261116150000_curated_topic_sims.sql):
//   DATABASE_URL=... npx tsx scripts/seed_curated_sims.ts [file.csv]
// Check the file without writing:
//   npx tsx scripts/seed_curated_sims.ts --check [file.csv]
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { simRowsFromCsv, simUpsertSql } from '../src/lib/family/curated-sims';

const args = process.argv.slice(2);
const check = args.includes('--check');
const file = args.find((a) => !a.startsWith('--')) ?? new URL('./seed/curated_sims.csv', import.meta.url).pathname;
const { rows, skipped } = simRowsFromCsv(readFileSync(file, 'utf8'));
for (const s of skipped) console.warn(`line ${s.line}: skipped (${s.why})`);
console.log(`read ${rows.length} simulations, skipped ${skipped.length}`);

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
