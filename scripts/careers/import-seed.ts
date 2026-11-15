// Career Hub seed. --dry-run prints counts and writes nothing.
// --dump writes data/careers/career_seed.json. This script never opens a database.
// Loading rows into the database is the Control page, and only after the founder confirms.

import { writeFileSync } from 'node:fs';
import { buildBundle, SEED_BATCH } from '../../src/lib/family/careers/catalog';
import { seedRows } from '../../src/lib/family/careers/seed-build';

const bundle = buildBundle();
const { desired, careers } = seedRows(bundle);
const dump = process.argv.includes('--dump');

const byTable: Record<string, number> = {};
for (const row of desired) byTable[row.table] = (byTable[row.table] ?? 0) + 1;
console.log(JSON.stringify({ batch: SEED_BATCH, careers, rows: desired.length, byTable, review: 'pending until the founder approves' }));

if (dump) {
  const file = {
    batch: SEED_BATCH,
    basis: 'general_knowledge',
    note: 'General guidance. Every row stays pending until the founder approves it in Control.',
    generated: '2026-11-15',
    rows: desired.map((r) => ({ table: r.table, key: r.key, reviewDue: r.reviewDue, hash: r.hash, write: r.write })),
  };
  writeFileSync('data/careers/career_seed.json', JSON.stringify(file));
  console.log(`wrote data/careers/career_seed.json (${file.rows.length} rows)`);
}
