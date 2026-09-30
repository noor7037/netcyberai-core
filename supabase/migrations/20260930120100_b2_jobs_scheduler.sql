-- =====================================================================
-- B2 (Decision Log C97): the job sweeper's clock.
--
-- Every minute pg_cron calls jobs_sweeper_tick(), which POSTs to the app's
-- /api/jobs/run with `Authorization: Bearer <secret>` through pg_net. The
-- URL and secret live in Supabase Vault, never in this file:
--
--   select vault.create_secret('https://www.netcyberai.com/api/jobs/run', 'jobs_runner_url');
--   select vault.create_secret('<same value as JOBS_RUNNER_SECRET in Vercel>', 'jobs_runner_secret');
--
-- Until both exist the tick does nothing, so a project that serves no app
-- (or has not been configured yet) makes no calls. Why this clock and not
-- Vercel Cron: Vercel Hobby runs cron jobs at most once a day, too slow
-- for retries measured in minutes; pg_cron is free, already offered by
-- the database we run, and moves with it (build plan B3).
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.jobs_sweeper_tick() returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  runner_url    text;
  runner_secret text;
begin
  select decrypted_secret into runner_url from vault.decrypted_secrets where name = 'jobs_runner_url';
  select decrypted_secret into runner_secret from vault.decrypted_secrets where name = 'jobs_runner_secret';
  if runner_url is null or runner_secret is null then
    return;
  end if;
  perform net.http_post(
    url := runner_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || runner_secret),
    timeout_milliseconds := 25000
  );
end;
$$;

-- Only the owner (and pg_cron, running as the owner) may call it: it reads a
-- Vault secret (C94's lesson on SECURITY DEFINER functions).
revoke execute on function public.jobs_sweeper_tick() from public, anon, authenticated, service_role;

-- cron.schedule upserts by name, so replaying this file is harmless.
select cron.schedule('jobs-sweeper', '* * * * *', 'select public.jobs_sweeper_tick()');
-- pg_cron keeps every run's details forever unless told otherwise.
select cron.schedule('jobs-sweeper-history-cleanup', '17 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);
