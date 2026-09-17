-- =====================================================================
-- Role grants for app_user / nca_super / audit_writer.
-- [GAP] found while preparing to test RLS: db/rls_policies.sql creates
-- these three roles and writes policies for them, but never GRANTs
-- them base table privileges. RLS only restricts rows on top of an
-- existing GRANT -- without one, every query as app_user fails with
-- "permission denied for table X", not row-filtered results. This is
-- necessary for the locked policies file to do anything at all; it is
-- not a modification of that file (still applied byte-identical,
-- migration 20260917073745), just the grant layer it assumes exists.
--
-- nca_super has BYPASSRLS but still needs ordinary object grants --
-- BYPASSRLS only skips row-security policies, not the GRANT system.
-- =====================================================================

grant usage on schema public to app_user, nca_super, audit_writer;

grant select, insert, update, delete on all tables in schema public to app_user;
grant select, insert, update, delete on all tables in schema public to nca_super;
grant usage, select on all sequences in schema public to app_user, nca_super;

-- audit_writer: insert-only on audit_log, per its own stated purpose.
grant select, insert on audit_log to audit_writer;

-- Any table created after this point (there are none pending in this
-- session, but future migrations will add more) gets the same grants
-- automatically, so this doesn't need re-running per migration.
alter default privileges in schema public
  grant select, insert, update, delete on tables to app_user, nca_super;
alter default privileges in schema public
  grant usage, select on sequences to app_user, nca_super;

-- audit_log's own revoke (rls_policies.sql: "revoke update, delete on
-- audit_log from app_user, audit_writer") still holds: this migration
-- only grants select/insert/update/delete broadly and audit_log's
-- narrower revoke was already applied after the broader intent, in the
-- baseline file itself, before this migration ran -- reapply it here
-- too since this migration's blanket grant runs after the baseline
-- file and would otherwise silently re-open what that revoke closed.
revoke update, delete on audit_log from app_user, audit_writer;
