-- M2b-2 reversed (C230-AF, C346; docs/34 §9.4): the child's phone shows the code; the parent types it in the signed-in
-- parent area. A code alone opens nothing: no one can guess a live code blind across all families, because only a
-- signed-in parent, for their own child, can approve it, and only the phone that asked can take the session.
--
-- 1. The parent's code and its spending function (#312's first form) go. They were never on the live site.
-- 2. family.child_link_requests: a phone with no session asks. It is given a six-digit code to show and a long random
--    claim, kept in its own cookie; both are kept here only as keyed hashes (the key is the server's). Ten minutes.
--    family.open_child_link_request: ten an hour from one network, three hundred an hour in all.
-- 3. family.approve_child_link(code_hash, child_id): the parent, in their own session (not a child's phone), types the
--    code for one of their own children. Ten tries an hour for one family.
-- 4. family.claim_child_link(claim_hash): the phone that asked takes its session, once, within ten minutes of the
--    approval; its device row is made then.
-- No role reads or writes the table itself; only these three functions do.

drop function family.redeem_child_link_code(text, text);
drop table family.child_link_codes;

create table family.child_link_requests (
  request_id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  claim_hash text not null unique check (claim_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  account_id uuid,
  child_id uuid,
  approved_at timestamptz,
  claimed_at timestamptz,
  device_id uuid references family.child_devices (device_id) on delete set null,
  check (expires_at > created_at and expires_at <= created_at + interval '10 minutes'),
  check ((account_id is null) = (approved_at is null) and (child_id is null) = (approved_at is null)),
  check (claimed_at is null or approved_at is not null),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_child_link_requests_expires on family.child_link_requests (expires_at);
alter table family.child_link_requests enable row level security;
alter table family.child_link_requests force row level security;
revoke all on family.child_link_requests from public, anon, authenticated, app_user, nca_super, family_app;

-- 2. A phone asks
create function family.open_child_link_request(p_code_hash text, p_claim_hash text, p_ip_key text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  hour_now timestamptz := date_trunc('hour', now());
  from_here integer;
  in_all integer;
begin
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' or p_claim_hash is null or p_claim_hash !~ '^[0-9a-f]{64}$'
     or p_ip_key is null or p_ip_key !~ '^[0-9a-f]{64}$' then
    return 'wrong';
  end if;
  insert into family.child_link_tries (scope, hour, n) values (p_ip_key, hour_now, 1)
  on conflict (scope, hour) do update set n = family.child_link_tries.n + 1 returning n into from_here;
  insert into family.child_link_tries (scope, hour, n) values ('*', hour_now, 1)
  on conflict (scope, hour) do update set n = family.child_link_tries.n + 1 returning n into in_all;
  delete from family.child_link_tries where hour < hour_now - interval '1 day';
  if from_here > 10 or in_all > 300 then
    return 'too_many';
  end if;
  delete from family.child_link_requests where expires_at < now() - interval '1 day';
  insert into family.child_link_requests (code_hash, claim_hash, expires_at) values (p_code_hash, p_claim_hash, now() + interval '10 minutes')
  on conflict do nothing;
  if not found then
    return 'taken';
  end if;
  return 'made';
end $$;

-- 3. The parent types the code
create function family.approve_child_link(p_code_hash text, p_child_id uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  acct uuid := family.current_account();
  hour_now timestamptz := date_trunc('hour', now());
  tries integer;
  r record;
begin
  -- Only a parent's own session: never a child's phone, never without an account.
  if acct is null or nullif(current_setting('app.current_child_id', true), '') is not null then
    return 'not_found';
  end if;
  if p_child_id is null or not exists (select 1 from family.children c where c.account_id = acct and c.child_id = p_child_id) then
    return 'not_found';
  end if;
  insert into family.child_link_tries (scope, hour, n)
  values (encode(sha256(convert_to('child-link-account:' || acct::text, 'UTF8')), 'hex'), hour_now, 1)
  on conflict (scope, hour) do update set n = family.child_link_tries.n + 1 returning n into tries;
  if tries > 10 then
    return 'too_many';
  end if;
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    return 'wrong';
  end if;
  select k.request_id into r from family.child_link_requests k
   where k.code_hash = p_code_hash and k.approved_at is null and k.expires_at > now()
   for update;
  if not found then
    return 'wrong';
  end if;
  update family.child_link_requests set account_id = acct, child_id = p_child_id, approved_at = now() where request_id = r.request_id;
  return 'linked';
end $$;

-- 4. The phone that asked takes its session
create function family.claim_child_link(p_claim_hash text)
returns table (outcome text, account_id uuid, child_id uuid, device_id uuid, token_version integer)
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  made uuid;
  tv integer;
begin
  if p_claim_hash is null or p_claim_hash !~ '^[0-9a-f]{64}$' then
    return query select 'gone'::text, null::uuid, null::uuid, null::uuid, null::integer;
    return;
  end if;
  select k.request_id, k.account_id, k.child_id, k.expires_at, k.approved_at, k.claimed_at into r from family.child_link_requests k
   where k.claim_hash = p_claim_hash
   for update;
  if not found or r.claimed_at is not null or (r.approved_at is null and r.expires_at <= now()) or r.approved_at < now() - interval '10 minutes' then
    return query select 'gone'::text, null::uuid, null::uuid, null::uuid, null::integer;
    return;
  end if;
  if r.approved_at is null then
    return query select 'waiting'::text, null::uuid, null::uuid, null::uuid, null::integer;
    return;
  end if;
  insert into family.child_devices (account_id, child_id) values (r.account_id, r.child_id) returning family.child_devices.device_id into made;
  update family.child_link_requests set claimed_at = now(), device_id = made where request_id = r.request_id;
  select a.token_version into tv from family.accounts a where a.account_id = r.account_id;
  return query select 'linked'::text, r.account_id, r.child_id, made, tv;
end $$;

revoke all on function family.open_child_link_request(text, text, text), family.approve_child_link(text, uuid), family.claim_child_link(text)
  from public, anon, authenticated, service_role, app_user, nca_super;
grant execute on function family.open_child_link_request(text, text, text), family.approve_child_link(text, uuid), family.claim_child_link(text) to family_app;
