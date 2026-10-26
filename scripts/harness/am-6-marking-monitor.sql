-- PROPOSED MIGRATION for the lead (AM-6, C352): not in supabase/migrations because the brief says migrations are the
-- lead's. Until it is one, the harness (scripts/harness/run.mjs) and test/marking/intelligence.test.ts apply this file
-- to their throwaway databases. It is idempotent (create or replace, grants again), so applying it after it has
-- become a migration changes nothing. Name it by the usual rule, e.g. <timestamp>_am_6_marking_monitor.sql, and let the
-- test read it from there.
--
-- WHY: AM-1 gave the platform role no right on the marking tables ("The platform role holds nothing here"), rightly:
-- they hold children's scripts and marks. Control's monitor for AI marking (src/lib/control/marking-monitor.ts) needs
-- only counts and ages per school, so it reads them through this one definer function, which can return nothing else:
-- a school's name, numbers of pages and scripts, the plan's page limit and the time the oldest waiting script last
-- changed. No student, no page, no key, no word and no mark is read, because the function names none of those columns.
-- Only the platform role may run it (the grant below is the check: execute rights are tested against the caller). A test school is left out, as everywhere in Control.

create or replace function public.marking_monitor()
returns table (school_name text, pages_this_month integer, page_limit numeric, waiting integer, marking integer, marked integer, failed integer, approved_this_month integer, oldest_waiting_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  with month as (select (date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata') as starts),
       sheets as (
         select s.school_id,
                count(*) filter (where s.state = 'waiting')::int as waiting,
                count(*) filter (where s.state = 'marking')::int as marking,
                count(*) filter (where s.state = 'marked')::int as marked,
                count(*) filter (where s.state = 'failed')::int as failed,
                count(*) filter (where s.state = 'approved' and s.approved_at >= (select starts from month))::int as approved,
                min(s.updated_at) filter (where s.state = 'waiting') as oldest_waiting
           from marking_sheets s group by s.school_id),
       pages as (
         select g.school_id, count(*)::int as n from marking_pages g
          where g.state <> 'duplicate' and g.created_at >= (select starts from month) group by g.school_id),
       ever as (select g.school_id from marking_pages g group by g.school_id)
  select sc.name, coalesce(p.n, 0), case when jsonb_typeof(m.limits -> 'ai_marking_pages') = 'number' then (m.limits ->> 'ai_marking_pages')::numeric end,
         coalesce(k.waiting, 0), coalesce(k.marking, 0), coalesce(k.marked, 0), coalesce(k.failed, 0), coalesce(k.approved, 0), k.oldest_waiting
    from schools sc
    left join sheets k on k.school_id = sc.school_id
    left join pages p on p.school_id = sc.school_id
    left join ever e on e.school_id = sc.school_id
    left join school_module_entitlements m on m.school_id = sc.school_id and m.module_id = 'exams'
   where not sc.is_test_fixture
     and (k.school_id is not null or e.school_id is not null or jsonb_typeof(m.limits -> 'ai_marking_pages') = 'number')
   order by lower(sc.name), sc.school_id
$$;
revoke all on function public.marking_monitor() from public, anon, authenticated, service_role, app_user;
grant execute on function public.marking_monitor() to nca_super;
