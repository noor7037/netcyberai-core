-- M2b-2 review (C342): a hundred tries an hour in all, not three hundred. A guess that matches any family's live code
-- links a phone to that child, so the platform-wide count bounds the risk; real families link a phone rarely. (Each
-- network's ten an hour now count an IPv6 /64 as one network: src/lib/family/child-phone.ts.)

create or replace function family.redeem_child_link_code(p_hash text, p_ip_key text)
returns table (outcome text, account_id uuid, child_id uuid, device_id uuid, token_version integer)
language plpgsql security definer set search_path = '' as $$
declare
  hour_now timestamptz := date_trunc('hour', now());
  from_here integer;
  in_all integer;
  c record;
  made uuid;
  tv integer;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_ip_key is null or p_ip_key !~ '^[0-9a-f]{64}$' then
    return query select 'wrong'::text, null::uuid, null::uuid, null::uuid, null::integer;
    return;
  end if;
  insert into family.child_link_tries (scope, hour, n) values (p_ip_key, hour_now, 1)
  on conflict (scope, hour) do update set n = family.child_link_tries.n + 1 returning n into from_here;
  insert into family.child_link_tries (scope, hour, n) values ('*', hour_now, 1)
  on conflict (scope, hour) do update set n = family.child_link_tries.n + 1 returning n into in_all;
  delete from family.child_link_tries where hour < hour_now - interval '1 day';
  if from_here > 10 or in_all > 100 then
    return query select 'too_many'::text, null::uuid, null::uuid, null::uuid, null::integer;
    return;
  end if;
  select k.code_id, k.account_id, k.child_id into c from family.child_link_codes k
   where k.code_hash = p_hash and k.used_at is null and k.expires_at > now()
   for update;
  if not found then
    return query select 'wrong'::text, null::uuid, null::uuid, null::uuid, null::integer;
    return;
  end if;
  update family.child_link_codes set used_at = now() where code_id = c.code_id;
  insert into family.child_devices (account_id, child_id) values (c.account_id, c.child_id) returning family.child_devices.device_id into made;
  select a.token_version into tv from family.accounts a where a.account_id = c.account_id;
  return query select 'linked'::text, c.account_id, c.child_id, made, tv;
end $$;
