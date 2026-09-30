import { readFileSync } from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import type { SessionClaims } from '@/lib/auth/types';
import type { Sql } from '@/lib/jobs/types';

// Real Postgres (PGlite, compiled to WebAssembly) for the B2 tests (C98):
// the base schema slice, then the B2 migrations applied verbatim. The context wrappers below run the same statements as
// src/lib/auth/db.ts (SET LOCAL ROLE, set_config), so RLS and grants are
// exercised as in production. One connection: calls are serialized.

const ROOT = path.resolve(__dirname, '../..');
// The B2 migrations that need no Supabase-only extension (pg_cron, pg_net,
// Vault), applied verbatim and in order.
export const B2_MIGRATIONS = ['20260930063944_b2_onboarding_pipeline.sql', '20260930065803_b2_invitation_needs_founder.sql'].map((f) =>
  readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8')
);
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

type QueryResult = { rows: any[]; rowCount: number };
export type TestDb = {
  pg: PGlite;
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
  // The callback gets a pg-compatible client (query(text, params) → rows, rowCount).
  platform<T>(fn: (db: Sql) => Promise<T>): Promise<T>;
  tenant<T>(claims: Pick<SessionClaims, 'role' | 'schoolId' | 'sub'>, fn: (db: Sql) => Promise<T>): Promise<T>;
  asRole<T>(role: 'app_user' | 'app_backend' | 'anon' | 'authenticated', gucs: { tenant?: string; role?: string; user?: string }, fn: (db: Sql) => Promise<T>): Promise<T>;
};

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite({ extensions: { pgcrypto } });
  await pg.exec(readFileSync(path.join(__dirname, 'base-schema.sql'), 'utf8'));
  for (const sql of B2_MIGRATIONS) await pg.exec(sql);

  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  };
  const query = async (sql: string, params: unknown[] = []): Promise<QueryResult> => {
    const res = await pg.query(sql, params as any[]);
    return { rows: res.rows as any[], rowCount: res.affectedRows ?? res.rows.length };
  };
  const inTx = <T>(setup: string[], gucs: [string, string][], fn: (db: Sql) => Promise<T>) =>
    serial(async () => {
      await pg.exec('begin');
      try {
        for (const s of setup) await pg.exec(s);
        for (const [k, v] of gucs) await pg.query(`select set_config($1, $2, true)`, [k, v]);
        const out = await fn({ query } as unknown as Sql);
        await pg.exec('commit');
        return out;
      } catch (err) {
        await pg.exec('rollback');
        throw err;
      }
    });

  return {
    pg,
    query: (sql, params) => serial(() => query(sql, params)),
    platform: (fn) => inTx(['set local role nca_super'], [], fn),
    tenant: (claims, fn) =>
      inTx(
        [`set local role ${claims.role === 'super_admin' ? 'nca_super' : 'app_user'}`],
        [
          ['app.current_tenant_id', claims.schoolId ?? NIL_UUID],
          ['app.current_role', claims.role],
          ['app.current_user_id', claims.sub],
        ],
        fn
      ),
    asRole: (role, gucs, fn) =>
      inTx(
        [`set local role ${role}`],
        [
          ['app.current_tenant_id', gucs.tenant ?? NIL_UUID],
          ['app.current_role', gucs.role ?? ''],
          ['app.current_user_id', gucs.user ?? NIL_UUID],
        ],
        fn
      ),
  };
}
