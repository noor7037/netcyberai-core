-- The slice of the live schema the B2 migration builds on (C98), for the
-- PGlite flow and RLS tests: the same enums, roles, columns that matter,
-- policies and audit hash chain as the dev and prod projects (read from
-- dev on 2026-09-30). The B2 migration file itself is then applied
-- verbatim on top.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role app_backend nologin;
create role app_user nologin;
create role nca_super nologin bypassrls;

create type user_role as enum ('super_admin', 'school_admin', 'principal', 'teacher', 'accountant', 'parent', 'student', 'academic_coordinator');
create type board_type as enum ('CBSE', 'ICSE', 'STATE', 'IB', 'OTHER');
create type tenant_type as enum ('school', 'coaching', 'college');
create type onboarding_stage as enum ('tenant_created', 'admin_invited', 'data_imported', 'data_validated', 'consent_collection', 'configuration', 'training', 'pilot_outbound_approved', 'go_live');

create table schools (
  school_id uuid primary key default gen_random_uuid(),
  name text not null,
  board board_type not null default 'STATE',
  tenant_type tenant_type not null default 'school',
  is_pilot boolean not null default true,
  pilot_allow_outbound boolean not null default false,
  onboarding_stage onboarding_stage not null default 'tenant_created',
  jurisdiction text not null,
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  user_id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(school_id),
  email text,
  phone text,
  role user_role not null,
  display_name text not null,
  is_active boolean not null default true,
  token_version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_users_school_email on users(school_id, email) where email is not null;

create table memberships (
  membership_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(user_id),
  school_id uuid not null references schools(school_id),
  role user_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, school_id)
);

create table audit_log (
  audit_id bigserial primary key,
  occurred_at timestamptz not null default now(),
  school_id uuid,
  actor_user_id uuid,
  actor_role user_role,
  event_action text not null,
  target_type text,
  target_id text,
  before_state jsonb,
  after_state jsonb,
  prev_hash text,
  row_hash text,
  created_at timestamptz not null default now()
);

create or replace function audit_hash_chain() returns trigger
language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $$
declare prev text;
begin
  perform pg_advisory_xact_lock(hashtext(coalesce(new.school_id::text, '__platform__')));
  new.occurred_at := clock_timestamp();
  select row_hash into prev from audit_log where school_id is not distinct from new.school_id order by occurred_at desc limit 1;
  new.prev_hash := coalesce(prev, '0');
  new.row_hash := encode(extensions.digest(coalesce(new.prev_hash,'') || new.event_action || coalesce(new.target_id,'') || new.occurred_at::text, 'sha256'), 'hex');
  return new;
end $$;
create trigger audit_hash_chain_trigger before insert on audit_log for each row execute function audit_hash_chain();

grant usage on schema public, extensions to app_user, nca_super, app_backend, anon, authenticated;
grant execute on all functions in schema extensions to app_user, nca_super;
grant select, insert, update, delete on schools, users, memberships to app_user, nca_super;
grant select, insert on audit_log to app_user, nca_super;
grant usage on sequence audit_log_audit_id_seq to app_user, nca_super;
-- Supabase's defaults: anon and authenticated get every new public table.
alter default privileges in schema public grant all on tables to anon, authenticated, app_user, nca_super;

alter table schools enable row level security;
alter table users enable row level security;
alter table memberships enable row level security;
alter table audit_log enable row level security;
create policy schools_tenant_isolation on schools using (school_id = (current_setting('app.current_tenant_id', true))::uuid or current_setting('app.current_role', true) = 'super_admin');
create policy users_tenant_isolation on users using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy memberships_tenant_isolation on memberships using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy audit_insert_only on audit_log for insert with check (true);
create policy audit_read_own_school on audit_log for select using (school_id = (current_setting('app.current_tenant_id', true))::uuid or current_setting('app.current_role', true) = 'super_admin');

-- P1-b (C112): the students / classes / guardians / teachers slice that
-- Student 360 search and the teacher own-classes rule build on, with the
-- live policies (read from the test database on 2026-09-30).
create type student_status as enum ('pending_consent', 'active', 'inactive', 'transferred');

create table classes (
  class_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  name text not null,
  grade text,
  section text,
  class_teacher_id uuid,
  session_id uuid,
  created_at timestamptz not null default now(),
  unique (school_id, class_id)
);
create table students (
  student_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  admission_no text,
  name text not null,
  class_id uuid,
  roll_no text,
  dob date,
  status student_status not null default 'pending_consent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, student_id),
  foreign key (school_id, class_id) references classes (school_id, class_id)
);
create table parents (
  parent_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  name text not null,
  phone text not null,
  email text,
  relation text,
  created_at timestamptz not null default now(),
  unique (school_id, parent_id)
);
create table parent_student_map (
  school_id uuid not null references schools(school_id),
  parent_id uuid not null,
  student_id uuid not null,
  primary key (school_id, parent_id, student_id)
);
create table teachers (
  teacher_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  user_id uuid not null,
  name text not null,
  unique (school_id, teacher_id)
);
create table teacher_subjects (
  school_id uuid not null,
  teacher_id uuid not null,
  subject_id uuid not null,
  class_id uuid not null
);

grant select, insert, update, delete on classes, students, parents, parent_student_map, teachers, teacher_subjects to app_user, nca_super;
alter table classes enable row level security;
alter table students enable row level security;
alter table parents enable row level security;
alter table parent_student_map enable row level security;
alter table teachers enable row level security;
alter table teacher_subjects enable row level security;
create policy classes_tenant_isolation on classes using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy students_tenant_isolation on students using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy parents_tenant_isolation on parents using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy parent_student_map_tenant_isolation on parent_student_map using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy teachers_tenant_isolation on teachers using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy teacher_subjects_tenant_isolation on teacher_subjects using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy consent_gate_students on students as restrictive for select
  using (status <> 'pending_consent' or current_setting('app.current_role', true) = any (array['teacher', 'principal', 'school_admin', 'super_admin']));
