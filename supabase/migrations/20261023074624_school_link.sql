-- School Link (Decision Log C230-AA; docs/family-app/03 §4, docs/34 §5): the only path from a Family app account to a
-- school's records. The school office makes a single-use connect code for one guardian; the parent enters it in the
-- Family app's parent area; the app then reads that school AS that guardian, so the school's own parent rules decide
-- every row (own children only, read only, the school's consent ledger first). Unlinking, by the family or by the
-- school, ends it in the same request. Nothing school-owned is copied into family.*.

-- 1. The connect code, school-owned. Only a SHA-256 of the code is kept; the office sees the code once.
create table public.family_connect_codes (
  code_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(school_id),
  parent_id uuid not null,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (school_id, parent_id) references public.parents(school_id, parent_id)
);
create index idx_family_connect_codes_parent on public.family_connect_codes(school_id, parent_id);
alter table public.family_connect_codes enable row level security;
alter table public.family_connect_codes force row level security;
revoke all on public.family_connect_codes from public, anon, authenticated;
grant select, insert, update on public.family_connect_codes to app_user;
create policy family_connect_codes_tenant_isolation on public.family_connect_codes
  using (school_id = current_setting('app.current_tenant_id', true)::uuid);
-- Made and withdrawn by the principal or a school admin only (the guardian screen's office roles).
create policy family_connect_codes_office on public.family_connect_codes as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin'))
  with check (coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin'));
create policy family_connect_codes_no_parent on public.family_connect_codes as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');

-- 2. The family's side: which school and guardian an account is linked to, and which family child is which student.
create table family.school_links (
  link_id uuid primary key default gen_random_uuid(),
  account_id uuid not null references family.accounts(account_id) on delete cascade,
  school_id uuid not null,
  parent_id uuid not null,
  linked_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by text check (revoked_by is null or revoked_by in ('family', 'school'))
);
create unique index uq_family_school_links_active on family.school_links(account_id, school_id, parent_id) where revoked_at is null;
create index idx_family_school_links_guardian on family.school_links(school_id, parent_id) where revoked_at is null;

create table family.child_links (
  child_id uuid primary key references family.children(child_id) on delete cascade,
  link_id uuid not null references family.school_links(link_id) on delete cascade,
  account_id uuid not null references family.accounts(account_id) on delete cascade,
  student_id uuid not null,
  linked_at timestamptz not null default now(),
  unique (link_id, student_id)
);

alter table family.school_links enable row level security;
alter table family.school_links force row level security;
alter table family.child_links enable row level security;
alter table family.child_links force row level security;
revoke all on family.school_links, family.child_links from public, anon, authenticated;
-- A link is made only by spending a code (section 3) and only ever closes: the family may set when and by whom.
grant select on family.school_links to family_app;
grant update (revoked_at, revoked_by) on family.school_links to family_app;
grant select, insert, delete on family.child_links to family_app;
create policy school_links_own on family.school_links as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy school_links_own_only on family.school_links as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy child_links_own on family.child_links as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy child_links_own_only on family.child_links as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());

-- Code tries per account per day (src/lib/family/school.ts allows 10), so a code cannot be guessed.
create table family.connect_attempts (
  account_id uuid not null references family.accounts(account_id) on delete cascade,
  tried_on date not null,
  n integer not null default 1 check (n >= 1),
  primary key (account_id, tried_on)
);
alter table family.connect_attempts enable row level security;
alter table family.connect_attempts force row level security;
revoke all on family.connect_attempts from public, anon, authenticated;
grant select, insert, update on family.connect_attempts to family_app;
create policy connect_attempts_own on family.connect_attempts as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy connect_attempts_own_only on family.connect_attempts as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());

-- A closed link stays closed, and no link changes its account, school or guardian, whoever runs the update.
create function family.school_links_only_close() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.revoked_at is not null or new.revoked_at is null
     or new.link_id is distinct from old.link_id or new.account_id is distinct from old.account_id
     or new.school_id is distinct from old.school_id or new.parent_id is distinct from old.parent_id
     or new.linked_at is distinct from old.linked_at then
    raise exception 'a school link only closes' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger school_links_only_close before update on family.school_links
  for each row execute function family.school_links_only_close();

-- 3. Redeeming a code: the family role cannot read school tables or make a link, so one definer function checks and
--    spends the code (unused, unexpired, then used), makes the account's link to that guardian (or keeps the open one),
--    and says only the link and the school's name. No code spent, no link.
create function public.family_redeem_connect_code(p_code_hash text, p_account uuid)
returns table (link_id uuid, school_name text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_school uuid;
  v_parent uuid;
  v_link uuid;
begin
  if p_account is null or p_account is distinct from family.current_account() then
    return;
  end if;
  update public.family_connect_codes c
     set used_at = now()
   where c.code_hash = p_code_hash and c.used_at is null and c.expires_at > now()
  returning c.school_id, c.parent_id into v_school, v_parent;
  if v_school is null then
    return;
  end if;
  select l.link_id into v_link from family.school_links l
   where l.account_id = p_account and l.school_id = v_school and l.parent_id = v_parent and l.revoked_at is null;
  if v_link is null then
    insert into family.school_links as l (account_id, school_id, parent_id) values (p_account, v_school, v_parent)
    returning l.link_id into v_link;
  end if;
  return query select v_link, sc.name from public.schools sc where sc.school_id = v_school;
end
$$;
revoke all on function public.family_redeem_connect_code(text, uuid) from public;
grant execute on function public.family_redeem_connect_code(text, uuid) to family_app;

-- 4. The school ends a guardian's links (the guardian screen's "Disconnect the Family app"): staff cannot read family
--    tables, so one definer function closes that guardian's links in the caller's own school and says how many.
create function family.revoke_school_links_for_guardian(p_parent uuid)
returns integer
language sql volatile security definer set search_path = '' as $$
  with closed as (
    update family.school_links l
       set revoked_at = now(), revoked_by = 'school'
     where l.parent_id = p_parent and l.revoked_at is null
       and l.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
       and coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin')
    returning 1
  )
  select count(*)::integer from closed
$$;
revoke all on function family.revoke_school_links_for_guardian(uuid) from public;
grant usage on schema family to app_user;
grant execute on function family.revoke_school_links_for_guardian(uuid) to app_user;

-- 5. A linked guardian reads the school's syllabus for their own children's classes, and those subjects' names, for a
--    child whose core-records consent is on the school's ledger (latest decision granted; a test school's fictional
--    children need none, as loadFamilyHome). The tables' parent refusals (C230-D) now let those rows be read and still
--    refuse every parent write (with check); the staff and office write policies refuse a parent's insert and delete.
alter policy syllabus_units_no_parent on public.syllabus_units
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or class_id in (select s.class_id from public.students s join public.parent_student_map m on m.student_id = s.student_id
                          where m.parent_id = nullif(current_setting('app.current_user_id', true), '')::uuid
                            and (exists (select 1 from public.schools sc where sc.school_id = s.school_id and sc.is_test_fixture)
                                 or (select c.granted from public.consent_ledger c
                                      where c.student_id = s.student_id and c.purpose = 'core_records'
                                      order by c.created_at desc limit 1))))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy subjects_no_parent on public.subjects
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or subject_id in (select u.subject_id from public.syllabus_units u))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
