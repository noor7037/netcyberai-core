// The screenshot harness's database (C133): the REAL migrations from
// supabase/migrations, replayed on PGlite (Postgres compiled to
// WebAssembly) and served over the Postgres wire protocol on localhost, so
// the unchanged app connects to it through its normal DATABASE_URL.
//
// Development only. Nothing here is imported by src/, so none of it can be
// in a production build (scripts/check_harness_isolation.py). It listens on
// 127.0.0.1 only, holds illustrative data only, and is gone when the
// process ends.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');

// What Supabase provides around the migrations: its roles, the extensions
// schema, and the empty shells of auth, storage and Vault that some
// migrations refer to. Stand-ins, with no behaviour: the harness shows
// screens, it does not send messages, store files or run schedulers.
const SUPABASE_STAND_INS = `
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role supabase_admin nologin; create role authenticator nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create schema vault;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text, description text);
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret, description from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid language sql as $$ insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description) returning id $$;
set search_path to public, extensions;
`;

// Migrations that only schedule jobs (pg_cron) or call out over HTTP
// (pg_net): there is no scheduler and no network in the harness.
const SKIPPED = new Set(['20260930064005_b2_jobs_scheduler.sql', '20260930064359_b2_jobs_runner_secret_digest.sql', '20260930070018_b2_pg_net_extensions_schema.sql']);

// Runtime marker: scripts/check_harness_isolation.py fails a build that contains it.
export const HARNESS_MARKER = 'NCA_SCREENSHOT_HARNESS';

export async function startHarnessDb({ port = 54329, seedSql = '' } = {}) {
  const pg = new PGlite({ extensions: { pgcrypto, pg_trgm, uuid_ossp } });
  await pg.exec(SUPABASE_STAND_INS);
  const applied = [];
  const skipped = [];
  for (const file of readdirSync(MIGRATIONS).sort()) {
    if (SKIPPED.has(file)) {
      skipped.push(file);
      continue;
    }
    try {
      await pg.exec(readFileSync(path.join(MIGRATIONS, file), 'utf8'));
      applied.push(file);
    } catch (err) {
      throw new Error(`harness: migration ${file} did not apply: ${err.message}`);
    }
  }
  if (seedSql) await pg.exec(seedSql);
  const server = new PGLiteSocketServer({ db: pg, port, host: '127.0.0.1', maxConnections: 20 });
  await server.start();
  // The port actually bound (port 0 lets the system choose one).
  const bound = Number(String(server.getServerConn()).split(':').pop()) || port;
  let stopped = false;
  return {
    pg,
    applied,
    skipped,
    port: bound,
    url: `postgresql://postgres:postgres@127.0.0.1:${bound}/postgres`,
    async stop() {
      if (stopped) return;
      stopped = true;
      await server.stop();
      await pg.close();
    },
  };
}
