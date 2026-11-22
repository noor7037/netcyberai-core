-- C544: the homework follow-up on WhatsApp, each morning in India (src/lib/homework/follow-up.ts). The job finds, for
-- every school with Homework on, the homework due on the school day before that the teacher marked "Not done", and
-- queues one message per child and guardian through the send-gate's outbox, which decides whether each may go. This
-- file only schedules the job: no table changes, nothing about a child is stored here.
--
-- Rollback: select cron.unschedule('homework-follow-up'); drop function public.homework_follow_up_enqueue();
-- Plain SQL, no transaction wrapper.

-- Today's job (India date in the key), once, only once the deployed runner can run it (as ai_ops_daily_enqueue).
create function public.homework_follow_up_enqueue() returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into jobs (type, payload, idempotency_key, max_attempts)
  select 'homework.follow_up', jsonb_build_object('date', t.d), 'homework.follow_up:' || t.d, 4
    from (select to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as d) t
   where exists (select 1 from platform_settings p where p.key = 'jobs.handlers' and jsonb_typeof(p.value) = 'array' and p.value ? 'homework.follow_up')
  on conflict (idempotency_key) do nothing
$$;
revoke all on function public.homework_follow_up_enqueue() from public, anon, authenticated, service_role;

-- 02:15 UTC is 07:45 in India, after the default quiet hours (21:00 to 07:00); a school whose quiet hours end later
-- has its messages held by the outbox until they end. cron.schedule upserts by name. Where there is no scheduler (the
-- test harness), nothing is scheduled.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('homework-follow-up', '15 2 * * *', 'select public.homework_follow_up_enqueue()');
  end if;
end $$;
