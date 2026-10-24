-- School Link, published results (C333; the build lead brief of 2026-10-24, item 3.3): a linked guardian reads, read
-- only, their own consented children's results ONLY as the school published them for the child's class (a publication
-- in force: not reopened), never a mark still being entered: the papers and their subjects, the child's marks, the class
-- teacher's remark and the co-scholastic grades, graded by the scheme kept with the publication, as the report card is.
--
-- Publications hold every child's kept attendance and recognition, so their rows are never opened to a parent. One
-- function, run by its owner, answers for the session's guardian only: the publications in force of their own children's
-- classes (guardian_class_ids(), reused), with exam, class, version, the kept grading scheme and when, nothing else.
-- exam_papers then opens for exactly those (exam, class) pairs, and everything else follows from the papers a parent can
-- see. As homework, notices and timetable (C329, C331, C332): each table's parent refusals let those rows be read; no
-- write check changes (the select-only reader rules have none); new restrictive rules refuse a parent's update and
-- delete on every table opened here.
--
-- marks already let a parent role read through marks_readers, narrowed only to the parent's own children by
-- parent_scope_marks: also their marks still being entered, and with no regard to the school's consent. That rule now
-- also asks for a published paper and the guardian's own consented child, for every parent session.

-- 1. The guardian's publications in force.
create function public.guardian_publications()
returns table (exam_id uuid, class_id uuid, version integer, scheme jsonb, published_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select x.exam_id, x.class_id, x.version, x.scheme, x.published_at
    from public.exam_publications x
   where coalesce(current_setting('app.current_role', true), '') = 'parent'
     and x.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and x.reopened_at is null
     and x.class_id = any (public.guardian_class_ids())
$$;
revoke all on function public.guardian_publications() from public;
grant execute on function public.guardian_publications() to app_user;

-- 2. Papers: only those of a publication in force for one of the guardian's children's classes.
alter policy exam_papers_no_parent on public.exam_papers
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or (exam_id, class_id) in (select g.exam_id, g.class_id from public.guardian_publications() g))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy exam_papers_readers on public.exam_papers
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
         or (current_setting('app.current_role', true) = 'teacher' and class_id in (select unnest(teacher_own_class_ids())))
         or (current_setting('app.current_role', true) = 'parent'
             and (exam_id, class_id) in (select g.exam_id, g.class_id from public.guardian_publications() g)));

-- 3. Exams: those the guardian can see a paper of.
alter policy exams_no_parent on public.exams
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or exam_id in (select p.exam_id from public.exam_papers p))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy exams_readers on public.exams
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
         or (current_setting('app.current_role', true) = 'teacher'
             and exists (select 1 from exam_papers p
                          where p.school_id = exams.school_id and p.exam_id = exams.exam_id and p.class_id in (select unnest(teacher_own_class_ids()))))
         or (current_setting('app.current_role', true) = 'parent' and exam_id in (select p.exam_id from public.exam_papers p)));

-- 4. Marks: the guardian's own consented child's, on a published paper only (for every parent session).
alter policy parent_scope_marks on public.marks
  using (current_setting('app.current_role', true) <> 'parent'
         or (student_id = any ((select public.guardian_student_ids())::uuid[])
             and paper_id in (select p.paper_id from public.exam_papers p)));

-- 5. The class teacher's remark and the co-scholastic grades: the guardian's own consented child's, of a published
--    (exam, class).
alter policy report_remarks_no_parent on public.report_remarks
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or (student_id = any ((select public.guardian_student_ids())::uuid[])
             and exists (select 1 from public.exam_papers p where p.exam_id = report_remarks.exam_id and p.class_id = report_remarks.class_id)))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy report_remarks_readers on public.report_remarks
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
         or (current_setting('app.current_role', true) = 'teacher' and class_id in (select unnest(teacher_own_class_ids())))
         or (current_setting('app.current_role', true) = 'parent'
             and student_id = any ((select public.guardian_student_ids())::uuid[])
             and exists (select 1 from public.exam_papers p where p.exam_id = report_remarks.exam_id and p.class_id = report_remarks.class_id)));
alter policy co_scholastic_grades_no_parent on public.co_scholastic_grades
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or (student_id = any ((select public.guardian_student_ids())::uuid[])
             and exists (select 1 from public.exam_papers p where p.exam_id = co_scholastic_grades.exam_id and p.class_id = co_scholastic_grades.class_id)))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy co_scholastic_grades_readers on public.co_scholastic_grades
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'academic_coordinator'])
         or (current_setting('app.current_role', true) = 'teacher' and class_id in (select unnest(teacher_own_class_ids())))
         or (current_setting('app.current_role', true) = 'parent'
             and student_id = any ((select public.guardian_student_ids())::uuid[])
             and exists (select 1 from public.exam_papers p where p.exam_id = co_scholastic_grades.exam_id and p.class_id = co_scholastic_grades.class_id)));

-- 6. A parent never updates or deletes any of it (marks already refuse a parent's every write).
create policy exam_papers_parent_no_update on public.exam_papers as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy exam_papers_parent_no_delete on public.exam_papers as restrictive for delete
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy exams_parent_no_update on public.exams as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy exams_parent_no_delete on public.exams as restrictive for delete
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy report_remarks_parent_no_update on public.report_remarks as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy report_remarks_parent_no_delete on public.report_remarks as restrictive for delete
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy co_scholastic_grades_parent_no_update on public.co_scholastic_grades as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy co_scholastic_grades_parent_no_delete on public.co_scholastic_grades as restrictive for delete
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');

-- 7. The subject names of those papers.
alter policy subjects_no_parent on public.subjects
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or subject_id in (select u.subject_id from public.syllabus_units u)
         or subject_id in (select h.subject_id from public.homework h)
         or subject_id in (select t.subject_id from public.timetable_entries t)
         or subject_id in (select p.subject_id from public.exam_papers p))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
