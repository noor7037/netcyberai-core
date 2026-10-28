-- W5-7 (C230-AQ, C230-AS; Decision Log C394): the AI gateway's upkeep, each hour.
--   1. A spend alert: when the day's known AI cost (the usage ledger's cost_usd, India day) reaches the amount the founder
--      set in Control → AI (control.settings 'ai.spend_alert_usd_per_day'; off until set), the founders get one email
--      that day. Attempts with no price set have no cost, and the email says so; no number is invented.
--   2. Ledger retention: rows of control.ai_usage_ledger and control.ai_reply_checks older than 90 days are removed.
--      Both tables stay append-only for every session role; only this definer function, run by the upkeep job as the
--      platform role, removes old rows. The daily counts (control.ai_usage) are kept.

create function control.ai_ledger_retention(p_today date, p_keep_days integer)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  cutoff date;
  n integer := 0;
  m integer := 0;
begin
  if p_today is null or p_keep_days is null or p_keep_days < 90 then
    raise exception 'ai_ledger_retention: keep at least 90 days' using errcode = 'check_violation';
  end if;
  cutoff := p_today - p_keep_days;
  delete from control.ai_usage_ledger where day < cutoff;
  get diagnostics n = row_count;
  delete from control.ai_reply_checks where day < cutoff;
  get diagnostics m = row_count;
  return n + m;
end $$;
revoke all on function control.ai_ledger_retention(date, integer) from public, anon, authenticated, service_role;
grant execute on function control.ai_ledger_retention(date, integer) to nca_super;

-- This hour's upkeep, once (the idempotency key is the hour in UTC), only once the deployed runner can run it.
create function public.ai_upkeep_enqueue() returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into jobs (type, payload, idempotency_key, max_attempts)
  select 'ai.upkeep', jsonb_build_object('at', t.h), 'ai.upkeep:' || t.h, 3
    from (select to_char(date_trunc('hour', now() at time zone 'UTC'), 'YYYY-MM-DD"T"HH24') as h) t
   where exists (select 1 from platform_settings p where p.key = 'jobs.handlers' and jsonb_typeof(p.value) = 'array' and p.value ? 'ai.upkeep')
  on conflict (idempotency_key) do nothing
$$;
revoke all on function public.ai_upkeep_enqueue() from public, anon, authenticated, service_role;

-- Each hour at :07. cron.schedule upserts by name. Where there is no scheduler (the test harness), nothing is scheduled.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ai-upkeep', '7 * * * *', 'select public.ai_upkeep_enqueue()');
  end if;
end $$;
