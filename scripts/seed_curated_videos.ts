// Loads the reviewed topic map (scripts/seed/part2_topic_map.csv) into content.curated_topic_videos, idempotently:
// a row already there (the same video, topic and language) is updated, never doubled. Needs DATABASE_URL, connecting as
// the platform role. Run only on purpose, on the database you mean (the table comes from the migration
// 20261116120000_video_quality.sql):
//   DATABASE_URL=... npx tsx scripts/seed_curated_videos.ts [file.csv]
// Check the file without writing:
//   npx tsx scripts/seed_curated_videos.ts --check [file.csv]
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { curatedRowsFromCsv, curatedUpsertSql } from '../src/lib/family/curated-videos';

const args = process.argv.slice(2);
const check = args.includes('--check');
const file = args.find((a) => !a.startsWith('--')) ?? new URL('./seed/part2_topic_map.csv', import.meta.url).pathname;
const { rows, skipped } = curatedRowsFromCsv(readFileSync(file, 'utf8'));
for (const s of skipped) console.warn(`line ${s.line}: skipped (${s.why})`);
console.log(`read ${rows.length} videos, skipped ${skipped.length}`);

async function main(): Promise<void> {
  if (check) return;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    for (let i = 0; i < rows.length; i += 100) await pool.query(curatedUpsertSql(rows.slice(i, i + 100)));
    const { rows: n } = await pool.query('select count(*)::int as n from content.curated_topic_videos where active');
    console.log(`content.curated_topic_videos holds ${n[0].n} active videos`);
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
