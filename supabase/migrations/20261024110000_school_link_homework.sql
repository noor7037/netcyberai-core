-- School Link, homework (C329; the build lead brief of 2026-10-23, item 2): a linked guardian reads the homework set
-- for their own children's classes (class and section) and their own children's done marks, read only, for a child
-- whose core-records consent is on the school's ledger (a test school's fictional children need none), as section 5 of
-- school_link.sql does for the syllabus. The app reads it AS that guardian (withGuardianContext), so these rules decide.
--
-- Each homework table refuses a parent twice (its no_parent rule and its staff rule, both restrictive, for every
-- command). Both now let the guardian's own rows be READ, and neither lets a parent write: every write check stays as
-- it was (no_parent refuses a parent; staff names the staff roles only, now written out, because a rule without one
-- checks writes against its widened read). A delete and an update are checked against the read rule, so a new
-- restrictive rule per table refuses a parent's update and delete outright. Attachments are not opened (files).

-- 1. The guardian's own active children (with the school's consent) and their classes, as the session's parent sees
--    them. Invoker functions: they read under the caller's own row rules, so they never widen anything themselves.
create function public.guardian_student_ids() returns uuid[]
language sql stable security invoker set search_path = '' as $$
  select coalesce(array_agg(s.student_id), '{}'::uuid[])
    from public.students s
    join public.parent_student_map m on m.student_id = s.student_id and m.school_id = s.school_id
   where coalesce(current_setting('app.current_role', true), '') = 'parent'
     and m.parent_id = nullif(current_setting('app.current_user_id', true), '')::uuid
     and s.status = 'active'
     and (exists (select 1 from public.schools sc where sc.school_id = s.school_id and sc.is_test_fixture)
          or coalesce((select c.granted from public.consent_ledger c
                        where c.student_id = s.student_id and c.purpose = 'core_records'
                        order by c.created_at desc limit 1), false))
$$;

create function public.guardian_class_ids() returns uuid[]
language sql stable security invoker set search_path = '' as $$
  select coalesce(array_agg(distinct s.class_id) filter (where s.class_id is not null), '{}'::uuid[])
    from public.students s
   where s.student_id = any (public.guardian_student_ids())
$$;

revoke all on function public.guardian_student_ids(), public.guardian_class_ids() from public;
grant execute on function public.guardian_student_ids(), public.guardian_class_ids() to app_user;

-- 2. The homework a class was set (homework_targets: one row per class and section it was set for).
alter policy homework_targets_no_parent on public.homework_targets
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or class_id = any ((select public.guardian_class_ids())::uuid[]))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy homework_targets_staff on public.homework_targets
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'teacher', 'super_admin'])
         or (current_setting('app.current_role', true) = 'parent' and class_id = any ((select public.guardian_class_ids())::uuid[])))
  with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'teacher', 'super_admin']));

-- 3. The homework itself: only a piece set for one of the guardian's children's classes.
alter policy homework_no_parent on public.homework
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or exists (select 1 from public.homework_targets t
                     where t.school_id = homework.school_id and t.homework_id = homework.homework_id
                       and t.class_id = any ((select public.guardian_class_ids())::uuid[])))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy homework_staff on public.homework
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'teacher', 'super_admin'])
         or (current_setting('app.current_role', true) = 'parent'
             and exists (select 1 from public.homework_targets t
                          where t.school_id = homework.school_id and t.homework_id = homework.homework_id
                            and t.class_id = any ((select public.guardian_class_ids())::uuid[]))))
  with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'teacher', 'super_admin']));

-- 4. Done marks: the guardian's own children's only, never a classmate's.
alter policy homework_status_no_parent on public.homework_status
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or student_id = any ((select public.guardian_student_ids())::uuid[]))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy homework_status_staff on public.homework_status
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'teacher', 'super_admin'])
         or (current_setting('app.current_role', true) = 'parent' and student_id = any ((select public.guardian_student_ids())::uuid[])))
  with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'teacher', 'super_admin']));

-- 5. A parent never updates or deletes homework, a class's piece or a done mark.
create policy homework_parent_no_update on public.homework as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy homework_parent_no_delete on public.homework as restrictive for delete
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy homework_targets_parent_no_update on public.homework_targets as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy homework_targets_parent_no_delete on public.homework_targets as restrictive for delete
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy homework_status_parent_no_update on public.homework_status as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy homework_status_parent_no_delete on public.homework_status as restrictive for delete
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');

-- 6. The subject names of that homework (the syllabus's subjects were opened in school_link.sql section 5).
alter policy subjects_no_parent on public.subjects
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or subject_id in (select u.subject_id from public.syllabus_units u)
         or subject_id in (select h.subject_id from public.homework h))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
