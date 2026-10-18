-- C244 (wave C242, Setup complete: the rest of P7's first 10g row): the office keeps academic sessions and subjects.
--
-- 1. A SUBJECT IS RETIRED, NEVER DELETED. Marks, homework, timetable entries, syllabus rows and who-teaches-what all
--    name a subject, so a subject the school no longer teaches keeps its row and its history: `retired_at` is set
--    (null while the subject is in use). The pickers of the screens that follow show only subjects in use; nothing
--    that already refers to a retired subject changes.
-- 2. WHO WRITES. Until now `subjects` and `academic_sessions` carried tenant isolation only, and every role of the
--    school could write them at the database (the routes alone held the line). Now the database holds it too: the
--    principal and the school admin add and change them (the same two roles as canWriteMasterData, so the subjects
--    route on main keeps working); nobody else, and no role deletes a session (classes and exams refer to it; the
--    one-current-session rule is the partial unique index of migration 20260924183326). Reads are unchanged: every
--    role of the school reads its own school's rows, as the timetable, exams and homework already do.
-- 3. Nothing on main breaks: the only writers of these tables are the office routes and the seeds (run as the owner).

alter table subjects add column retired_at timestamptz;
comment on column subjects.retired_at is 'C244: when the school stopped teaching this subject; null while it is in use. A subject is retired, never deleted.';

-- Subjects: written by the office, in its own school (tenant isolation holds the school).
create policy subjects_office_insert on subjects as restrictive for insert
  with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin']));
create policy subjects_office_update on subjects as restrictive for update
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin']))
  with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin']));
create policy subjects_office_delete on subjects as restrictive for delete
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin']));

-- Academic sessions: added and changed by the office; never deleted through the app.
create policy academic_sessions_office_insert on academic_sessions as restrictive for insert
  with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin']));
create policy academic_sessions_office_update on academic_sessions as restrictive for update
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin']))
  with check (current_setting('app.current_role', true) = any (array['principal', 'school_admin']));
create policy academic_sessions_no_delete on academic_sessions as restrictive for delete using (false);
