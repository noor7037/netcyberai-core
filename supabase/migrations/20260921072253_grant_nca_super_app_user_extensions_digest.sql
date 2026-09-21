-- Correction to the prior migration: audit_log inserts run under
-- withTenantContext's SET ROLE target (nca_super for super_admin,
-- app_user for every other role), never as app_backend itself --
-- app_backend is only the pooled LOGIN connection that immediately
-- SET ROLEs away (see src/lib/auth/db.ts's own comment on why: both
-- roles are NOINHERIT so a missed SET ROLE fails closed). Confirmed
-- live: granting extensions access to app_backend alone still produced
-- "permission denied for schema extensions" under nca_super. Grant to
-- both actual executing roles instead.
grant usage on schema extensions to nca_super, app_user;
grant execute on function extensions.digest(text, text) to nca_super, app_user;
