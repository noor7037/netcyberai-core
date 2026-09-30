-- P1-b platform frameworks (docs/17 §1a; contracts C110; Decision Log C112):
-- per-school entitlements, the settings engine's storage and history,
-- custom fields, saved views, bulk runs, and Student 360 search (indexes
-- plus the teacher own-classes rule on students).
--
-- Applied test-first (roadmap 16 §3 rule 7): the test database
-- (unodnyyfqhxrbusbkite), then prod (rkpfkqpotmpupbjfambg), then the
-- catalog snapshot on both.
--
-- Module ids are checked for shape only: the list of modules lives in
-- src/lib/contracts/modules.ts and nowhere else.

create extension if not exists pg_trgm with schema extensions;

-- ---- 1. Entitlements ----------------------------------------------------------
-- A school with no row here has plan 'unassigned', access 'full' and no
-- module switched on except Help Center and Raise Ticket, which are on in
-- every access mode (src/lib/contracts/entitlements.ts).
create table school_entitlements (
  school_id     uuid primary key references schools(school_id),
  plan          text not null default 'unassigned' check (plan ~ '^[a-z0-9_-]{1,40}$'),
  access_mode   text not null default 'full' check (access_mode in ('full', 'grace', 'read_only', 'suspended')),
  grace_ends_at timestamptz,
  updated_by    uuid,
  updated_at    timestamptz not null default now(),
  check (access_mode <> 'grace' or grace_ends_at is not null)
);

create table school_module_entitlements (
  school_id     uuid not null references schools(school_id),
  module_id     text not null check (module_id ~ '^[a-z][a-z0-9-]{1,39}$'),
  enabled       boolean not null,
  source        text not null check (source in ('plan', 'founder_override', 'trial')),
  limits        jsonb not null default '{}' check (jsonb_typeof(limits) = 'object'),
  overridden_by uuid,
  overridden_at timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (school_id, module_id),
  -- Help is never switched off (founder rule, C112).
  constraint help_modules_always_on check (module_id not in ('help-center', 'raise-ticket') or enabled)
);

-- ---- 2. Settings --------------------------------------------------------------
-- Only values that differ from the schema default are stored; the schema
-- itself is code (src/lib/frameworks/settings-schemas.ts).
create table school_settings (
  school_id      uuid not null references schools(school_id),
  module_id      text not null check (module_id ~ '^[a-z][a-z0-9-]{1,39}$'),
  schema_version int not null check (schema_version >= 1),
  setting_values jsonb not null default '{}' check (jsonb_typeof(setting_values) = 'object'),
  revision       int not null default 0 check (revision >= 0),
  updated_by     uuid,
  updated_at     timestamptz not null default now(),
  primary key (school_id, module_id)
);

-- History of every change, append-only (scripts/check_append_only_grants.py).
create table school_setting_changes (
  change_id   bigint generated always as identity primary key,
  school_id   uuid not null references schools(school_id),
  module_id   text not null check (module_id ~ '^[a-z][a-z0-9-]{1,39}$'),
  setting_key text not null check (setting_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  from_value  jsonb, -- null: was the default
  to_value    jsonb, -- null: reset to the default
  revision    int not null check (revision >= 1),
  changed_by  uuid not null,
  changed_at  timestamptz not null default now()
);
create index idx_school_setting_changes_module on school_setting_changes (school_id, module_id, change_id desc);

-- ---- 3. Custom fields ---------------------------------------------------------
create table custom_field_definitions (
  field_id    uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(school_id),
  entity      text not null check (entity in ('student', 'guardian', 'staff', 'admission_lead')),
  field_key   text not null check (field_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label       text not null check (length(btrim(label)) between 1 and 80),
  field_type  text not null check (field_type in ('text', 'number', 'date', 'list', 'boolean')),
  options     jsonb check (options is null or (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 1 and 50)),
  required    boolean not null default false,
  archived_at timestamptz,
  created_by  uuid not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (school_id, entity, field_key),
  unique (school_id, field_id),
  check ((field_type = 'list') = (options is not null))
);

create table custom_field_values (
  school_id  uuid not null,
  field_id   uuid not null,
  record_id  uuid not null,
  value      jsonb not null check (jsonb_typeof(value) in ('string', 'number', 'boolean')),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key (school_id, field_id, record_id),
  foreign key (school_id, field_id) references custom_field_definitions (school_id, field_id)
);
create index idx_custom_field_values_record on custom_field_values (school_id, record_id);

-- ---- 4. Saved views -----------------------------------------------------------
create table saved_views (
  view_id           uuid primary key default gen_random_uuid(),
  school_id         uuid not null references schools(school_id),
  list_id           text not null check (list_id ~ '^[a-z][a-z0-9_-]{0,39}$'),
  name              text not null check (length(btrim(name)) between 1 and 80),
  scope             text not null check (scope in ('personal', 'school')),
  owner_user_id     uuid not null,
  query             jsonb not null check (jsonb_typeof(query) = 'object' and length(query::text) <= 8000),
  default_for_roles text[] not null default '{}'
                      check (default_for_roles <@ array['principal', 'school_admin', 'teacher', 'accountant', 'academic_coordinator']),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (scope = 'school' or cardinality(default_for_roles) = 0)
);
create unique index uq_saved_views_name on saved_views (school_id, list_id, scope, owner_user_id, lower(btrim(name)));

-- ---- 5. Bulk runs -------------------------------------------------------------
-- One row from preview to finish. The ids are fixed at preview; confirm
-- re-checks the filtered set and refuses if it changed. State machine:
-- previewed → running → succeeded | partially_failed | failed → undone,
-- previewed → queued → running (large sets, on the job pipeline),
-- previewed → expired.
create table bulk_runs (
  run_id             uuid primary key default gen_random_uuid(),
  school_id          uuid not null references schools(school_id),
  action_id          text not null check (action_id ~ '^[a-z_]+\.[a-z_]+$'),
  status             text not null default 'previewed'
                       check (status in ('previewed', 'queued', 'running', 'succeeded', 'partially_failed', 'failed', 'undone', 'expired')),
  params             jsonb not null default '{}' check (jsonb_typeof(params) = 'object'),
  -- The filtered-set query (selection mode 'filtered'), re-run at confirm.
  selection_query    jsonb check (selection_query is null or (jsonb_typeof(selection_query) = 'object' and length(selection_query::text) <= 8000)),
  target_ids         uuid[] not null check (cardinality(target_ids) between 1 and 5000),
  total              int not null check (total >= 0),
  done               int not null default 0 check (done >= 0),
  failed             int not null default 0 check (failed >= 0),
  failures           jsonb not null default '[]' check (jsonb_typeof(failures) = 'array'),
  undo_data          jsonb,
  created_by         uuid not null,
  created_role       text not null,
  created_at         timestamptz not null default now(),
  preview_expires_at timestamptz not null,
  started_at         timestamptz,
  finished_at        timestamptz,
  undo_until         timestamptz,
  unique (school_id, run_id)
);
create index idx_bulk_runs_school on bulk_runs (school_id, created_at desc);

-- ---- 6. Student 360 search ----------------------------------------------------
-- Name contains, admission number prefix, guardian phone digits: trigram
-- and expression indexes so the search stays well inside 300 ms at 5,000
-- students (C112 has the measured plan).
create index if not exists idx_students_name_trgm on students using gin (lower(name) extensions.gin_trgm_ops);
create index if not exists idx_students_admission_no on students (school_id, lower(admission_no) text_pattern_ops);
create index if not exists idx_parents_phone_digits_trgm on parents using gin (regexp_replace(phone, '[^0-9]', '', 'g') extensions.gin_trgm_ops);
create index if not exists idx_parent_student_map_parent on parent_student_map (school_id, parent_id);

-- Teachers see only students of their own classes (17 §5): a class they
-- teach a subject in (teacher_subjects) or are class teacher of. Restrictive,
-- so it narrows students_tenant_isolation for the teacher role only, the
-- same shape as teacher_scope_attendance. Applies to every read of
-- students by a teacher, so Student 360 search is scoped by the database,
-- not by the API.
drop policy if exists teacher_scope_students on students;
create policy teacher_scope_students on students
  as restrictive
  for select
  using (
    coalesce(current_setting('app.current_role', true), '') <> 'teacher'
    or class_id in (
      select ts.class_id
      from teacher_subjects ts
      join teachers t on t.teacher_id = ts.teacher_id
      where t.user_id = (current_setting('app.current_user_id', true))::uuid
        and ts.school_id = students.school_id
      union
      select c.class_id
      from classes c
      where c.class_teacher_id = (current_setting('app.current_user_id', true))::uuid
        and c.school_id = students.school_id
    )
  );

-- ---- grants -------------------------------------------------------------------
revoke all on school_entitlements, school_module_entitlements, school_settings, school_setting_changes,
  custom_field_definitions, custom_field_values, saved_views, bulk_runs from public, anon, authenticated, app_backend;
revoke all on school_entitlements, school_module_entitlements, school_settings, school_setting_changes,
  custom_field_definitions, custom_field_values, saved_views, bulk_runs from app_user, nca_super;

-- Entitlements: schools read their own; only the founder (nca_super) writes.
grant select on school_entitlements, school_module_entitlements to app_user;
grant select, insert, update on school_entitlements, school_module_entitlements to nca_super;
-- Settings, custom fields, saved views, bulk runs: school data.
grant select, insert, update on school_settings to app_user, nca_super;
grant select, insert on school_setting_changes to app_user, nca_super;
revoke update, delete on school_setting_changes from app_user, anon, authenticated, nca_super;
grant select, insert, update on custom_field_definitions to app_user, nca_super;
grant select, insert, update, delete on custom_field_values to app_user, nca_super;
grant select, insert, update, delete on saved_views to app_user, nca_super;
grant select, insert, update on bulk_runs to app_user, nca_super;

-- ---- RLS ----------------------------------------------------------------------
alter table school_entitlements enable row level security;
alter table school_entitlements force row level security;
alter table school_module_entitlements enable row level security;
alter table school_module_entitlements force row level security;
alter table school_settings enable row level security;
alter table school_settings force row level security;
alter table school_setting_changes enable row level security;
alter table school_setting_changes force row level security;
alter table custom_field_definitions enable row level security;
alter table custom_field_definitions force row level security;
alter table custom_field_values enable row level security;
alter table custom_field_values force row level security;
alter table saved_views enable row level security;
alter table saved_views force row level security;
alter table bulk_runs enable row level security;
alter table bulk_runs force row level security;

create policy school_entitlements_tenant_read on school_entitlements for select
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy school_entitlements_platform_write on school_entitlements for all to nca_super using (true) with check (true);
create policy school_module_entitlements_tenant_read on school_module_entitlements for select
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy school_module_entitlements_platform_write on school_module_entitlements for all to nca_super using (true) with check (true);

create policy school_settings_tenant_isolation on school_settings for all
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy school_setting_changes_tenant_read on school_setting_changes for select
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy school_setting_changes_tenant_insert on school_setting_changes for insert
  with check (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- Which role may change which setting is per field (the schema's editableBy,
-- checked by the engine); the database keeps teachers out entirely, since no
-- setting is editable by a teacher today.
create policy school_settings_no_teacher_write on school_settings as restrictive for all
  using (true)
  with check (coalesce(current_setting('app.current_role', true), '') <> 'teacher');

create policy custom_field_definitions_tenant_isolation on custom_field_definitions for all
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy custom_field_values_tenant_isolation on custom_field_values for all
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- Fields are defined by the office; values belong to Students, Parents,
-- Staff and Admissions, which are office modules (17 §5), so only the
-- office reads or writes them.
create policy custom_field_definitions_office_write on custom_field_definitions as restrictive for all
  using (true)
  with check (current_setting('app.current_role', true) in ('principal', 'school_admin', 'super_admin'));
create policy custom_field_values_office_only on custom_field_values as restrictive for all
  using (current_setting('app.current_role', true) in ('principal', 'school_admin', 'super_admin'))
  with check (current_setting('app.current_role', true) in ('principal', 'school_admin', 'super_admin'));

create policy saved_views_tenant_isolation on saved_views for all
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- Personal views are the owner's alone; school views are seen by everyone
-- in the school and managed by the principal and school admin.
create policy saved_views_visible on saved_views as restrictive for select
  using (scope = 'school' or owner_user_id = (current_setting('app.current_user_id', true))::uuid);
create policy saved_views_insert_own on saved_views as restrictive for insert
  with check (
    owner_user_id = (current_setting('app.current_user_id', true))::uuid
    and (scope = 'personal' or current_setting('app.current_role', true) in ('principal', 'school_admin'))
  );
create policy saved_views_manage on saved_views as restrictive for update
  using (
    (scope = 'personal' and owner_user_id = (current_setting('app.current_user_id', true))::uuid)
    or (scope = 'school' and current_setting('app.current_role', true) in ('principal', 'school_admin'))
  )
  with check (
    (scope = 'personal' and owner_user_id = (current_setting('app.current_user_id', true))::uuid)
    or (scope = 'school' and current_setting('app.current_role', true) in ('principal', 'school_admin'))
  );
create policy saved_views_delete on saved_views as restrictive for delete
  using (
    (scope = 'personal' and owner_user_id = (current_setting('app.current_user_id', true))::uuid)
    or (scope = 'school' and current_setting('app.current_role', true) in ('principal', 'school_admin'))
  );

create policy bulk_runs_tenant_isolation on bulk_runs for all
  using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- A run is seen and confirmed by the person who previewed it; the principal
-- and school admin see every run of their school.
create policy bulk_runs_owner_or_office on bulk_runs as restrictive for all
  using (
    created_by = (current_setting('app.current_user_id', true))::uuid
    or current_setting('app.current_role', true) in ('principal', 'school_admin', 'super_admin')
  )
  with check (
    created_by = (current_setting('app.current_user_id', true))::uuid
    or current_setting('app.current_role', true) in ('principal', 'school_admin', 'super_admin')
  );

-- Large bulk runs go to the job pipeline: a school session may now also
-- enqueue bulk.run jobs of its own school (was invite.send only, B2).
drop policy if exists jobs_enqueue on jobs;
create policy jobs_enqueue on jobs for insert to app_user, nca_super
  with check (
    current_user = 'nca_super'
    or (
      type in ('invite.send', 'bulk.run')
      and school_id is not null
      and school_id = (current_setting('app.current_tenant_id', true))::uuid
    )
  );
