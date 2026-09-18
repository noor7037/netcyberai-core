-- =====================================================================
-- Prompt B2 (real login) additive migration. Three independent pieces,
-- none of which touch db/schema.sql or db/rls_policies.sql:
--
-- 1. users_self: the same chicken-and-egg problem memberships_self
--    already solves, one table over. At login (and at every refresh)
--    the server needs to read the AUTHENTICATING user's own row --
--    role (to check the super_admin platform-scope case) and
--    token_version (to snapshot/compare) -- before app.current_tenant_id
--    is known, sometimes before it will ever be known (super_admin has
--    no tenant). users_tenant_isolation alone would return zero rows
--    for that lookup: a lockout, not a control. Same fix, same shape:
--    a user can always see their own row by user_id.
--
-- 2. sessions: server-side bookkeeping for the rotating, revocable
--    refresh token PRD Sec2.3 requires. This is not tenant data --
--    it's never read through a request that has resolved a school_id,
--    so it deliberately carries no RLS policy at all; it is reachable
--    only by roles explicitly granted access below (app_backend
--    directly, before any SET ROLE), the same way audit_writer gets a
--    narrow direct grant rather than going through app_user/nca_super.
--
-- 3. app_backend: the LOGIN role the Next.js server actually connects
--    as (nca_super/app_user themselves are NOLOGIN in db/rls_policies.sql
--    by design -- reached only via SET ROLE from an already-connected
--    session). Membership in both is granted WITH INHERIT FALSE (PG16+):
--    connecting as app_backend confers neither role's privileges until
--    the request handler executes an explicit SET ROLE for the request
--    it just resolved. A missed SET ROLE therefore fails CLOSED --
--    app_backend itself is granted nothing on tenant tables -- rather
--    than silently running as whichever role Postgres defaults to.
--
--    No password is set here, deliberately: per this project's
--    credential-handling rule, a value that would let anyone connect
--    as this role is not something this migration chooses or sees.
--    The role exists, structurally correct, but cannot authenticate
--    until an operator runs `alter role app_backend password '...'`
--    (Supabase SQL editor or dashboard) and hands the resulting
--    connection string to the app via env var -- the same handoff
--    pattern already used for WhatsApp/Razorpay credentials.
-- =====================================================================

create policy users_self on users
  for select using (
    user_id = current_setting('app.current_user_id', true)::uuid
  );

create table sessions (
  session_id             uuid primary key default gen_random_uuid(),
  user_id                uuid not null references users(user_id),
  refresh_token_hash     text not null unique,
  selected_school_id     uuid references schools(school_id),
  token_version_snapshot integer not null,
  aal                    text not null default 'aal1' check (aal in ('aal1', 'aal2')),
  created_at             timestamptz not null default now(),
  last_used_at           timestamptz not null default now(),
  expires_at             timestamptz not null,
  revoked_at             timestamptz
);
create index idx_sessions_user on sessions(user_id);
create index idx_sessions_active on sessions(refresh_token_hash) where revoked_at is null;

create role app_backend login;

grant usage on schema public to app_backend;
grant select, insert, update on sessions to app_backend;

grant app_user to app_backend with inherit false;
grant nca_super to app_backend with inherit false;
