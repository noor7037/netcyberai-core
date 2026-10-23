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
grant select, insert, update on family.school_links to family_app;
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

-- 3. Redeeming a code: the family role cannot read school tables, so one definer function checks and spends the code
--    in a single statement (unused, unexpired, then used) and says only which school and guardian it was for.
create function public.family_redeem_connect_code(p_code_hash text, p_account uuid)
returns table (school_id uuid, parent_id uuid, school_name text)
language sql volatile security definer set search_path = '' as $$
  with spent as (
    update public.family_connect_codes c
       set used_at = now()
     where c.code_hash = p_code_hash and c.used_at is null and c.expires_at > now()
       and p_account is not null and p_account = family.current_account()
    returning c.school_id, c.parent_id
  )
  select s.school_id, s.parent_id, sc.name from spent s join public.schools sc on sc.school_id = s.school_id
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

-- 5. A linked guardian reads the school's syllabus for their own children's classes, and those subjects' names (read
--    only), for a child whose core-records consent is on the school's ledger (latest decision granted; a test school's
--    fictional children need none, as loadFamilyHome). Each replaces the table's blanket parent refusal (C230-D) with
--    read-only rows in its own scope.
drop policy syllabus_units_no_parent on public.syllabus_units;
create policy syllabus_units_parent_no_insert on public.syllabus_units as restrictive for insert
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy syllabus_units_parent_no_update on public.syllabus_units as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy syllabus_units_parent_no_delete on public.syllabus_units as restrictive for delete
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy syllabus_units_parent_scope on public.syllabus_units as restrictive for select
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or class_id in (select s.class_id from public.students s join public.parent_student_map m on m.student_id = s.student_id
                          where m.parent_id = nullif(current_setting('app.current_user_id', true), '')::uuid
                            and (exists (select 1 from public.schools sc where sc.school_id = s.school_id and sc.is_test_fixture)
                                 or (select c.granted from public.consent_ledger c
                                      where c.student_id = s.student_id and c.purpose = 'core_records'
                                      order by c.created_at desc limit 1))));

drop policy subjects_no_parent on public.subjects;
create policy subjects_parent_no_insert on public.subjects as restrictive for insert
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy subjects_parent_no_update on public.subjects as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy subjects_parent_no_delete on public.subjects as restrictive for delete
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy subjects_parent_scope on public.subjects as restrictive for select
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or subject_id in (select u.subject_id from public.syllabus_units u));
