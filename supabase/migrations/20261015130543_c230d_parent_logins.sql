-- C230-D: parent logins (founder, 2026-10-15). A parent signs in with a username and a password the founder makes in
-- Control, and reaches only the family app. The account's id is the guardian's parent_id, so the parent rules already
-- written on students, attendance, marks and fees_ledger (parent_scope_*: own children through parent_student_map)
-- apply as they stand; a parent session sets app.current_role = 'parent' and app.current_user_id = the parent_id.
--
-- What this adds, all RESTRICTIVE (each narrows; none widens):
-- 1. Own rows only on the tables a parent session must read for itself: its guardian row, its links to children,
--    its users row and membership, and the consent rows of its own children.
-- 2. A parent session writes nothing anywhere (the family app is read-only for now).
-- 3. Deny by default: every other table with row level security refuses a parent session outright. A family screen
--    that needs a new table adds it to the list below with its own scope, in its own migration.
-- Staff sessions are untouched: every policy here is true whenever app.current_role is not 'parent'.

create policy parents_parent_self on parents as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or parent_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

create policy parent_student_map_parent_self on parent_student_map as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or parent_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

create policy users_parent_self on users as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

create policy memberships_parent_self on memberships as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

create policy consent_ledger_parent_scope on consent_ledger as restrictive for select
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or student_id in (select psm.student_id from parent_student_map psm
                            where psm.parent_id = nullif(current_setting('app.current_user_id', true), '')::uuid));

-- 2 and 3, by loop: the allowed tables get "reads only" for a parent; every other table refuses a parent outright.
do $$
declare
  t text;
  allowed constant text[] := array['students', 'attendance', 'marks', 'fees_ledger', 'parents', 'parent_student_map',
                                   'consent_ledger', 'users', 'memberships', 'schools', 'classes', 'academic_sessions'];
  not_parent constant text := $q$coalesce(current_setting('app.current_role', true), '') <> 'parent'$q$;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     order by c.relname
  loop
    if t = any (allowed) then
      execute format('create policy %I on %I as restrictive for insert with check (%s)', t || '_parent_no_insert', t, not_parent);
      execute format('create policy %I on %I as restrictive for update using (%s)', t || '_parent_no_update', t, not_parent);
      execute format('create policy %I on %I as restrictive for delete using (%s)', t || '_parent_no_delete', t, not_parent);
    else
      execute format('create policy %I on %I as restrictive for all using (%s) with check (%s)', t || '_no_parent', t, not_parent, not_parent);
    end if;
  end loop;
end $$;
