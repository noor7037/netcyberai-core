// Imports data/future/future_listings_seed.json into content.future_listings as PENDING rows (nothing is approved).
// Idempotent. Needs DATABASE_URL; it connects as the platform role. Run only on purpose, on the database you mean:
//   DATABASE_URL=... npx tsx scripts/future/import-seed.ts
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { importSeed, type SeedListing } from '../../src/lib/future/seed-import';
import { indiaDate } from '../../src/lib/time/india';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set; nothing was imported.');
  const file = JSON.parse(readFileSync(new URL('../../data/future/future_listings_seed.json', import.meta.url), 'utf8')) as { listings: SeedListing[] };
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local role nca_super');
    const r = await importSeed(client, file.listings, indiaDate());
    await client.query('commit');
    console.log(`imported ${r.inserted} new pending listings; ${r.skipped} were already there`);
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
