-- M2b-2 (C342; M2B_PLAN.md; docs/34 §9.4): a child's own phone.
--
-- 1. family.child_link_codes: the parent's one-time code for one child: six digits, ten minutes, used once, kept only as
--    a keyed hash (the key is the server's, never in the database). A new code for the child replaces the unused one.
-- 2. family.child_devices: a child's own phone, linked by such a code. Its session reaches that one child only, checked
--    live on every request (src/lib/auth/db.ts); the parent removes it at once from the parent area.
-- 3. family.redeem_child_link_code(hash, ip_key): the only way a code is spent, by a phone with no session yet (the
--    family role with no account). At most ten tries an hour from one network and three hundred an hour in all, counted
--    before the code is looked at; a code is spent once; the phone gets its device row.
-- 4. A child's phone sees one child: while app.current_child_id is set (only by the server, from a child-phone
--    session), every family table that names a child shows and takes that child's rows only (restrictive policies),
--    and a child's own syllabus items only through that child's syllabi.

create table family.child_link_codes (
  code_id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  child_id uuid not null,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '10 minutes'),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_child_link_codes_account on family.child_link_codes (account_id, created_at);
create table family.child_devices (
  device_id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  child_id uuid not null,
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_child_devices_account on family.child_devices (account_id);
create table family.child_link_tries (
  scope text not null check (scope = '*' or scope ~ '^[0-9a-f]{64}$'),
  hour timestamptz not null,
  n integer not null default 0 check (n >= 0),
  primary key (scope, hour)
);

alter table family.child_link_codes enable row level security;
alter table family.child_link_codes force row level security;
alter table family.child_devices enable row level security;
alter table family.child_devices force row level security;
alter table family.child_link_tries enable row level security;
alter table family.child_link_tries force row level security;
revoke all on family.child_link_codes, family.child_devices, family.child_link_tries from public, anon, authenticated, app_user, nca_super;
create policy child_link_codes_own on family.child_link_codes as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy child_link_codes_own_only on family.child_link_codes as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy child_devices_own on family.child_devices as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy child_devices_own_only on family.child_devices as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
grant select, insert, delete on family.child_link_codes to family_app;
grant update (used_at) on family.child_link_codes to family_app;
grant select, delete on family.child_devices to family_app;
grant update (last_seen_at, revoked_at) on family.child_devices to family_app;
-- child_link_tries: no right for the family role; only the redeem function counts tries.

-- 3. Spending a code
create function family.redeem_child_link_code(p_hash text, p_ip_key text)
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
  if from_here > 10 or in_all > 300 then
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
revoke all on function family.redeem_child_link_code(text, text) from public, anon, authenticated, service_role, app_user, nca_super;
grant execute on function family.redeem_child_link_code(text, text) to family_app;

-- 4. One child on a child's phone
do $$
declare
  t text;
begin
  foreach t in array array['attempts', 'child_links', 'child_syllabi', 'children', 'day_counts', 'english_assessment_results', 'english_days',
                           'english_enrolments', 'english_lessons_done', 'english_reviews', 'focus_device_children', 'home_plans', 'plan_days',
                           'revisits', 'reward_jars', 'topic_progress', 'child_link_codes', 'child_devices'] loop
    execute format(
      'create policy %I on family.%I as restrictive for all to family_app
         using (nullif(current_setting(''app.current_child_id'', true), '''') is null or child_id = nullif(current_setting(''app.current_child_id'', true), '''')::uuid)
         with check (nullif(current_setting(''app.current_child_id'', true), '''') is null or child_id = nullif(current_setting(''app.current_child_id'', true), '''')::uuid)',
      t || '_one_child', t);
  end loop;
end $$;
create policy child_syllabus_items_one_child on family.child_syllabus_items as restrictive for all to family_app
  using (nullif(current_setting('app.current_child_id', true), '') is null or syllabus_id in (select s.syllabus_id from family.child_syllabi s))
  with check (nullif(current_setting('app.current_child_id', true), '') is null or syllabus_id in (select s.syllabus_id from family.child_syllabi s));
