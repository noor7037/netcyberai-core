-- School Link, timetable (C332; the build lead brief of 2026-10-24, item 3.2): a linked guardian reads, read only, the
-- published timetable (timetable_entries: class, weekday, period, subject) of their own children's classes, for a
-- child with the school's consent, as homework (C329) and notices (C331): guardian_class_ids() is reused. Proposals,
-- loads, teachers' unavailable periods and published versions stay closed. timetable_entries refuses a parent twice for
-- reading (no_parent, restrictive for every command; staff_read, restrictive for select): both now let the guardian's
-- own rows be read. no_parent's write check stays as it was; staff_read has none (select only). Its insert, update and
-- delete rules already name office roles only; new restrictive rules refuse a parent's update and delete outright, as
-- for every School Link table.

alter policy timetable_entries_no_parent on public.timetable_entries
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or class_id = any ((select public.guardian_class_ids())::uuid[]))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy timetable_entries_staff_read on public.timetable_entries
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator', 'accountant', 'super_admin'])
         or (current_setting('app.current_role', true) = 'teacher'
             and (teacher_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid or class_id = any (teacher_own_class_ids())))
         or (current_setting('app.current_role', true) = 'parent' and class_id = any ((select public.guardian_class_ids())::uuid[])));

create policy timetable_entries_parent_no_update on public.timetable_entries as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy timetable_entries_parent_no_delete on public.timetable_entries as restrictive for delete
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');

-- The subject names of that timetable (the syllabus's and homework's subjects were opened before).
alter policy subjects_no_parent on public.subjects
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or subject_id in (select u.subject_id from public.syllabus_units u)
         or subject_id in (select h.subject_id from public.homework h)
         or subject_id in (select t.subject_id from public.timetable_entries t))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
