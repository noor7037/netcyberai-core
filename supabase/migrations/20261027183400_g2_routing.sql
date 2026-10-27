-- G2 (C370): routing reliability for the AI gateway (docs/37_AI_GATEWAY_AND_STUDY_PLAN.md §4 row G2; the brief's §5,
-- §6). control.ai_profiles stays the workload table (C230-AN §3.3): its provider + model, then fallback[0..1], are the
-- route's Primary, Backup 1 and Backup 2. Three platform tables are added beside it, none with a prompt, an answer, a
-- child's words or a key in it:
--
--   1. control.ai_route_revisions: an immutable snapshot of a profile's route, written by a trigger on every change of
--      it (each Control save, each undo, each rollback), with who and when. control.ai_profiles.revision_id names the
--      active one. Append-only for every session role, and a trigger refuses an update or delete even by the owner.
--      A rollback is the previous revision activated again, as a new revision (src/lib/ai/control.ts rollbackRoute).
--   2. control.ai_provider_health: per provider and model, the circuit (closed, open, half_open), its consecutive
--      retryable failures, when it opened, the half-open trial, the last outcome, and a probe's time and result (for the
--      health checks a later slice adds; null until then).
--   3. control.ai_usage_ledger: one row per attempt: profile, provider, model, the revision, the place in the route,
--      the outcome class, the time taken, tokens in and out, and the cost, null meaning unknown (no price is
--      configured anywhere, so none is invented). control.ai_usage keeps its daily counts as before.
--
-- Rights: the platform role (nca_super) reads the three tables (Control's screens). Nobody writes them directly: the
-- callers that run the AI platform (family_app, app_user for the school and its jobs, nca_super for Control's own
-- profiles) write only through two definer functions with a fixed search_path, each checking what it is given:
-- control.ai_circuit_admit() and control.record_ai_attempt().
--
-- Rollback (of this migration): drop the trigger ai_profiles_revision, the column control.ai_profiles.revision_id, the
-- three functions and the three tables. No existing row is changed except ai_profiles.revision_id.

-- ---- 1. route revisions ---------------------------------------------------------------------------------------------

create table control.ai_route_revisions (
  revision_id bigint generated always as identity primary key,
  -- No foreign key: the trigger writes the revision before a new profile row exists.
  profile_id text not null check (profile_id ~ '^[a-z][a-z0-9_.]{2,59}$'),
  provider_id text,
  model text check (model is null or model ~ '^@?[A-Za-z0-9._:/-]{1,80}$'),
  fallback jsonb not null check (jsonb_typeof(fallback) = 'array'),
  prompt_version text not null,
  max_output_tokens integer not null,
  enabled boolean not null,
  activation text not null check (activation in ('baseline', 'set', 'undo', 'rollback')),
  rollback_of bigint references control.ai_route_revisions (revision_id),
  activated_by uuid,
  activated_at timestamptz not null default now(),
  check ((activation = 'rollback') = (rollback_of is not null))
);
create index idx_ai_route_revisions_profile on control.ai_route_revisions (profile_id, revision_id desc);

-- History is never rewritten, not even by the owner.
create function control.ai_route_revisions_fixed() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'a route revision is never changed or removed' using errcode = 'insufficient_privilege';
end $$;
create trigger ai_route_revisions_fixed before update or delete on control.ai_route_revisions
  for each row execute function control.ai_route_revisions_fixed();

alter table control.ai_profiles add column revision_id bigint references control.ai_route_revisions (revision_id);

-- The routes as they stand today, each as its first revision.
with b as (
  insert into control.ai_route_revisions (profile_id, provider_id, model, fallback, prompt_version, max_output_tokens, enabled, activation, activated_by)
  select profile_id, provider_id, model, fallback, prompt_version, max_output_tokens, enabled, 'baseline', updated_by from control.ai_profiles
  returning revision_id, profile_id
)
update control.ai_profiles p set revision_id = b.revision_id from b where b.profile_id = p.profile_id;

-- Every change of a route writes its revision, in the same statement. Control says why for the transaction
-- (set_config 'nca.ai_route_activation' to set, undo or rollback, and 'nca.ai_route_rollback_of'); a change made any
-- other way is recorded as 'set'. An update that changes nothing of the route keeps the active revision, unless Control
-- activated it on purpose.
create function control.ai_profile_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  asked text := nullif(current_setting('nca.ai_route_activation', true), '');
  rb text := nullif(current_setting('nca.ai_route_rollback_of', true), '');
  a text := 'set';
  r bigint := null;
begin
  if tg_op = 'UPDATE' and asked is null
     and new.provider_id is not distinct from old.provider_id and new.model is not distinct from old.model and new.fallback = old.fallback
     and new.prompt_version = old.prompt_version and new.max_output_tokens = old.max_output_tokens and new.enabled = old.enabled then
    new.revision_id := old.revision_id;
    return new;
  end if;
  if asked in ('set', 'undo', 'rollback') then a := asked; end if;
  if a = 'rollback' then
    if rb is null or rb !~ '^\d{1,18}$' then raise exception 'a rollback names the revision it restores' using errcode = 'check_violation'; end if;
    r := rb::bigint;
  end if;
  insert into control.ai_route_revisions (profile_id, provider_id, model, fallback, prompt_version, max_output_tokens, enabled, activation, rollback_of, activated_by)
  values (new.profile_id, new.provider_id, new.model, new.fallback, new.prompt_version, new.max_output_tokens, new.enabled, a, r, new.updated_by)
  returning revision_id into new.revision_id;
  return new;
end $$;
-- After ai_profiles_minors_check (triggers run in name order): a change the minors check refuses writes nothing.
create trigger ai_profiles_revision before insert or update on control.ai_profiles
  for each row execute function control.ai_profile_revision();

-- ---- 2. provider health and the circuit ----------------------------------------------------------------------------

create table control.ai_provider_health (
  provider_id text not null references control.ai_providers (provider_id),
  model text not null check (model ~ '^@?[A-Za-z0-9._:/-]{1,80}$'),
  state text not null default 'closed' check (state in ('closed', 'open', 'half_open')),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  opened_at timestamptz,
  trial_at timestamptz,
  last_outcome text,
  last_at timestamptz,
  last_probe_at timestamptz,
  last_probe_ok boolean,
  last_probe_method text check (last_probe_method is null or last_probe_method in ('health_endpoint', 'synthetic')),
  primary key (provider_id, model)
);

-- May this provider and model be tried now? 'closed': yes. 'trial': yes, as the one half-open trial after the cool-down
-- (taken here, so two requests do not both try). 'open': no, skip it. The cool-down is the caller's constant, held
-- between 5 seconds and an hour.
create function control.ai_circuit_admit(p_provider text, p_model text, p_cooldown_seconds integer)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  h record;
  cool interval := make_interval(secs => greatest(5, least(3600, coalesce(p_cooldown_seconds, 60))));
begin
  select state, opened_at, trial_at into h from control.ai_provider_health where provider_id = p_provider and model = p_model for update;
  if not found or h.state = 'closed' then return 'closed'; end if;
  if (h.state = 'open' and h.opened_at + cool <= now()) or (h.state = 'half_open' and coalesce(h.trial_at, '-infinity') + cool <= now()) then
    update control.ai_provider_health set state = 'half_open', trial_at = now() where provider_id = p_provider and model = p_model;
    return 'trial';
  end if;
  return 'open';
end $$;

-- ---- 3. the usage ledger -------------------------------------------------------------------------------------------

create table control.ai_usage_ledger (
  attempt_id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  day date not null,
  profile_id text not null check (profile_id ~ '^[a-z][a-z0-9_.]{2,59}$'),
  provider_id text not null check (provider_id ~ '^[a-z][a-z0-9_-]{1,39}$'),
  model text not null check (model ~ '^@?[A-Za-z0-9._:/-]{1,80}$'),
  revision_id bigint references control.ai_route_revisions (revision_id),
  -- 0 Primary, 1 Backup 1, 2 Backup 2 (3: a further fallback an older route may still hold).
  route_position smallint not null check (route_position between 0 and 3),
  outcome text not null check (outcome in (
    'ok', 'upstream_timeout', 'upstream_unavailable', 'rate_limited', 'quota_exhausted', 'model_unavailable', 'auth_failed', 'invalid_request',
    'content_rejected', 'cut_short', 'unknown_provider_error', 'skipped_open_circuit', 'skipped_deadline')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  tokens_in bigint not null default 0 check (tokens_in >= 0),
  tokens_out bigint not null default 0 check (tokens_out >= 0),
  -- Whether any text reached the caller before the attempt ended (then no other model is tried: nothing is stitched).
  streamed boolean not null default false,
  -- Null: unknown. No price is configured, so none is invented.
  cost_usd numeric(14, 6) check (cost_usd is null or cost_usd >= 0)
);
create index idx_ai_usage_ledger_day on control.ai_usage_ledger (day, profile_id);
create index idx_ai_usage_ledger_link on control.ai_usage_ledger (provider_id, model, at desc);
create index idx_ai_usage_ledger_revision on control.ai_usage_ledger (revision_id);

-- One attempt, written after the call in the caller's own transaction, and the circuit moved by it. p_circuit:
-- 'success' closes it; 'failure' (a retryable failure) counts towards opening it and reopens a half-open one;
-- 'neutral' (the provider answered, but the request or key was wrong) and 'none' (the attempt was skipped) leave it.
-- p_open_after is the caller's constant, held between 1 and 20. No text of the request or answer is taken.
create function control.record_ai_attempt(
  p_day date, p_profile text, p_provider text, p_model text, p_revision bigint, p_position integer, p_outcome text,
  p_latency_ms integer, p_tokens_in bigint, p_tokens_out bigint, p_streamed boolean, p_circuit text, p_open_after integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  n integer := greatest(1, least(20, coalesce(p_open_after, 5)));
begin
  if p_circuit is null or p_circuit not in ('success', 'failure', 'neutral', 'none') then
    raise exception 'unknown circuit effect' using errcode = 'check_violation';
  end if;
  insert into control.ai_usage_ledger (day, profile_id, provider_id, model, revision_id, route_position, outcome, latency_ms, tokens_in, tokens_out, streamed)
  values (p_day, p_profile, p_provider, p_model, p_revision, p_position, p_outcome, case when p_latency_ms is null then null else greatest(p_latency_ms, 0) end, greatest(coalesce(p_tokens_in, 0), 0), greatest(coalesce(p_tokens_out, 0), 0), coalesce(p_streamed, false));
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

-- ---- rights ---------------------------------------------------------------------------------------------------------

alter table control.ai_route_revisions enable row level security;
alter table control.ai_route_revisions force row level security;
alter table control.ai_provider_health enable row level security;
alter table control.ai_provider_health force row level security;
alter table control.ai_usage_ledger enable row level security;
alter table control.ai_usage_ledger force row level security;
revoke all on control.ai_route_revisions, control.ai_provider_health, control.ai_usage_ledger from public, anon, authenticated, service_role, app_user, family_app, nca_super;
-- Append-only (scripts/check_append_only_grants.py): no session role may change or remove history.
revoke update, delete on control.ai_route_revisions from app_user, anon, authenticated, nca_super, family_app;
revoke update, delete on control.ai_usage_ledger from app_user, anon, authenticated, nca_super, family_app;
grant select on control.ai_route_revisions, control.ai_provider_health, control.ai_usage_ledger to nca_super;

revoke all on function control.ai_route_revisions_fixed() from public, anon, authenticated, service_role;
revoke all on function control.ai_profile_revision() from public, anon, authenticated, service_role;
revoke all on function control.ai_circuit_admit(text, text, integer) from public, anon, authenticated, service_role;
revoke all on function control.record_ai_attempt(date, text, text, text, bigint, integer, text, integer, bigint, bigint, boolean, text, integer) from public, anon, authenticated, service_role;
grant execute on function control.ai_circuit_admit(text, text, integer) to family_app, app_user, nca_super;
grant execute on function control.record_ai_attempt(date, text, text, text, bigint, integer, text, integer, bigint, bigint, boolean, text, integer) to family_app, app_user, nca_super;
