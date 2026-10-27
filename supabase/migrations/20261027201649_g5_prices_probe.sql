-- G5 (C373): Wave 1's follow-ups. Two things the ledger and the Quality Lab could not show until now.
--
-- 1. Prices. control.ai_model_prices holds what the founder enters in Control for a provider and model: US dollars per
--    million tokens in and out. control.record_ai_attempt now writes an attempt's cost from the price in force when it
--    ran; where no price is entered the cost stays null (unknown), as before. A price changed later never rewrites a
--    cost already written. The Lab reads its costs from today's prices (its runs are the founder's own comparison).
-- 2. The health probe. Every 15 minutes one job (ai.health_probe, src/lib/ai/gateway/probe.ts) asks each provider in a
--    route that has a key its free check (the vendor's model list or token count; never a paid answer), and writes
--    the result through control.record_ai_probe into control.ai_provider_health's probe columns (G2 left them null).
--    A probe never opens or closes a circuit: only real calls do (C370).
--
-- DEPLOY SAFETY, as C210: the enqueue function queues only once 'ai.health_probe' is on the deployed runner's list.
-- Rights: the price table is the platform role's only; the two functions are definer functions with a fixed
-- search_path, called by the platform role; pg_cron alone calls the enqueue function.

create table control.ai_model_prices (
  provider_id text not null references control.ai_providers (provider_id),
  model text not null check (model ~ '^@?[A-Za-z0-9._:/-]{1,80}$'),
  usd_per_mtok_in numeric(12, 6) not null check (usd_per_mtok_in >= 0 and usd_per_mtok_in <= 1000),
  usd_per_mtok_out numeric(12, 6) not null check (usd_per_mtok_out >= 0 and usd_per_mtok_out <= 1000),
  set_by uuid not null,
  set_at timestamptz not null default now(),
  primary key (provider_id, model)
);
alter table control.ai_model_prices enable row level security;
alter table control.ai_model_prices force row level security;
-- No policy for any role: the platform role bypasses row level security and is the only one granted anything.
revoke all on control.ai_model_prices from public, anon, authenticated, service_role, app_user, family_app;
grant select, insert, update, delete on control.ai_model_prices to nca_super;

-- As G2's, with the cost: tokens times the price per million, when a price is entered for that provider and model.
create or replace function control.record_ai_attempt(
  p_day date, p_profile text, p_provider text, p_model text, p_revision bigint, p_position integer, p_outcome text,
  p_latency_ms integer, p_tokens_in bigint, p_tokens_out bigint, p_streamed boolean, p_circuit text, p_open_after integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  n integer := greatest(1, least(20, coalesce(p_open_after, 5)));
  t_in bigint := greatest(coalesce(p_tokens_in, 0), 0);
  t_out bigint := greatest(coalesce(p_tokens_out, 0), 0);
  cost numeric(14, 6);
begin
  if p_circuit is null or p_circuit not in ('success', 'failure', 'neutral', 'none') then
    raise exception 'unknown circuit effect' using errcode = 'check_violation';
  end if;
  select round((t_in * pr.usd_per_mtok_in + t_out * pr.usd_per_mtok_out) / 1000000, 6) into cost
    from control.ai_model_prices pr where pr.provider_id = p_provider and pr.model = p_model;
  insert into control.ai_usage_ledger (day, profile_id, provider_id, model, revision_id, route_position, outcome, latency_ms, tokens_in, tokens_out, streamed, cost_usd)
  values (p_day, p_profile, p_provider, p_model, p_revision, p_position, p_outcome, case when p_latency_ms is null then null else greatest(p_latency_ms, 0) end, t_in, t_out, coalesce(p_streamed, false), cost);
  if p_circuit = 'none' or not exists (select 1 from control.ai_providers where provider_id = p_provider) then return; end if;
  insert into control.ai_provider_health (provider_id, model) values (p_provider, p_model) on conflict do nothing;
  if p_circuit = 'success' then
    update control.ai_provider_health set state = 'closed', consecutive_failures = 0, opened_at = null, trial_at = null, last_outcome = p_outcome, last_at = now()
     where provider_id = p_provider and model = p_model;
  elsif p_circuit = 'failure' then
    update control.ai_provider_health
       set consecutive_failures = consecutive_failures + 1,
           state = case when state = 'half_open' or consecutive_failures + 1 >= n then 'open' else state end,
           opened_at = case when state = 'half_open' or (state = 'closed' and consecutive_failures + 1 >= n) then now() else opened_at end,
           trial_at = null, last_outcome = p_outcome, last_at = now()
     where provider_id = p_provider and model = p_model;
  else
    update control.ai_provider_health set last_outcome = p_outcome, last_at = now() where provider_id = p_provider and model = p_model;
  end if;
end $$;
revoke all on function control.record_ai_attempt(date, text, text, text, bigint, integer, text, integer, bigint, bigint, boolean, text, integer) from public, anon, authenticated, service_role;
grant execute on function control.record_ai_attempt(date, text, text, text, bigint, integer, text, integer, bigint, bigint, boolean, text, integer) to family_app, app_user, nca_super;

-- One probe's result for a provider and model: when, whether the check answered, and how it was asked. The circuit's
-- own columns are not touched.
create function control.record_ai_probe(p_provider text, p_model text, p_ok boolean, p_method text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_ok is null or p_method is null or p_method not in ('health_endpoint', 'synthetic') then
    raise exception 'unknown probe result' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from control.ai_providers where provider_id = p_provider) then return; end if;
  insert into control.ai_provider_health (provider_id, model, last_probe_at, last_probe_ok, last_probe_method)
  values (p_provider, p_model, now(), p_ok, p_method)
  on conflict (provider_id, model) do update set last_probe_at = now(), last_probe_ok = p_ok, last_probe_method = p_method;
end $$;
revoke all on function control.record_ai_probe(text, text, boolean, text) from public, anon, authenticated, service_role;
grant execute on function control.record_ai_probe(text, text, boolean, text) to nca_super;

-- This quarter hour's probe, once (the idempotency key is the quarter hour in UTC).
create function public.ai_health_probe_enqueue() returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into jobs (type, payload, idempotency_key, max_attempts)
  select 'ai.health_probe', jsonb_build_object('at', t.q), 'ai.health_probe:' || t.q, 1
    from (select to_char(date_trunc('hour', now() at time zone 'UTC') + make_interval(mins => (extract(minute from now() at time zone 'UTC')::int / 15) * 15), 'YYYY-MM-DD"T"HH24:MI') as q) t
   where exists (select 1 from platform_settings p where p.key = 'jobs.handlers' and jsonb_typeof(p.value) = 'array' and p.value ? 'ai.health_probe')
  on conflict (idempotency_key) do nothing
$$;
revoke all on function public.ai_health_probe_enqueue() from public, anon, authenticated, service_role;

-- Every 15 minutes. cron.schedule upserts by name. Where there is no scheduler (the test harness), nothing is scheduled.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ai-health-probe', '*/15 * * * *', 'select public.ai_health_probe_enqueue()');
  end if;
end $$;
