-- W17-B1: Control's Try it, one live call of a feature's current chain with made-up inputs (no child's data).
--
-- Each attempt in the usage ledger now says what made it: 'live' (a child's or staff member's own request, as every row
-- so far), 'smoke' (the smoke test, C316) or 'try_it' (Control's Try it). Both of the last two run on made-up inputs,
-- so Control can keep them apart from live use. The counts (control.ai_usage, control.count_ai_usage) are unchanged.
--
-- control.record_ai_attempt takes the source as a fourteenth argument with 'live' as its default, so a caller of the
-- thirteen-argument form keeps working; otherwise it is G5's function word for word (the cost from the price in force,
-- the circuit moved by the attempt). The old signature is dropped first so no call can be ambiguous between the two.

alter table control.ai_usage_ledger add column source text not null default 'live' check (source in ('live', 'smoke', 'try_it'));

drop function control.record_ai_attempt(date, text, text, text, bigint, integer, text, integer, bigint, bigint, boolean, text, integer);

create function control.record_ai_attempt(
  p_day date, p_profile text, p_provider text, p_model text, p_revision bigint, p_position integer, p_outcome text,
  p_latency_ms integer, p_tokens_in bigint, p_tokens_out bigint, p_streamed boolean, p_circuit text, p_open_after integer,
  p_source text default 'live')
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
  insert into control.ai_usage_ledger (day, profile_id, provider_id, model, revision_id, route_position, outcome, latency_ms, tokens_in, tokens_out, streamed, cost_usd, source)
  values (p_day, p_profile, p_provider, p_model, p_revision, p_position, p_outcome, case when p_latency_ms is null then null else greatest(p_latency_ms, 0) end, t_in, t_out, coalesce(p_streamed, false), cost, coalesce(p_source, 'live'));
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
revoke all on function control.record_ai_attempt(date, text, text, text, bigint, integer, text, integer, bigint, bigint, boolean, text, integer, text) from public, anon, authenticated, service_role;
grant execute on function control.record_ai_attempt(date, text, text, text, bigint, integer, text, integer, bigint, bigint, boolean, text, integer, text) to family_app, app_user, nca_super;
