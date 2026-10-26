-- Review of C346 (LOW): a request the parent approved just before "sign out everywhere" could still be taken by the
-- phone within its ten minutes, making a new linked phone after the parent had ended every session. The approval now
-- keeps the account's session version, and a claim made after that version changed is gone.

alter table family.child_link_requests add column token_version integer;
alter table family.child_link_requests add constraint child_link_requests_version_with_approval check ((token_version is null) = (approved_at is null));

create or replace function family.approve_child_link(p_code_hash text, p_child_id uuid)
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
  update family.child_link_requests
     set account_id = acct, child_id = p_child_id, approved_at = now(),
         token_version = (select a.token_version from family.accounts a where a.account_id = acct)
   where request_id = r.request_id;
  return 'linked';
end $$;

create or replace function family.claim_child_link(p_claim_hash text)
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
  select k.request_id, k.account_id, k.child_id, k.expires_at, k.approved_at, k.claimed_at, k.token_version into r from family.child_link_requests k
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
  -- Every session of the account ended after the approval ("sign out everywhere", a PIN reset): the approval went with them.
  select a.token_version into tv from family.accounts a where a.account_id = r.account_id;
  if tv is distinct from r.token_version then
    return query select 'gone'::text, null::uuid, null::uuid, null::uuid, null::integer;
    return;
  end if;
  insert into family.child_devices (account_id, child_id) values (r.account_id, r.child_id) returning family.child_devices.device_id into made;
  update family.child_link_requests set claimed_at = now(), device_id = made where request_id = r.request_id;
  return query select 'linked'::text, r.account_id, r.child_id, made, tv;
end $$;
