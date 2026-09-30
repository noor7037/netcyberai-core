-- Teachers see guardians of their own classes only (supervisor review of
-- PR-2a, Decision Log C112). `parents` and `parent_student_map` had only
-- tenant isolation, so any teacher could read every guardian's phone and
-- email in the school (for example through GET
-- /api/app/students/[id]/guardians). Every write path to these tables is
-- office-only (canWriteMasterData), so narrowing the teacher role for all
-- commands changes no working flow; a teacher's own-class reads (absence
-- alerts, the Pulse) stay as they are.
--
-- One definition of "own classes", shared by the three teacher policies:
-- teacher_own_class_ids(), the classes the signed-in teacher teaches a
-- subject in (teacher_subjects) or is class teacher of, in the current
-- school. SECURITY DEFINER with a pinned search_path, so it reads
-- teacher_subjects / teachers / classes once, without re-entering their
-- policies; it only ever returns the caller's own class ids (it reads the
-- same GUCs every policy trusts). Called as `in (select unnest(…))`, an
-- uncorrelated subquery, so Postgres runs it once per query, not per row.
--
-- Applied test-first: test database, then prod, then the catalog snapshot.

create or replace function public.teacher_own_class_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct x.class_id), '{}'::uuid[])
  from (
    select ts.class_id
    from teacher_subjects ts
    join teachers t on t.school_id = ts.school_id and t.teacher_id = ts.teacher_id
    where t.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
      and ts.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    union
    select c.class_id
    from classes c
    where c.class_teacher_id = nullif(current_setting('app.current_user_id', true), '')::uuid
      and c.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  ) x
$$;

-- Supabase gives anon, authenticated and service_role EXECUTE on every new
-- public function; only app_user (the RLS subject) needs it (the Phase 0
-- lesson, 20260929061317).
revoke all on function public.teacher_own_class_ids() from public, anon, authenticated, service_role;
grant execute on function public.teacher_own_class_ids() to app_user;

-- Students: the same rule as before (C112), now through the helper.
drop policy if exists teacher_scope_students on students;
create policy teacher_scope_students on students
  as restrictive
  for select
  using (
    coalesce(current_setting('app.current_role', true), '') <> 'teacher'
    or class_id in (select unnest(public.teacher_own_class_ids()))
  );

-- Guardian links: only those of a student in the teacher's own classes.
drop policy if exists teacher_scope_parent_student_map on parent_student_map;
create policy teacher_scope_parent_student_map on parent_student_map
  as restrictive
  for all
  using (
    coalesce(current_setting('app.current_role', true), '') <> 'teacher'
    or exists (
      select 1 from students s
      where s.school_id = parent_student_map.school_id
        and s.student_id = parent_student_map.student_id
        and s.class_id in (select unnest(public.teacher_own_class_ids()))
    )
  )
  with check (
    coalesce(current_setting('app.current_role', true), '') <> 'teacher'
    or exists (
      select 1 from students s
      where s.school_id = parent_student_map.school_id
        and s.student_id = parent_student_map.student_id
        and s.class_id in (select unnest(public.teacher_own_class_ids()))
    )
  );

-- Guardians: only those linked to a student in the teacher's own classes.
drop policy if exists teacher_scope_parents on parents;
create policy teacher_scope_parents on parents
  as restrictive
  for all
  using (
    coalesce(current_setting('app.current_role', true), '') <> 'teacher'
    or exists (
      select 1
      from parent_student_map m
      join students s on s.school_id = m.school_id and s.student_id = m.student_id
      where m.school_id = parents.school_id
        and m.parent_id = parents.parent_id
        and s.class_id in (select unnest(public.teacher_own_class_ids()))
    )
  )
  with check (
    coalesce(current_setting('app.current_role', true), '') <> 'teacher'
    or exists (
      select 1
      from parent_student_map m
      join students s on s.school_id = m.school_id and s.student_id = m.student_id
      where m.school_id = parents.school_id
        and m.parent_id = parents.parent_id
        and s.class_id in (select unnest(public.teacher_own_class_ids()))
    )
  );
