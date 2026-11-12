-- C504: a paid AI route for paying customers, with a hard monthly spend limit.
--
-- 1. control.ai_paid_routes: one optional paid chain per profile (Primary, at most two backups), off by default, with
--    the same model-id rule and the same minors check as control.ai_profiles.
-- 2. control.ai_paid_customers: who is paying: a family account or a school. Founder-only writes (the platform role).
--    A family is paying when its own account is listed, or when it has a live link (family.school_links, not revoked)
--    to a listed school. A school session is paying when its own school is listed.
-- 3. control.settings 'ai.paid_limit_usd_per_month' (a JSON number, US dollars): no row, or JSON null, means the paid route is off
--    for everyone.
-- 4. control.ai_usage_ledger.paid: an attempt that ran on a paid route. control.record_ai_attempt takes it as a
--    fifteenth argument, default false, so the thirteen- and fourteen-argument calls keep working.
-- 5. The limit is held, not only checked: control.ai_paid_take reserves the chain's worst-case cost (every link, the
--    caller's token bound in and out, at the prices in force) as a hold, under one transaction-scoped advisory lock,
--    only while this India month's paid spend plus every live hold plus this one stays within the limit. The sent
--    call's record() writes its ledger rows and drops its hold in one transaction, under the same lock, so a racing
--    caller always sees one or the other. A hold whose call was never recorded lapses after 15 minutes.
--    Every link of the paid chain must have a price: an unpriced model would never count toward the limit.
--
-- Who may do what: no session role reads either table. A family or school session calls control.ai_paid_take
-- (security invoker), which hands over by current_user to a definer function granted to that role alone; the definer
-- reads the caller's identity only from its own session setting (family: app.current_account_id; school:
-- app.current_tenant_id), never from an argument. Control (nca_super) reads and writes both tables, and finds a family
-- by its email through a definer function (nca_super cannot read family.accounts).
--
-- Rollback: drop the functions and tables created here, the ledger column 'paid', restore record_ai_attempt's
-- fourteen-argument form (20261102170434) and control.ai_provider_clearance_check (20261021094627).

-- ---- 1. Paid routes -------------------------------------------------------------------------------------------------

create table control.ai_paid_routes (
  profile_id text primary key references control.ai_profiles (profile_id),
  provider_id text references control.ai_providers (provider_id),
  model text check (model is null or model ~ '^@?[A-Za-z0-9._:/-]{1,80}$'),
  fallback jsonb not null default '[]'::jsonb check (jsonb_typeof(fallback) = 'array' and jsonb_array_length(fallback) <= 2),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check ((provider_id is null) = (model is null)),
  check (not enabled or provider_id is not null)
);

-- As control.ai_profile_minors_check, for the paid chain of a profile that carries a child's words.
create function control.ai_paid_route_minors_check() returns trigger
language plpgsql set search_path = '' as $$
declare
  p text;
begin
  if not exists (select 1 from control.ai_profiles a where a.profile_id = new.profile_id and a.carries_child_words) then return new; end if;
  if tg_op = 'UPDATE' and new.provider_id is not distinct from old.provider_id and new.fallback = old.fallback then return new; end if;
  if exists (select 1 from control.settings where key = 'ai.testing_mode' and value = '"on"'::jsonb) then return new; end if;
  for p in select new.provider_id union select f ->> 'provider' from jsonb_array_elements(new.fallback) f loop
    if p is not null and not exists (select 1 from control.ai_providers where provider_id = p and cleared_for_minors) then
      raise exception 'provider % is not cleared for minors', p using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $$;
revoke all on function control.ai_paid_route_minors_check() from public, anon, authenticated, service_role;
create trigger ai_paid_routes_minors_check before insert or update on control.ai_paid_routes
  for each row execute function control.ai_paid_route_minors_check();

-- A provider's clearance cannot be withdrawn while a child-words profile uses it, on its own route or its paid one.
create or replace function control.ai_provider_clearance_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.cleared_for_minors and not new.cleared_for_minors and (
    exists (
      select 1 from control.ai_profiles p
       where p.carries_child_words
         and (p.provider_id = new.provider_id or exists (select 1 from jsonb_array_elements(p.fallback) f where f ->> 'provider' = new.provider_id))
    ) or exists (
      select 1 from control.ai_paid_routes r join control.ai_profiles p on p.profile_id = r.profile_id
       where p.carries_child_words
         and (r.provider_id = new.provider_id or exists (select 1 from jsonb_array_elements(r.fallback) f where f ->> 'provider' = new.provider_id))
    )
  ) then
    raise exception 'provider % is used by a profile that carries a child''s words', new.provider_id using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- ---- 2. Paying customers --------------------------------------------------------------------------------------------

create table control.ai_paid_customers (
  kind text not null check (kind in ('family', 'school')),
  customer_id uuid not null,
  since timestamptz not null default now(),
  set_by uuid not null,
  primary key (kind, customer_id)
);

-- A listed customer exists: a family account, or a school.
create function control.ai_paid_customer_exists() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.kind = 'family' and not exists (select 1 from family.accounts a where a.account_id = new.customer_id))
     or (new.kind = 'school' and not exists (select 1 from public.schools s where s.school_id = new.customer_id)) then
    raise exception 'no such customer' using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;
revoke all on function control.ai_paid_customer_exists() from public, anon, authenticated, service_role;
create trigger ai_paid_customers_exists before insert or update on control.ai_paid_customers
  for each row execute function control.ai_paid_customer_exists();

-- ---- 3. The ledger's paid flag and the holds ------------------------------------------------------------------------

alter table control.ai_usage_ledger add column paid boolean not null default false;
create index idx_ai_usage_ledger_paid_day on control.ai_usage_ledger (day) where paid;

create table control.ai_paid_holds (
  hold_id uuid primary key default gen_random_uuid(),
  usd numeric(14, 6) not null check (usd >= 0),
  at timestamptz not null default now()
);

-- The first day of this India month.
create function control.ai_india_month() returns date
language sql stable set search_path = '' as $$
  select date_trunc('month', now() at time zone 'Asia/Kolkata')::date
$$;

-- This India month's paid spend: the known cost of every attempt that ran on a paid route.
create function control.ai_paid_spend_usd() returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.cost_usd), 0)::numeric
    from control.ai_usage_ledger l
   where l.paid and l.day >= control.ai_india_month() and l.day < (control.ai_india_month() + interval '1 month')::date
$$;

-- ---- 4. Taking the paid route ---------------------------------------------------------------------------------------

-- Whether a customer is paying (no grant: called by the definer functions below only).
create function control.ai_paid_customer_is(p_kind text, p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_id is not null and (
    exists (select 1 from control.ai_paid_customers c where c.kind = p_kind and c.customer_id = p_id)
    or (p_kind = 'family' and exists (
      select 1 from family.school_links l
        join control.ai_paid_customers c on c.kind = 'school' and c.customer_id = l.school_id
       where l.account_id = p_id and l.revoked_at is null
    ))
  )
$$;

-- The paid chain for one call, with its hold, or no row (the normal chain then serves, silently). No grant: reached
-- only through the role's own function below.
create function control.ai_paid_take_for(p_kind text, p_id uuid, p_profile text, p_tokens_in bigint, p_tokens_out bigint)
returns table (hold_id uuid, provider_id text, model text, fallback jsonb)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  r record;
  pr record;
  l record;
  lim numeric;
  est numeric := 0;
  t_in bigint := least(greatest(coalesce(p_tokens_in, 0), 0), 10000000);
  t_out bigint := least(greatest(coalesce(p_tokens_out, 0), 0), 10000000);
  h uuid;
begin
  if p_id is null or not control.ai_paid_customer_is(p_kind, p_id) then return; end if;
  select pr_.provider_id, pr_.model, pr_.fallback into r
    from control.ai_paid_routes pr_
   where pr_.profile_id = p_profile and pr_.enabled and pr_.provider_id is not null and pr_.model is not null;
  if not found then return; end if;
  select (s.value #>> '{}')::numeric into lim from control.settings s where s.key = 'ai.paid_limit_usd_per_month' and jsonb_typeof(s.value) = 'number';
  if lim is null or lim <= 0 then return; end if;
  -- Every link priced; the worst case is every link answering in full.
  for l in select r.provider_id as p, r.model as m union all select f ->> 'provider', f ->> 'model' from jsonb_array_elements(r.fallback) f loop
    select x.usd_per_mtok_in, x.usd_per_mtok_out into pr from control.ai_model_prices x where x.provider_id = l.p and x.model = l.m;
    if not found then return; end if;
    est := est + (t_in * pr.usd_per_mtok_in + t_out * pr.usd_per_mtok_out) / 1000000;
  end loop;
  est := round(est, 6);
  -- One taker or settler at a time; every statement after the lock reads what was committed before it.
  perform pg_advisory_xact_lock(504504);
  delete from control.ai_paid_holds x where x.at < now() - interval '15 minutes';
  if control.ai_paid_spend_usd() + (select coalesce(sum(x.usd), 0) from control.ai_paid_holds x) + est > lim then return; end if;
  insert into control.ai_paid_holds (usd) values (est) returning control.ai_paid_holds.hold_id into h;
  return query select h, r.provider_id::text, r.model::text, r.fallback::jsonb;
end $$;

create function control.ai_paid_take_family(p_profile text, p_tokens_in bigint, p_tokens_out bigint)
returns table (hold_id uuid, provider_id text, model text, fallback jsonb)
language sql security definer set search_path = '' as $$
  select * from control.ai_paid_take_for('family', nullif(current_setting('app.current_account_id', true), '')::uuid, p_profile, p_tokens_in, p_tokens_out)
$$;

create function control.ai_paid_take_school(p_profile text, p_tokens_in bigint, p_tokens_out bigint)
returns table (hold_id uuid, provider_id text, model text, fallback jsonb)
language sql security definer set search_path = '' as $$
  select * from control.ai_paid_take_for('school', nullif(current_setting('app.current_tenant_id', true), '')::uuid, p_profile, p_tokens_in, p_tokens_out)
$$;

-- What the gateway calls: by the session's own role, never by an argument.
create function control.ai_paid_take(p_profile text, p_tokens_in bigint, p_tokens_out bigint)
returns table (hold_id uuid, provider_id text, model text, fallback jsonb)
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user = 'family_app' then
    return query select * from control.ai_paid_take_family(p_profile, p_tokens_in, p_tokens_out);
  elsif current_user = 'app_user' then
    return query select * from control.ai_paid_take_school(p_profile, p_tokens_in, p_tokens_out);
  end if;
end $$;

-- The hold of a call that was recorded (or not sent): dropped under the same lock as a take.
create function control.ai_paid_release(p_hold uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_hold is null then return; end if;
  perform pg_advisory_xact_lock(504504);
  delete from control.ai_paid_holds x where x.hold_id = p_hold;
end $$;

-- ---- 5. Control: a family by its email, and the list with names ------------------------------------------------------

-- A family account's id by its email, or null: Control lists a family by the email it signed up with.
create function control.ai_paid_family_id(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select x.account_id from family.accounts x where x.email = lower(btrim(p_email))
$$;

-- The customers with a label: a school's name; a family's email shown only in part.
create function control.ai_paid_customer_list()
returns table (kind text, customer_id uuid, label text, since timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.kind, c.customer_id,
         case c.kind
           when 'school' then (select s.name from public.schools s where s.school_id = c.customer_id)
           else (select left(split_part(a.email, '@', 1), 2) || '…@' || split_part(a.email, '@', 2) from family.accounts a where a.account_id = c.customer_id)
         end,
         c.since
    from control.ai_paid_customers c
   order by c.since desc
$$;

-- ---- 6. record_ai_attempt with the paid flag -------------------------------------------------------------------------

drop function control.record_ai_attempt(date, text, text, text, bigint, integer, text, integer, bigint, bigint, boolean, text, integer, text);

create function control.record_ai_attempt(
  p_day date, p_profile text, p_provider text, p_model text, p_revision bigint, p_position integer, p_outcome text,
  p_latency_ms integer, p_tokens_in bigint, p_tokens_out bigint, p_streamed boolean, p_circuit text, p_open_after integer,
  p_source text default 'live', p_paid boolean default false)
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
  insert into control.ai_usage_ledger (day, profile_id, provider_id, model, revision_id, route_position, outcome, latency_ms, tokens_in, tokens_out, streamed, cost_usd, source, paid)
  values (p_day, p_profile, p_provider, p_model, p_revision, p_position, p_outcome, case when p_latency_ms is null then null else greatest(p_latency_ms, 0) end, t_in, t_out, coalesce(p_streamed, false), cost, coalesce(p_source, 'live'), coalesce(p_paid, false));
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

-- ---- 7. Rights -------------------------------------------------------------------------------------------------------

alter table control.ai_paid_routes enable row level security;
alter table control.ai_paid_routes force row level security;
alter table control.ai_paid_customers enable row level security;
alter table control.ai_paid_customers force row level security;
alter table control.ai_paid_holds enable row level security;
alter table control.ai_paid_holds force row level security;
-- No policy for any role: the platform role bypasses row level security and is the only one granted anything.
revoke all on control.ai_paid_routes, control.ai_paid_customers, control.ai_paid_holds from public, anon, authenticated, service_role, app_user, family_app, nca_super;
grant select, insert, update on control.ai_paid_routes to nca_super;
grant select, insert, delete on control.ai_paid_customers to nca_super;
grant select on control.ai_paid_holds to nca_super;

revoke all on function control.ai_india_month() from public, anon, authenticated, service_role;
revoke all on function control.ai_paid_spend_usd() from public, anon, authenticated, service_role;
revoke all on function control.ai_paid_customer_is(text, uuid) from public, anon, authenticated, service_role;
revoke all on function control.ai_paid_take_for(text, uuid, text, bigint, bigint) from public, anon, authenticated, service_role;
revoke all on function control.ai_paid_take_family(text, bigint, bigint) from public, anon, authenticated, service_role;
revoke all on function control.ai_paid_take_school(text, bigint, bigint) from public, anon, authenticated, service_role;
revoke all on function control.ai_paid_take(text, bigint, bigint) from public, anon, authenticated, service_role;
revoke all on function control.ai_paid_release(uuid) from public, anon, authenticated, service_role;
revoke all on function control.ai_paid_family_id(text) from public, anon, authenticated, service_role;
revoke all on function control.ai_paid_customer_list() from public, anon, authenticated, service_role;
revoke all on function control.record_ai_attempt(date, text, text, text, bigint, integer, text, integer, bigint, bigint, boolean, text, integer, text, boolean) from public, anon, authenticated, service_role;

grant execute on function control.ai_india_month() to nca_super;
grant execute on function control.ai_paid_spend_usd() to nca_super;
grant execute on function control.ai_paid_take_family(text, bigint, bigint) to family_app;
grant execute on function control.ai_paid_take_school(text, bigint, bigint) to app_user;
-- nca_super (a Control or platform job's call) is never paying: the function returns no row for it.
grant execute on function control.ai_paid_take(text, bigint, bigint) to family_app, app_user, nca_super;
grant execute on function control.ai_paid_release(uuid) to family_app, app_user, nca_super;
grant execute on function control.ai_paid_family_id(text) to nca_super;
grant execute on function control.ai_paid_customer_list() to nca_super;
grant execute on function control.record_ai_attempt(date, text, text, text, bigint, integer, text, integer, bigint, bigint, boolean, text, integer, text, boolean) to family_app, app_user, nca_super;
