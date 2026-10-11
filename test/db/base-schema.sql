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
  is_test_fixture boolean not null default false,
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
  verification_status text not null default 'not_required',
  verification_method text,
  updated_at timestamptz not null default now(),
  primary key (parent_id, student_id),
  foreign key (school_id, parent_id) references parents (school_id, parent_id)
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

-- PR-2c (C116): CSV import bookkeeping, for the import preview tests.
create table csv_imports (
  import_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  file_hash text not null,
  file_name text not null,
  imported_by uuid not null,
  row_count int not null,
  imported_count int not null,
  skipped_count int not null,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create unique index idx_csv_imports_school_hash on csv_imports(school_id, file_hash);
grant select, insert on csv_imports to app_user, nca_super;
alter table csv_imports enable row level security;
create policy csv_imports_tenant_isolation on csv_imports using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
-- The live parent scope on students (baseline RLS). It reads
-- parent_student_map, so a parent_student_map policy that reads students
-- would loop (C117); keeping it here makes the tests see that.
create policy parent_scope_students on students as restrictive for select
  using (current_setting('app.current_role', true) <> 'parent'
         or student_id in (select psm.student_id from parent_student_map psm
                           where psm.parent_id = (current_setting('app.current_user_id', true))::uuid));

-- The slices of fees and messages the Control dashboard totals read (C132).
create type fee_status as enum ('pending', 'paid', 'overdue', 'waived', 'partial');
create type comm_status as enum ('queued', 'sent', 'delivered', 'read', 'failed', 'blocked_pilot', 'blocked_consent', 'blocked_budget', 'blocked_quiet_hours', 'blocked_no_template', 'budget_exceeded_transactional');
create table fees_ledger (
  fee_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  student_id uuid not null,
  amount_minor bigint not null,
  due_date date not null default current_date,
  status fee_status not null default 'pending',
  created_at timestamptz not null default now()
);
create table communication_log (
  log_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  status comm_status not null default 'queued',
  created_at timestamptz not null default now()
);
alter table fees_ledger enable row level security;
alter table communication_log enable row level security;
create policy fees_ledger_tenant_isolation on fees_ledger using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy communication_log_tenant_isolation on communication_log using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select, insert, update, delete on fees_ledger, communication_log to app_user, nca_super;

-- Attendance, as My Day's cards read it (C136): the table, its tenant
-- isolation and the teacher rule exactly as the migrations define them
-- (20260917071920, 20260917073745, 20260917075715): a teacher reads and
-- writes attendance only for classes they teach a subject in.
create table attendance (
  attendance_id uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(school_id),
  student_id    uuid not null,
  class_id      uuid not null,
  date          date not null,
  status        text not null check (status in ('present','absent','late','leave')),
  leave_code    text,
  marked_by     uuid,
  created_at    timestamptz not null default now()
);
create unique index idx_attendance_unique on attendance(school_id, student_id, date);
create index idx_attendance_school_date on attendance(school_id, date);
alter table attendance enable row level security;
create policy attendance_tenant_isolation on attendance using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy teacher_scope_attendance on attendance as restrictive
  for all using (
    current_setting('app.current_role', true) <> 'teacher'
    or class_id in (
      select ts.class_id from teacher_subjects ts
      join teachers t on t.teacher_id = ts.teacher_id
      where t.user_id = current_setting('app.current_user_id', true)::uuid
    )
  );
grant select, insert, update, delete on attendance to app_user, nca_super;

-- P2 5b (C144): operations received from devices and measurement, as
-- 20261011164830_p2_attendance_phone.sql defines them.
create table client_operations (
  school_id uuid not null references schools(school_id),
  operation_id uuid not null,
  user_id uuid not null,
  kind text not null,
  for_date date not null,
  result jsonb,
  received_at timestamptz not null default now(),
  primary key (school_id, operation_id)
);
create table usage_events (
  event_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  kind text not null,
  class_id uuid,
  day date not null,
  value numeric not null check (value >= 0),
  created_at timestamptz not null default now()
);
alter table client_operations enable row level security;
alter table usage_events enable row level security;
create policy client_operations_tenant_isolation on client_operations using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy client_operations_own on client_operations as restrictive for all
  using (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  with check (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy usage_events_tenant_isolation on usage_events using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy usage_events_read_leadership on usage_events as restrictive for select
  using (current_setting('app.current_role', true) = any (array['principal', 'school_admin', 'super_admin']));
grant select, insert, update on client_operations to app_user, nca_super;
grant select, insert on usage_events to app_user, nca_super;

-- P2 5c (C145): the timetable as My Day's card reads it
-- (20261011170134_p2_timetable.sql), with the subjects it names.
create table subjects (
  subject_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  name text not null
);
create table timetable_entries (
  entry_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  class_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  period smallint not null check (period between 1 and 12),
  subject_id uuid not null,
  teacher_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint timetable_class_slot unique (school_id, class_id, weekday, period),
  constraint timetable_teacher_slot unique (school_id, teacher_user_id, weekday, period)
);
alter table subjects enable row level security;
alter table timetable_entries enable row level security;
create policy subjects_tenant_isolation on subjects using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy timetable_entries_tenant_isolation on timetable_entries using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select, insert, update, delete on subjects, timetable_entries to app_user, nca_super;

-- C146: late attendance submissions waiting for the office
-- (20261011175653_p2_office_corrections.sql).
create table attendance_correction_requests (
  request_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  class_id uuid not null,
  for_date date not null,
  requested_by uuid not null,
  entries jsonb not null,
  status text not null default 'waiting',
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now()
);
alter table attendance_correction_requests enable row level security;
create policy attendance_correction_requests_tenant_isolation on attendance_correction_requests using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select, insert, update on attendance_correction_requests to app_user, nca_super;

