-- Sibling mapping, Students module (PR-2c, Decision Log C116): families
-- (households), numbered codes, and guardian merges that lose nothing.
-- Explicit links only (05_BUSINESS_LOGIC §2 "Sibling linkage"): the app may
-- suggest a sibling from a matching guardian phone or email, but only the
-- office links.
--
-- Applied test-first: test database, then prod, then the catalog snapshot.

-- ---- Numbering ------------------------------------------------------------------
-- One counter per school, sequence and period ('all', or the year when the
-- pattern has {YYYY}/{YY}). Allocation is one upsert, so two people creating
-- a family at the same moment never get the same number.
create table school_sequences (
  school_id    uuid not null references schools(school_id),
  sequence_key text not null check (sequence_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  period_key   text not null check (period_key ~ '^(all|[0-9]{4})$'),
  last_value   int not null check (last_value >= 1),
  updated_at   timestamptz not null default now(),
  primary key (school_id, sequence_key, period_key)
);

-- ---- Families -------------------------------------------------------------------
create table families (
  family_id   uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(school_id),
  family_code text not null check (length(family_code) between 1 and 40),
  created_by  uuid not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (school_id, family_id),
  unique (school_id, family_code)
);

-- A student belongs to at most one family; leaving the school (transfer,
-- alumni) does not remove the link, so the family stays whole.
alter table students add column family_id uuid;
alter table students add constraint students_school_family_fkey
  foreign key (school_id, family_id) references families (school_id, family_id);
create index idx_students_family on students (school_id, family_id) where family_id is not null;

-- ---- Guardian merges --------------------------------------------------------------
-- Merging keeps both rows: the merged guardian is marked `merged_into` the
-- kept one and loses its links, which move to the kept guardian. Its own
-- row (and every history row that points at it: feedback, Pulse replies)
-- stays as it was, so nothing is lost and a data request still finds one
-- copy of each person's details. guardian_merges records ids only.
alter table parents add column merged_into uuid;
alter table parents add column merged_at timestamptz;
alter table parents add constraint parents_school_merged_into_fkey
  foreign key (school_id, merged_into) references parents (school_id, parent_id);
alter table parents add constraint parents_not_merged_into_self check (merged_into is null or merged_into <> parent_id);
alter table parents add constraint parents_merged_at_with_target check ((merged_into is null) = (merged_at is null));

create table guardian_merges (
  merge_id         uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools(school_id),
  kept_parent_id   uuid not null,
  merged_parent_id uuid not null,
  -- Students whose link moved from the merged guardian to the kept one.
  links_moved      uuid[] not null default '{}',
  -- Links dropped because the kept guardian was already linked to that
  -- student: the student and the dropped link's verification state.
  links_dropped    jsonb not null default '[]' check (jsonb_typeof(links_dropped) = 'array'),
  merged_by        uuid not null,
  merged_at        timestamptz not null default now(),
  check (kept_parent_id <> merged_parent_id),
  foreign key (school_id, kept_parent_id) references parents (school_id, parent_id),
  foreign key (school_id, merged_parent_id) references parents (school_id, parent_id)
);
create index idx_guardian_merges_school on guardian_merges (school_id, merged_at desc);

-- Guardian email matching for sibling suggestions.
create index if not exists idx_parents_email_lower on parents (school_id, lower(email)) where email is not null;

-- ---- grants -------------------------------------------------------------------------
revoke all on school_sequences, families, guardian_merges from public, anon, authenticated, app_backend;
revoke all on school_sequences, families, guardian_merges from app_user, nca_super;
grant select, insert, update on school_sequences, families to app_user, nca_super;
-- guardian_merges is append-only (scripts/check_append_only_grants.py).
grant select, insert on guardian_merges to app_user, nca_super;
revoke update, delete on guardian_merges from app_user, anon, authenticated, nca_super;

-- ---- RLS ----------------------------------------------------------------------------
alter table school_sequences enable row level security;
alter table school_sequences force row level security;
alter table families enable row level security;
alter table families force row level security;
alter table guardian_merges enable row level security;
alter table guardian_merges force row level security;

create policy school_sequences_tenant_isolation on school_sequences for all
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy school_sequences_office_write on school_sequences as restrictive for all
  using (true)
  with check (current_setting('app.current_role', true) in ('principal', 'school_admin', 'super_admin'));

create policy families_tenant_isolation on families for all
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- Families are created and changed by the office only.
create policy families_office_write on families as restrictive for all
  using (true)
  with check (current_setting('app.current_role', true) in ('principal', 'school_admin', 'super_admin'));
-- A teacher sees a family only through a student of their own classes
-- (teacher_own_class_ids, C112); which siblings they see is decided by
-- teacher_scope_students.
create policy teacher_scope_families on families as restrictive for all
  using (
    coalesce(current_setting('app.current_role', true), '') <> 'teacher'
    or exists (
      select 1 from students s
      where s.school_id = families.school_id
        and s.family_id = families.family_id
        and s.class_id in (select unnest(public.teacher_own_class_ids()))
    )
  );

create policy guardian_merges_tenant_read on guardian_merges for select
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy guardian_merges_tenant_insert on guardian_merges for insert
  with check (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy guardian_merges_office_only on guardian_merges as restrictive for all
  using (current_setting('app.current_role', true) in ('principal', 'school_admin', 'super_admin'))
  with check (current_setting('app.current_role', true) in ('principal', 'school_admin', 'super_admin'));
