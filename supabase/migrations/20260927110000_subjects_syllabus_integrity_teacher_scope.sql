-- Subjects and "taught today" (syllabus_progress) become writable through
-- the school app (api/app/subjects, api/app/syllabus). Three guarantees
-- the API relies on, enforced in the database rather than only in code:
--
-- 1. One subject name per school, case- and space-insensitive, so "Maths"
--    and " maths " cannot become two subjects that split a class's data.
--    Checked live before applying: zero duplicate names exist.
create unique index if not exists subjects_school_name_unique
  on subjects (school_id, lower(btrim(name)));

-- 2. One syllabus record per class, subject and day. The Daily Learning
--    Pulse carries one line per subject per day; marking the lesson again
--    updates that record (the API upserts on this key) instead of adding a
--    second line. Checked live: syllabus_progress has zero rows.
create unique index if not exists syllabus_progress_one_per_class_subject_day
  on syllabus_progress (school_id, class_id, subject_id, date);

-- 3. A teacher may read and write progress only for a class AND subject
--    they are assigned to in teacher_subjects, and only under their own
--    teacher_id. Restrictive, so it narrows the existing whole-school
--    syllabus_progress_tenant_isolation policy for the teacher role and
--    leaves every other role unchanged (same shape as
--    teacher_scope_attendance, but subject-level and owner-checked).
drop policy if exists teacher_scope_syllabus_progress on syllabus_progress;
create policy teacher_scope_syllabus_progress on syllabus_progress
  as restrictive
  for all
  using (
    current_setting('app.current_role', true) <> 'teacher'
    or exists (
      select 1
      from teacher_subjects ts
      join teachers t on t.teacher_id = ts.teacher_id
      where t.user_id = (current_setting('app.current_user_id', true))::uuid
        and ts.school_id = syllabus_progress.school_id
        and ts.class_id = syllabus_progress.class_id
        and ts.subject_id = syllabus_progress.subject_id
        and t.teacher_id = syllabus_progress.teacher_id
    )
  )
  with check (
    current_setting('app.current_role', true) <> 'teacher'
    or exists (
      select 1
      from teacher_subjects ts
      join teachers t on t.teacher_id = ts.teacher_id
      where t.user_id = (current_setting('app.current_user_id', true))::uuid
        and ts.school_id = syllabus_progress.school_id
        and ts.class_id = syllabus_progress.class_id
        and ts.subject_id = syllabus_progress.subject_id
        and t.teacher_id = syllabus_progress.teacher_id
    )
  );
