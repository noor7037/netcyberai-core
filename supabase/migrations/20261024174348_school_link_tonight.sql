-- School Link, tonight's practice (C335; 07 "M3, the rest", M3-5; L10): a linked guardian reads, read only, what their
-- own consented children's classes covered (the teacher's "taught today" record, syllabus_progress, status taught or
-- partial), so the child can practise it tonight. Never a topic recorded as delayed or not taught, never another class's,
-- and the app never selects the teacher's note. As the other School Link modules (C329 to C333): guardian_class_ids() is
-- reused; the table's parent refusal (no_parent, restrictive for every command) lets those rows be read and keeps its
-- write check; its teacher rule already passes a non-teacher and refuses nothing more; new restrictive rules refuse a
-- parent's update and delete outright (app_user holds the delete right on this table).

alter policy syllabus_progress_no_parent on public.syllabus_progress
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or (status in ('taught', 'partial') and class_id = any ((select public.guardian_class_ids())::uuid[])))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');

create policy syllabus_progress_parent_no_update on public.syllabus_progress as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy syllabus_progress_parent_no_delete on public.syllabus_progress as restrictive for delete
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');

-- The subject names of those topics (the others were opened before).
alter policy subjects_no_parent on public.subjects
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or subject_id in (select u.subject_id from public.syllabus_units u)
         or subject_id in (select h.subject_id from public.homework h)
         or subject_id in (select t.subject_id from public.timetable_entries t)
         or subject_id in (select p.subject_id from public.exam_papers p)
         or subject_id in (select g.subject_id from public.syllabus_progress g))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
