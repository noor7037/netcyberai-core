-- M2b-1 (C305; docs/34 §9; docs/family-app/prompts/M2B_PLAN.md, Decisions C304): the Focus Lock's server.
--
-- What the server keeps about a phone the parent set the lock up on, and nothing more:
--   family.focus_devices           a keyed hash of the phone's own random id (never the id itself), the last lock-health
--                                  report and its three flags ("the lock is on", "its permissions are granted", "the
--                                  clock was changed"). No app name, no time of use, nothing about what was opened.
--   family.focus_device_children   the children the parent set the phone for.
--   family.focus_notices           what the parent is told: the lock stopped reporting while it was on, a permission was
--                                  switched off, the clock was changed. Shown in the parent area, and emailed once.
-- Own account only, twice (a permissive and a restrictive policy), like every family table (M1-1). A child-keyed row
-- names a child of its own account (the composite key), and everything goes with the account or the phone.
--
-- "During lock times": the rules, lock times included, live only on the phone (C304). The phone reports about every 30
-- minutes while the lock is on, and once with "the lock is on" false when it stops normally (the lock window ends, or
-- the parent switches it off with the PIN). So a phone whose last report said the lock was on, and that has not reported
-- for longer than family.focus_heartbeat_grace_minutes, stopped during lock times. family.focus_sweep() tells the parent
-- once for that gap; the next report ends the gap.
--
-- Emails: the sweep queues one email.send job per notice (the platform's email job, the same sender), keyed by the
-- notice, so a notice is emailed once however often the sweep runs. The email names no child and no app.
--
-- DEPLOY SAFETY: the email template (focus_notice, src/lib/email/templates.ts) arrives with the code. Until then no
-- phone can be set up (the focus_lock module is off by default and its routes come with the same code), so no notice
-- exists to email.

-- ---- family -------------------------------------------------------------------------------------------------------

create table family.focus_devices (
  device_id uuid primary key default gen_random_uuid(),
  account_id uuid not null references family.accounts (account_id) on delete cascade,
  -- HMAC-SHA256 of the account and the phone's random id with a server key (src/lib/family/focus.ts): a copy of the
  -- table names no phone, and the same phone in two families gives two unrelated hashes.
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_heartbeat_at timestamptz,
  lock_on boolean,
  permissions_ok boolean,
  clock_changed boolean,
  -- The stopped-reporting notice for the current gap; the next report clears it.
  stop_noticed_at timestamptz,
  unique (account_id, device_hash),
  unique (account_id, device_id),
  -- The three flags arrive together with a report, or not at all.
  check ((last_heartbeat_at is null) = (lock_on is null) and (lock_on is null) = (permissions_ok is null) and (permissions_ok is null) = (clock_changed is null))
);
create index idx_family_focus_devices_stopped on family.focus_devices (last_heartbeat_at) where lock_on and stop_noticed_at is null;

create table family.focus_device_children (
  account_id uuid not null,
  device_id uuid not null,
  child_id uuid not null,
  primary key (device_id, child_id),
  foreign key (account_id, device_id) references family.focus_devices (account_id, device_id) on delete cascade,
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_focus_device_children_child on family.focus_device_children (account_id, child_id);

create table family.focus_notices (
  notice_id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  device_id uuid not null,
  kind text not null check (kind in ('stopped', 'permissions', 'clock')),
  -- When it happened: for 'stopped', the last report before the gap.
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  emailed_at timestamptz,
  seen_at timestamptz,
  foreign key (account_id, device_id) references family.focus_devices (account_id, device_id) on delete cascade
);
-- One notice of a kind per phone until the parent has seen it: told once, not again and again.
create unique index uq_family_focus_notice_unseen on family.focus_notices (device_id, kind) where seen_at is null;
create index idx_family_focus_notices_account on family.focus_notices (account_id, created_at desc);
create index idx_family_focus_notices_to_email on family.focus_notices (created_at) where emailed_at is null and seen_at is null;

alter table family.focus_devices enable row level security;
alter table family.focus_devices force row level security;
alter table family.focus_device_children enable row level security;
alter table family.focus_device_children force row level security;
alter table family.focus_notices enable row level security;
alter table family.focus_notices force row level security;
revoke all on family.focus_devices, family.focus_device_children, family.focus_notices from public, anon, authenticated, app_user, nca_super;
create policy focus_devices_own on family.focus_devices as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy focus_devices_own_only on family.focus_devices as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy focus_device_children_own on family.focus_device_children as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy focus_device_children_own_only on family.focus_device_children as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy focus_notices_own on family.focus_notices as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy focus_notices_own_only on family.focus_notices as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
grant select, insert, update, delete on family.focus_devices, family.focus_device_children to family_app;
-- A notice is written by a report (its kind only) and marked seen by the parent; when it happened, and whether it was
-- emailed, only the server sets. Removing the phone removes its notices.
grant select on family.focus_notices to family_app;
grant insert (account_id, device_id, kind) on family.focus_notices to family_app;
grant update (seen_at) on family.focus_notices to family_app;

-- ---- control ------------------------------------------------------------------------------------------------------

-- How long a phone whose lock was on may go without reporting before the parent is told (the phone reports about every
-- 30 minutes; three missed reports by default). Read by family.focus_sweep(), between 45 and 720 minutes.
insert into control.settings (key, value) values ('family.focus_heartbeat_grace_minutes', '90'::jsonb) on conflict (key) do nothing;

-- ---- the sweep ----------------------------------------------------------------------------------------------------

-- Every 15 minutes (pg_cron, the database owner only):
--   1. While Control has the Focus Lock and the whole Family app switched on: a phone whose last report said the lock
--      was on, silent for longer than the grace, gets one 'stopped' notice for that gap.
--   2. Every notice not yet emailed and not yet seen in the parent area is queued as one email to the parent (the
--      platform's email.send job, keyed by the notice). One the parent has already seen is not emailed.
-- Returns the number of emails queued.
create function family.focus_sweep() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  grace integer;
  queued integer;
begin
  select least(720, greatest(45, round((s.value #>> '{}')::numeric)::integer)) into grace
    from control.settings s where s.key = 'family.focus_heartbeat_grace_minutes' and jsonb_typeof(s.value) = 'number';
  grace := coalesce(grace, 90);

  if exists (select 1 from control.app_flags f where f.app = 'family' and f.module = 'focus_lock' and f.enabled and (f.ends_at is null or f.ends_at > now()))
     and exists (select 1 from control.app_flags f where f.app = 'family' and f.module = '*' and f.enabled and (f.ends_at is null or f.ends_at > now())) then
    with stopped as (
      update family.focus_devices d set stop_noticed_at = now()
       where d.lock_on and d.stop_noticed_at is null and d.last_heartbeat_at < now() - make_interval(mins => grace)
      returning d.account_id, d.device_id, d.last_heartbeat_at
    )
    insert into family.focus_notices (account_id, device_id, kind, at)
    select s.account_id, s.device_id, 'stopped', s.last_heartbeat_at from stopped s
    on conflict (device_id, kind) where seen_at is null do nothing;
  end if;

  with due as (
    update family.focus_notices n set emailed_at = now()
      from family.accounts a
     where a.account_id = n.account_id and n.emailed_at is null and n.seen_at is null
    returning n.notice_id, n.kind, n.at, a.email, a.ui_language
  )
  insert into public.jobs (type, payload, idempotency_key, max_attempts)
  select 'email.send',
         jsonb_build_object(
           'to', jsonb_build_array(d.email),
           'template', 'focus_notice',
           'data', jsonb_build_object('kind', d.kind, 'at', to_char(d.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'lang', d.ui_language)),
         'email.send:focus_notice:' || d.notice_id, 4
    from due d
  on conflict (idempotency_key) do nothing;
  get diagnostics queued = row_count;
  return queued;
end $$;
revoke all on function family.focus_sweep() from public, anon, authenticated, service_role;

-- Every 15 minutes. cron.schedule upserts by name. Where there is no scheduler (the test harness), nothing is scheduled.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('family-focus-sweep', '*/15 * * * *', 'select family.focus_sweep()');
  end if;
end $$;
