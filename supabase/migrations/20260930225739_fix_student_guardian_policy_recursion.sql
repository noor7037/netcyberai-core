-- HOTFIX (Decision Log C117): reading `students` or `parents` as app_user
-- failed with "infinite recursion detected in policy" on both databases
-- since 20260930214813_p1b_teacher_guardian_scope (C112).
--
-- Cause: `students.parent_scope_students` (baseline) reads
-- parent_student_map, and `parent_student_map.teacher_scope_parent_student_map`
-- (C112) read students. Postgres expands every policy of a table before
-- it knows the role, so students → parent_student_map → students is a loop
-- for every role, and every app read of students, guardians or their links
-- failed. The PGlite test schema had no parent_scope_students, so the tests
-- did not see it; it now does (test/db/base-schema.sql).
--
-- Fix: the guardian policies stop reading `students` under RLS. One more
-- helper, teacher_own_student_ids(), returns the ids of the students in the
-- signed-in teacher's own classes (same definition as teacher_own_class_ids,
-- same safety: SECURITY DEFINER, owner has BYPASSRLS, pinned search_path,
-- only the caller's own ids, EXECUTE for app_user only). Policies that read
-- it never expand another table's policies, so no loop is possible.
-- What a teacher may see is unchanged.
--
-- Applied test-first: test database, then prod, then the catalog snapshot.

create or replace function public.teacher_own_student_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(s.student_id), '{}'::uuid[])
  from students s
  where s.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    and s.class_id = any (public.teacher_own_class_ids())
$$;

revoke all on function public.teacher_own_student_ids() from public, anon, authenticated, service_role;
grant execute on function public.teacher_own_student_ids() to app_user;

drop policy if exists teacher_scope_parent_student_map on parent_student_map;
create policy teacher_scope_parent_student_map on parent_student_map
  as restrictive
  for all
  using (
    coalesce(current_setting('app.current_role', true), '') <> 'teacher'
    or student_id in (select unnest(public.teacher_own_student_ids()))
  )
  with check (
    coalesce(current_setting('app.current_role', true), '') <> 'teacher'
    or student_id in (select unnest(public.teacher_own_student_ids()))
  );

drop policy if exists teacher_scope_parents on parents;
create policy teacher_scope_parents on parents
  as restrictive
  for all
  using (
    coalesce(current_setting('app.current_role', true), '') <> 'teacher'
    or exists (
      select 1 from parent_student_map m
      where m.school_id = parents.school_id
        and m.parent_id = parents.parent_id
        and m.student_id in (select unnest(public.teacher_own_student_ids()))
    )
  )
  with check (
    coalesce(current_setting('app.current_role', true), '') <> 'teacher'
    or exists (
      select 1 from parent_student_map m
      where m.school_id = parents.school_id
        and m.parent_id = parents.parent_id
        and m.student_id in (select unnest(public.teacher_own_student_ids()))
    )
  );
