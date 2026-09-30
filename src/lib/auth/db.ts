import { Pool, PoolClient } from 'pg';
import { databaseUrl } from './env';
import type { SessionClaims } from './types';

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) {
    // connectionTimeoutMillis: pg's default is no timeout, so an
    // unreachable database left requests hanging for minutes (until the
    // OS gave up on TCP) and a public form spinning with no answer.
    // Ten seconds turns that into a prompt, visible error.
    pool = new Pool({ connectionString: databaseUrl(), max: 10, connectionTimeoutMillis: 10_000 });
  }
  return pool;
}

export class SessionRevokedError extends Error {
  constructor(reason: string) {
    super(`session revoked: ${reason}`);
    this.name = 'SessionRevokedError';
  }
}

// Reserved, never-generated (gen_random_uuid() cannot produce it) uuid
// used as app.current_tenant_id's value whenever there's no real tenant
// (super_admin's platform-scoped requests, and withSelfContext's pre-
// tenant lookups) -- see withSelfContext's own comment for why this is a
// real uuid sentinel and not an empty string or an attempt to unset the
// GUC. Every tenant_isolation policy's `school_id = current_setting(...)::
// uuid` cast stays valid, and the comparison correctly excludes every row,
// exactly as intended.
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

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
    setTenantArg: schoolIdOrNull ?? NIL_UUID,
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

// Diagnostic-only, narrower sibling of withSuperAdminBypass: Prompt F's
// Task 0 C38-pattern route needs to prove a specific claim -- that
// SET LOCAL ROLE does not leak from one pooled request onto the next
// (Decision Log C40/C42) -- which means observing TWO DIFFERENT roles
// on what may be the same reused physical backend, back to back. That
// can't be done through withTenantContext (it demands a real, live
// users row and throws otherwise) or withSuperAdminBypass (hardcoded
// to nca_super). This is that same trusted-internal-caller exception,
// generalized to a caller-chosen role from a fixed allowlist -- never
// callable with anything but one of these two literal strings, so it
// stays exactly as narrow as the thing it's proving, and, like
// withSuperAdminBypass, lives here so check_choke_point.py's "every
// SET ROLE literal lives in db.ts" invariant holds even for it.
const ROLE_PROBE_ALLOWED = ['app_user', 'nca_super'] as const;
export async function withRoleProbe<T>(
  role: (typeof ROLE_PROBE_ALLOWED)[number],
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (!ROLE_PROBE_ALLOWED.includes(role)) {
    throw new Error(`withRoleProbe: role must be one of ${ROLE_PROBE_ALLOWED.join(', ')}`);
  }
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${role}`); // see withTenantContext's comment on why LOCAL, not plain SET -- role is never request-controlled, checked against ROLE_PROBE_ALLOWED above
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
//
// Confirmed live, twice: (1) app.current_tenant_id read back as '' at the
// start of a transaction that never itself touched it -- some earlier,
// unrelated, already-committed transaction's value was still visible here,
// contrary to what set_config(..., true) ("local") is supposed to
// guarantee. (2) neither set_config(name, NULL, true) NOR a plain RESET
// actually restores it to NULL once contaminated this way -- both were
// tried live and neither worked; set_config with a NULL new_value is a
// documented no-op (it returns the current value unchanged, it does not
// clear it), and RESET here reverted to the same stuck '', not to NULL.
// "Unset" is therefore not a state this code can reliably get back to on
// this connection, from this function, by any means -- so it doesn't try.
// Instead, app.current_tenant_id is always pinned to the nil UUID: a
// syntactically valid uuid (so the tenant_isolation policies' ::uuid cast
// on it can never fail the way '' does) that gen_random_uuid() will not
// produce and no real school_id can equal (so it excludes every row via
// that policy exactly as an unset value was meant to) -- this function's
// actual visibility guarantee comes entirely from the *_self policies
// keyed on app.current_user_id below, never from tenant_isolation.
export async function withSelfContext<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query('set local role app_user'); // see withTenantContext's comment on why LOCAL, not plain SET
    await client.query(`select set_config('app.current_tenant_id', $1, true)`, [NIL_UUID]);
    await client.query(`select set_config('app.current_role', '', true)`);
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

// ---- account security helpers (C90) ----------------------------------------
// Fixed statements, parameterized input, no request-chosen role. They run as
// nca_super because users.token_version and users.phone are otherwise only
// writable inside a tenant context, and these run before one exists (sign-in
// by mobile number) or on the signed-in user's own row.

async function asAccountService<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withPlatformService(fn);
}

// Platform work that belongs to no school session (C97): the job runner,
// public school applications before any tenant exists, and the founder's
// approvals. Runs as nca_super (BYPASSRLS) in one transaction with SET
// LOCAL ROLE, like asAccountService above. Callers pass fixed, parameterized
// statements only; request input is validated before it reaches them and is
// never used to choose a role, a table or a school context.
export async function withPlatformService<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
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

// Every access token, refresh token and remembered device of the user stops
// working on its next use (all carry the old token_version).
export async function bumpTokenVersion(userId: string): Promise<number> {
  return asAccountService(async (client) => {
    const { rows } = await client.query(
      `update users set token_version = token_version + 1, updated_at = now() where user_id = $1 returning token_version`,
      [userId]
    );
    if (!rows[0]) throw new Error('bumpTokenVersion: no such user');
    return Number(rows[0].token_version);
  });
}

// Sign-in by mobile number: the account's email, only when exactly one active
// account has that number (compared on the last 10 digits).
export async function emailForPhone(tenDigits: string): Promise<string | null> {
  return asAccountService(async (client) => {
    const { rows } = await client.query(
      `select email from users
       where is_active and email is not null and phone is not null
         and right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1
       limit 2`,
      [tenDigits]
    );
    return rows.length === 1 ? (rows[0].email as string) : null;
  });
}

export async function ownPhone(userId: string): Promise<string | null> {
  return asAccountService(async (client) => {
    const { rows } = await client.query(`select phone from users where user_id = $1`, [userId]);
    return (rows[0]?.phone as string | null) ?? null;
  });
}

// Sets (or clears, with null) the signed-in user's own mobile number.
// Returns false when another account already uses that number.
export async function setOwnPhone(userId: string, phone: string | null): Promise<boolean> {
  return asAccountService(async (client) => {
    if (phone) {
      const { rows } = await client.query(
        `select 1 from users where user_id <> $1 and phone is not null
           and right(regexp_replace(phone, '\\D', '', 'g'), 10) = right($2, 10) limit 1`,
        [userId, phone]
      );
      if (rows.length) return false;
    }
    await client.query(`update users set phone = $2, updated_at = now() where user_id = $1`, [userId, phone]);
    return true;
  });
}
