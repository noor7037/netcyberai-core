-- Staff account management inside a school (Decision Log C89).
--
-- Principals and school admins must see the accounts of everyone who works
-- in their school to send someone a password-reset code. users_tenant_
-- isolation only matches users whose home school (users.school_id) is the
-- current tenant, so staff who joined through a membership from another
-- school, or with no home school, were invisible to the school they work in.
--
-- users_school_staff_read (PERMISSIVE, SELECT): a user row is visible
-- inside a tenant when that user holds a membership of the current tenant.
-- Tenant-scoped by construction, like every *_tenant_isolation policy, and
-- no wider than what users_tenant_isolation already shows staff of that
-- school. Deliberately no restrictive role overlay: users_tenant_isolation
-- already lets every role read its school's users (names on dashboards and
-- records), and an overlay would take that away. Who may LIST accounts and
-- send resets (principal, school_admin) is enforced in the API routes.
--
-- No write access changes. super_admin reads as nca_super (BYPASSRLS).

create policy users_school_staff_read on users
  as permissive
  for select
  using (
    exists (
      select 1
      from memberships m
      where m.user_id = users.user_id
        and m.school_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );
