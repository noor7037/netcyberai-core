-- AM-8 (C230-AH, C356): answer-sheet pictures of a paper whose class's result was never published are deleted 180 days
-- after the paper's last upload; the paper's screen shows the date.
--
-- When a paper's pictures go is now one function, marking_picture_deadline, read by the sweep (marking_pictures_due)
-- and by the paper's screen (marking_pictures_until), so the date shown is the date they go:
--   - a publication in force: its time plus the school's "script_days" (Exams settings, 30 to 365, else 90), as C230-AG;
--   - no result of the class ever published: the paper's last upload plus 180 days (a later publication follows the
--     rule above instead);
--   - a result published and then reopened, not published again: no date (the next publication starts the count).
-- A page taken out of its script still goes at the next sweep. Marks, each question's marks and teachers' notes stay.
-- The sweep now works out each paper's date once, not once for each page.

-- ---- when a paper's pictures go ------------------------------------------------------------------------------------------

create function public.marking_picture_deadline(p_school_id uuid, p_paper_id uuid) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select case
           when f.published_at is not null then f.published_at + make_interval(days => coalesce((
             select least(365, greatest(30, round((s.setting_values ->> 'script_days')::numeric)::int))
               from school_settings s
              where s.school_id = p_school_id and s.module_id = 'exams' and jsonb_typeof(s.setting_values -> 'script_days') = 'number'), 90))
           when not f.ever then (select max(u.created_at) from marking_uploads u where u.school_id = p_school_id and u.paper_id = p_paper_id) + interval '180 days'
         end
    from (select (select x.published_at from exam_publications x
                   where x.school_id = p.school_id and x.exam_id = p.exam_id and x.class_id = p.class_id and x.reopened_at is null
                   order by x.version desc limit 1) as published_at,
                 exists (select 1 from exam_publications x where x.school_id = p.school_id and x.exam_id = p.exam_id and x.class_id = p.class_id) as ever
            from exam_papers p
           where p.school_id = p_school_id and p.paper_id = p_paper_id) f
$$;
revoke all on function public.marking_picture_deadline(uuid, uuid) from public, anon, authenticated, service_role, app_user, nca_super;

-- The pictures due to go, oldest pages first, at most p_limit (up to 1000): every page taken out, and every page of a
-- paper whose date has passed. For the platform role (the sweep) only.
create or replace function public.marking_pictures_due(p_limit integer)
returns table (school_id uuid, page_id uuid, storage_key text)
language sql stable security definer set search_path = public, pg_temp as $$
  with papers as (
    select distinct g.school_id, g.paper_id from marking_pages g where g.picture_gone_at is null
  ), past as (
    select p.school_id, p.paper_id from papers p where public.marking_picture_deadline(p.school_id, p.paper_id) < now()
  )
  select g.school_id, g.page_id, g.storage_key
    from marking_pages g
   where g.picture_gone_at is null
     and (g.state = 'removed' or (g.school_id, g.paper_id) in (select school_id, paper_id from past))
   order by g.school_id, g.created_at, g.page_id
   limit least(greatest(coalesce(p_limit, 0), 0), 1000)
$$;

-- am_7_followups' per-page rule, now in marking_picture_deadline.
drop function public.marking_picture_due(uuid, uuid, text);

-- ---- the date on the paper's screen --------------------------------------------------------------------------------------

-- For a paper the viewer may read (its teachers and the office, as may_read_marking): the date its pictures go (null
-- while a reopened result is not published again) and why ('published', 'unpublished' or 'reopened'), and whether any
-- picture of it is still kept.
create function public.marking_pictures_until(p_paper_id uuid)
returns table (until timestamptz, basis text, kept boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select public.marking_picture_deadline(p.school_id, p.paper_id),
         case when exists (select 1 from exam_publications x where x.school_id = p.school_id and x.exam_id = p.exam_id and x.class_id = p.class_id and x.reopened_at is null) then 'published'
              when exists (select 1 from exam_publications x where x.school_id = p.school_id and x.exam_id = p.exam_id and x.class_id = p.class_id) then 'reopened'
              else 'unpublished' end,
         exists (select 1 from marking_pages g where g.school_id = p.school_id and g.paper_id = p.paper_id and g.picture_gone_at is null and g.state <> 'removed')
    from exam_papers p
   where p.paper_id = p_paper_id
     and p.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and public.may_read_marking(p_paper_id)
$$;
revoke all on function public.marking_pictures_until(uuid) from public, anon, authenticated, service_role, nca_super;
grant execute on function public.marking_pictures_until(uuid) to app_user;
