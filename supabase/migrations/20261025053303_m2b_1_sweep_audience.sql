-- M2b-1 review, C4 (C341): the Focus Lock sweep tells a parent only when the Focus Lock is on for that family, by the
-- same rule the app uses (src/lib/family/flags.ts switchOn; src/lib/contracts/app-flags.ts flagOn), audience included.
-- Before, it looked only at whether the flag rows were on, so a family outside the switch's audience (a staff preview,
-- a share of families) whose phone stopped reporting could still be emailed that its phone had stopped.
--
-- family.rollout_bucket(text): the account's bucket from 0 to 99, FNV-1a 32 bits over its id's characters, exactly as
-- rolloutBucket() in app-flags.ts (a test holds them equal).
-- family.module_on(account, module, on_by_default): the whole app's switch ('*') on for this family, and the module's
-- own switch on for it; a module Control never saved a switch for is on only when the code says it is on by default
-- (C230-Z), and the Focus Lock is not (C304). The audiences: everyone; staff preview (the account is a preview account);
-- a share of families (the bucket below the percent); schools (never a family account). An end date passed is off.

create function family.rollout_bucket(p_id text) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  h bigint := 2166136261;
  i integer;
begin
  for i in 1 .. coalesce(length(p_id), 0) loop
    h := h # ascii(substr(p_id, i, 1));
    h := (h * 16777619) % 4294967296;
  end loop;
  return (h % 100)::integer;
end $$;

create function family.module_on(p_account uuid, p_module text, p_on_by_default boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  f record;
  m text;
  allowed boolean;
begin
  foreach m in array array['*', p_module] loop
    select enabled, audience, audience_percent, ends_at into f from control.app_flags where app = 'family' and module = m;
    if not found then
      if m = '*' or not p_on_by_default then
        return false;
      end if;
      continue;
    end if;
    if not f.enabled or (f.ends_at is not null and f.ends_at <= now()) then
      return false;
    end if;
    allowed := case f.audience
                 when 'everyone' then true
                 when 'staff_preview' then exists (select 1 from control.preview_accounts p where p.account_id = p_account)
                 when 'percent' then f.audience_percent is not null and family.rollout_bucket(p_account::text) < f.audience_percent
                 else false
               end;
    if not allowed then
      return false;
    end if;
  end loop;
  return true;
end $$;
revoke all on function family.rollout_bucket(text), family.module_on(uuid, text, boolean) from public, anon, authenticated, service_role, app_user, family_app;

create or replace function family.focus_sweep() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  grace integer;
  queued integer;
begin
  select least(720, greatest(45, round((s.value #>> '{}')::numeric)::integer)) into grace
    from control.settings s where s.key = 'family.focus_heartbeat_grace_minutes' and jsonb_typeof(s.value) = 'number';
  grace := coalesce(grace, 90);

  -- 1. A phone whose last report said the lock was on, silent for longer than the grace, of a family the Focus Lock
  --    (and the plan it reads) is on for: one 'stopped' notice for that gap.
  with stopped as (
    update family.focus_devices d set stop_noticed_at = now()
     where d.lock_on and d.stop_noticed_at is null and d.last_heartbeat_at < now() - make_interval(mins => grace)
       and family.module_on(d.account_id, 'focus_lock', false) and family.module_on(d.account_id, 'plan', true)
    returning d.account_id, d.device_id, d.last_heartbeat_at
  )
  insert into family.focus_notices (account_id, device_id, kind, at)
  select s.account_id, s.device_id, 'stopped', s.last_heartbeat_at from stopped s
  on conflict (device_id, kind) where seen_at is null do nothing;

  -- 2. Every notice not yet emailed and not yet seen in the parent area: one email to the parent.
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
