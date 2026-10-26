-- AM-1 (C347, C351): the new tables under the two rules every school table keeps.
--
-- 1. The parent rule (C230-D): each school table carries a restrictive `<table>_no_parent` policy, so a parent session
--    is refused unless the table opens its own scope. Here: a guardian reads only their own child's exam numbers and
--    approved scripts of a publication in force (guardian_marking_sheets(), unchanged), and writes nothing; the
--    withdrawals, setups, uploads and report links are never a parent's.
-- 2. The platform role holds nothing on these tables (as on exams, papers and marks, C214): the report link reads only
--    through its definer functions.

create policy exam_withdrawals_no_parent on exam_withdrawals as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy exam_seat_numbers_no_parent on exam_seat_numbers as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or student_id = any ((select public.guardian_student_ids())::uuid[]))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy marking_setups_no_parent on marking_setups as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy marking_uploads_no_parent on marking_uploads as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy marking_report_links_no_parent on marking_report_links as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy marking_questions_no_parent on marking_questions as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or paper_id in (select s.paper_id from public.marking_sheets s where s.sheet_id in (select public.guardian_marking_sheets())))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy marking_sheets_no_parent on marking_sheets as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent' or sheet_id in (select public.guardian_marking_sheets()))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy marking_pages_no_parent on marking_pages as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent' or sheet_id in (select public.guardian_marking_sheets()))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy marking_marks_no_parent on marking_marks as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent' or sheet_id in (select public.guardian_marking_sheets()))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');

revoke all on exam_withdrawals, exam_seat_numbers, marking_setups, marking_questions, marking_uploads, marking_sheets, marking_pages, marking_marks, marking_report_links
  from nca_super;

-- 3. Control's monitor (C347): per school that has used AI marking, counts and ages only (no child, page or mark):
--    the pages kept this month in India (a duplicate is never read), the scripts in each state, and the oldest script
--    still waiting for the AI. For the platform role, which holds nothing on the tables themselves.
create function public.marking_monitor()
returns table (school_id uuid, pages_this_month integer, waiting integer, marking integer, marked integer, failed integer, approved integer, oldest_waiting timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select u.school_id,
         (select count(*)::integer from marking_pages g
           where g.school_id = u.school_id and g.state <> 'duplicate'
             and g.created_at >= (date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')),
         count(s.sheet_id) filter (where s.state = 'waiting')::integer,
         count(s.sheet_id) filter (where s.state = 'marking')::integer,
         count(s.sheet_id) filter (where s.state = 'marked')::integer,
         count(s.sheet_id) filter (where s.state = 'failed')::integer,
         count(s.sheet_id) filter (where s.state = 'approved')::integer,
         min(s.updated_at) filter (where s.state in ('waiting', 'marking'))
    from (select distinct school_id from marking_uploads) u
    left join marking_sheets s on s.school_id = u.school_id
   group by u.school_id
$$;
revoke all on function public.marking_monitor() from public, anon, authenticated, service_role, app_user;
grant execute on function public.marking_monitor() to nca_super;
