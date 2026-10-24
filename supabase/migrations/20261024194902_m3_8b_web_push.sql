-- M3-8b (C339; 07 "M3, the rest", M3-8; the supervisor's answer 1 in C230-AD): Web Push to a linked family's browsers.
--
-- 1. family.push_subscriptions: a browser the parent turned notifications on in (its push service's address and keys).
--    The family's own rows, one per account and address (two families signed in on one shared phone each have theirs;
--    a message never names anyone). At most ten an account (the app removes the oldest). A browser that ended it (404
--    or 410) is removed by the send job; one that keeps failing is removed after five failures.
-- 2. family.push_sent: up to when each kind of news has been pushed, per link (scope = the link id) and, for tonight's
--    practice and plan, per day (scope 'tonight'). The first scan only sets the mark, so turning notifications on never
--    brings a pile of old news.
-- 3. family.push_accounts(): the accounts with a browser to tell, and their session version, for the send job only (the
--    platform role); the job then works inside each account's own family session, as the app does.
-- 4. public.family_push_enqueue(): every ten minutes, one send job (pg_cron), once the deployed code says it runs it.

create table family.push_subscriptions (
  sub_id uuid primary key default gen_random_uuid(),
  account_id uuid not null references family.accounts (account_id) on delete cascade,
  endpoint text not null check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}={0,2}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,30}={0,2}$'),
  lang text not null default 'en' check (lang in ('en', 'hi')),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  failures smallint not null default 0 check (failures between 0 and 100),
  unique (account_id, endpoint)
);
create table family.push_sent (
  account_id uuid not null references family.accounts (account_id) on delete cascade,
  scope text not null check (scope = 'tonight' or scope ~ '^[0-9a-f-]{36}$'),
  kind text not null check (kind in ('homework', 'notices', 'results', 'tonight')),
  upto timestamptz not null,
  primary key (account_id, scope, kind)
);
alter table family.push_subscriptions enable row level security;
alter table family.push_subscriptions force row level security;
alter table family.push_sent enable row level security;
alter table family.push_sent force row level security;
revoke all on family.push_subscriptions, family.push_sent from public, anon, authenticated, app_user, nca_super;
create policy push_subscriptions_own on family.push_subscriptions as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy push_subscriptions_own_only on family.push_subscriptions as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy push_sent_own on family.push_sent as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy push_sent_own_only on family.push_sent as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
grant select, insert, update, delete on family.push_subscriptions, family.push_sent to family_app;

create function family.push_accounts() returns table (account_id uuid, token_version integer)
language sql stable security definer set search_path = '' as $$
  select a.account_id, a.token_version from family.accounts a
   where exists (select 1 from family.push_subscriptions s where s.account_id = a.account_id)
   order by a.account_id
   limit 2000
$$;
revoke all on function family.push_accounts() from public, anon, authenticated, app_user, family_app, service_role;
grant execute on function family.push_accounts() to nca_super;

-- This ten minutes' send job, once (the idempotency key is the ten minutes in UTC).
create function public.family_push_enqueue() returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into jobs (type, payload, idempotency_key, max_attempts)
  select 'family.push_scan', jsonb_build_object('at', t.m), 'family.push_scan:' || t.m, 1
    from (select to_char(date_trunc('hour', now() at time zone 'UTC') + floor(extract(minute from now() at time zone 'UTC') / 10) * interval '10 minutes', 'YYYY-MM-DD"T"HH24:MI') as m) t
   where exists (select 1 from platform_settings p where p.key = 'jobs.handlers' and jsonb_typeof(p.value) = 'array' and p.value ? 'family.push_scan')
  on conflict (idempotency_key) do nothing
$$;
revoke all on function public.family_push_enqueue() from public, anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('family-push-scan', '*/10 * * * *', 'select public.family_push_enqueue()');
  end if;
end $$;
