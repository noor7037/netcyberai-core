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
    setRole: `set local role ${pgRole}`,
    setTenant: `select set_config('app.current_tenant_id', $1, true)`,
    setTenantArg: schoolIdOrNull ?? '',
    setRoleGuc: `select set_config('app.current_role', $1, true)`,
    setRoleArg: role,
    setUser: `select set_config('app.current_user_id', $1, true)`,
    checkLive: `select token_version, is_active, role from users where user_id = $1`,
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
//
// SET ROLE must be SET LOCAL, never plain SET. Confirmed live: DATABASE_URL
// runs through Supavisor in transaction mode (pooler.supabase.com:6543),
// which can hand a request's statement to a different physical Postgres
// backend than the one before it, EXCEPT while a transaction is open, when
// the backend is pinned. A plain `SET ROLE` inside a transaction that
// COMMITS persists at the session level, not just for that transaction
// (this is standard Postgres behavior, not a bug in Postgres) -- so the
// `reset role` below, run as its own statement AFTER commit, is a separate
// autocommit unit Supavisor is free to route to a DIFFERENT backend,
// leaving the ORIGINAL backend stuck as nca_super/app_user (nca_super is
// BYPASSRLS) for whatever unrelated request the pool hands that backend to
// next. `SET LOCAL ROLE` is guaranteed by Postgres itself to unwind at the
// end of the transaction on the SAME backend that ran it, regardless of
// any pooler's routing of later statements -- closing that leak entirely.
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
    // super_admin-specific tightening (Decision Log C35): every other
    // role's authority is a membership row, individually revocable, and
    // its is_active flip is deliberately only re-checked at refresh (see
    // refresh.ts) -- a bounded, accepted 15-minute worst case. super_admin
    // has no membership at all; its authority IS this one column, and it
    // is platform-scoped, cross-tenant. A demoted or revoked super_admin
    // must not keep nca_super (BYPASSRLS) reach for up to a full access
    // token lifetime, so this is checked live on every request that
    // reaches this function -- the same "immediate" guarantee
    // token_version already gets, not the looser refresh-only one.
    if (claims.role === 'super_admin' && live.role !== 'super_admin') {
      throw new SessionRevokedError('super_admin authority revoked');
    }

    // Impersonation (Prompt E Task 5, PRD §2.3): claims.sub/role/schoolId
    // above are already the TARGET user's real membership -- impersonation
    // carries no elevated logic of its own, it just resolves to a real
    // row and rides this same function. What's specific to it is this one
    // extra live check: the impersonation_sessions row backing the token
    // must still be active and unexpired, checked on every request, not
    // only at mint time -- the same "immediate, not refresh-cycle-bound"
    // guarantee token_version and the super_admin check above already get.
    if (claims.impersonation) {
      const { rows: impRows } = await client.query(
        `select 1 from impersonation_sessions
         where impersonation_id = $1 and ended_at is null and expires_at > now()`,
        [claims.impersonation.impersonationId]
      );
      if (!impRows[0]) {
        throw new SessionRevokedError('impersonation session expired or ended');
      }
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

// Escape hatch for trusted INTERNAL callers only (test harnesses, the
// Prompt E Task 0 diagnostic route) that need to create/tear down rows
// across schools without a real session's claims to derive tenant
// context from -- e.g. building throwaway cross-tenant fixtures before
// withTenantContext itself can be exercised. Unlike every other
// function in this file, this one takes NO claims and does NO live
// user check: callers must never let external/request-controlled input
// reach here, and must never use it to serve an actual user's request.
// It exists in this file, not inline at each call site, so the
// "every SET ROLE literal lives in db.ts" invariant check_choke_point.py
// enforces stays true even for this narrow exception.
export async function withSuperAdminBypass<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query('set local role nca_super'); // see withTenantContext's comment on why LOCAL, not plain SET
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
    await client.query('set local role app_user'); // see withTenantContext's comment on why LOCAL, not plain SET
    await client.query(`select set_config('app.current_user_id', $1, true)`, [userId]);
    // eslint-disable-next-line no-console -- TEMPORARY diag, removed with verify-prompt-e
    console.error('DIAG withSelfContext', {
      userIdArg: userId,
      currentUserIdSetting: (await client.query(`select current_setting('app.current_user_id', true) as v`)).rows[0].v,
      currentTenantIdSetting: (await client.query(`select current_setting('app.current_tenant_id', true) as v`)).rows[0].v,
      currentRole: (await client.query(`select current_user as v`)).rows[0].v,
    });
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    // eslint-disable-next-line no-console -- TEMPORARY diag, removed with verify-prompt-e
    console.error('DIAG withSelfContext error', String(err));
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    await client.query('reset role').catch(() => {});
    client.release();
  }
}
