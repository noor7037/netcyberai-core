import { Pool, PoolClient } from 'pg';
import { databaseUrl } from './env';
import type { SessionClaims } from './types';

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: databaseUrl(), max: 10 });
  }
  return pool;
}

export class SessionRevokedError extends Error {
  constructor(reason: string) {
    super(`session revoked: ${reason}`);
    this.name = 'SessionRevokedError';
  }
}

// The literal statement sequence every DB-touching request runs, on one
// checked-out connection, inside one transaction -- exported as data so
// the verification suite can run the SAME sql (not a paraphrase of it)
// through Supabase's direct-SQL path when a real DATABASE_URL isn't
// available for app_backend yet. See the B2 report's "app_backend
// password handoff" section.
export function tenantContextStatements(schoolIdOrNull: string | null, role: string) {
  const pgRole = role === 'super_admin' ? 'nca_super' : 'app_user';
  return {
    setRole: `set role ${pgRole}`,
    setTenant: `select set_config('app.current_tenant_id', $1, true)`,
    setTenantArg: schoolIdOrNull ?? '',
    setRoleGuc: `select set_config('app.current_role', $1, true)`,
    setRoleArg: role,
    setUser: `select set_config('app.current_user_id', $1, true)`,
    checkLive: `select token_version, is_active from users where user_id = $1`,
    resetRole: `reset role`,
  };
}

// db/rls_policies.sql's own commented "per-request setup" example assumes
// the connection already IS app_user/nca_super (a LOGIN role, set once
// per pooled connection). That's not how those two roles are defined in
// the locked file -- both are `nobypassrls`/`bypassrls` with no LOGIN
// grant, reachable only via SET ROLE from an already-authenticated
// session. app_backend is that session (see the migration's comment
// header for why: INHERIT FALSE means a missed SET ROLE fails closed,
// not open). So this helper does one more step than the doc's example:
// SET ROLE, THEN the three set_config calls, all inside the same
// transaction, on the same connection -- never once per connection,
// exactly the footgun the doc warns about under a pooler.
export async function withTenantContext<T>(
  claims: SessionClaims,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  const stmts = tenantContextStatements(claims.schoolId, claims.role);
  try {
    await client.query('begin');
    await client.query(stmts.setRole);
    await client.query(stmts.setTenant, [stmts.setTenantArg]);
    await client.query(stmts.setRoleGuc, [stmts.setRoleArg]);
    await client.query(stmts.setUser, [claims.sub]);

    const { rows } = await client.query(stmts.checkLive, [claims.sub]);
    const live = rows[0];
    if (!live) {
      throw new SessionRevokedError('user row not found');
    }
    if (Number(live.token_version) !== claims.tokenVersion) {
      throw new SessionRevokedError('token_version mismatch');
    }
    if (live.is_active === false) {
      throw new SessionRevokedError('account deactivated');
    }

    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    await client.query(stmts.resetRole).catch(() => {});
    client.release();
  }
}

// sessions is not tenant data and carries no RLS policy at all (see the
// migration's comment header) -- it's reachable only via the direct
// grants made to app_backend itself. Anything touching it must run
// WITHOUT a SET ROLE: switching to app_user/nca_super would drop
// app_backend's own grants and turn every sessions-table query here
// into a permission-denied error, since neither app_user nor nca_super
// was ever granted access to it.
export async function withBackendConnection<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

// Pre-tenant lookups only: resolving a just-authenticated user's own
// users/memberships rows before app.current_tenant_id (or, for
// super_admin, before any tenant will ever exist) can be known. Sets
// only app.current_user_id and runs as app_user, relying on the
// users_self / memberships_self policies -- never nca_super, so this
// path carries no more privilege than "see your own rows."
export async function withSelfContext<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query('set role app_user');
    await client.query(`select set_config('app.current_user_id', $1, true)`, [userId]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    await client.query('reset role').catch(() => {});
    client.release();
  }
}
