-- =====================================================================
-- Real bug found by the Prompt B2 verification suite, same technique
-- and same class as the Prompt B RLS fix: db/rls_policies.sql's
-- schools_tenant_isolation requires app.current_tenant_id to already be
-- set (or role=super_admin) before a school row is visible at all. But
-- resolving which schools a user belongs to -- the very first join
-- login needs, to show a school's NAME in the selection step or to look
-- it up for a single-membership auto-resolve -- happens BEFORE any
-- tenant is chosen. Confirmed directly: `select count(*) from schools`
-- as app_user with only app.current_user_id set (no tenant) returns 0,
-- for every school, unconditionally. A join from memberships to schools
-- for the school's name during login therefore always returns zero
-- rows -- a lockout for every non-super_admin login, not a security
-- control. Exact same chicken-and-egg shape as memberships_self and
-- users_self, one table further down the join.
--
-- Fix: a school is also visible if the caller holds ANY membership row
-- there (the exists() subquery is itself RLS-scoped by memberships_self,
-- so this can't be used to enumerate schools the caller does not
-- actually belong to). PERMISSIVE, ORs with schools_tenant_isolation,
-- SELECT-only -- narrower than a blanket bypass, and it doesn't touch
-- db/rls_policies.sql itself.
-- =====================================================================

create policy schools_visible_via_own_membership on schools
  for select using (
    exists (
      select 1 from memberships m
      where m.school_id = schools.school_id
        and m.user_id = current_setting('app.current_user_id', true)::uuid
    )
  );
