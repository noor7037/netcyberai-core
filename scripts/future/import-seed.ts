// Imports the Future seed files into content.future_listings as PENDING rows (nothing is approved).
// Idempotent: a seed id already present is left as it is. Needs DATABASE_URL; it connects as the platform role.
// Run only on purpose, on the database you mean:
//   DATABASE_URL=... npx tsx scripts/future/import-seed.ts
// Check the files without writing:
//   npx tsx scripts/future/import-seed.ts --check
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { importSeed, toRow, type SeedListing } from '../../src/lib/future/seed-import';
import { indiaDate } from '../../src/lib/time/india';

const SEED_FILES = ['future_listings_seed.json', 'haryana_listings_seed.json'];

function loadListings(): SeedListing[] {
  return SEED_FILES.flatMap((name) => {
    const file = JSON.parse(readFileSync(new URL(`../../data/future/${name}`, import.meta.url), 'utf8')) as { listings: SeedListing[] };
    return file.listings;
  });
}

function checkListings(listings: readonly SeedListing[]): void {
  const ids = new Set<string>();
  for (const l of listings) {
    if (ids.has(l.id)) throw new Error(`duplicate seed id ${l.id}`);
    ids.add(l.id);
    toRow(l, indiaDate());
  }
  console.log(`checked ${listings.length} listings`);
}

async function main() {
  const listings = loadListings();
  if (process.argv.includes('--check')) {
    checkListings(listings);
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set; nothing was imported.');
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local role nca_super');
    const r = await importSeed(client, listings, indiaDate());
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
