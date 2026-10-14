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
-- Payments, as the overdue rule reads them (C163): what is overdue is the unpaid balance.
create table payments (
  payment_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  fee_id uuid not null references fees_ledger(fee_id),
  amount_minor bigint not null
);
alter table payments enable row level security;
create policy payments_tenant_isolation on payments using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select, insert on payments to app_user, nca_super;
-- UPI payments reported by parents, as My Day counts them (C174).
create table payment_reports (
  report_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  status text not null default 'reported'
);
alter table payment_reports enable row level security;
create policy payment_reports_tenant_isolation on payment_reports using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select, insert, update on payment_reports to app_user, nca_super;
-- Parents' conversations, as My Day counts them (C187).
create table message_threads (
  thread_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  unread int not null default 0
);
alter table message_threads enable row level security;
create policy message_threads_tenant_isolation on message_threads using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select, insert, update on message_threads to app_user, nca_super;
-- Complaints, as My Day counts the overdue ones (C195).
create table complaints (
  complaint_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  status text not null default 'open',
  due_at timestamptz not null default now(),
  owner_id uuid,
  about_user_id uuid
);
alter table complaints enable row level security;
create policy complaints_tenant_isolation on complaints using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select, insert, update on complaints to app_user, nca_super;
-- Staff leave, as My Day counts the requests waiting for the office (C201).
create table staff_leave (
  leave_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  user_id uuid not null,
  status text not null default 'waiting'
);
alter table staff_leave enable row level security;
create policy staff_leave_tenant_isolation on staff_leave using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select, insert, update on staff_leave to app_user;
-- Proxy Auto, as My Day counts a teacher's covers and the periods still without one (C202): the days of a
-- leave, the school's holidays, the covers, and the one fact about leave the people who arrange cover are given
-- (the p5_substitutions migration).
alter table staff_leave add column from_date date, add column to_date date;
create table school_holidays (
  school_id uuid not null references schools(school_id),
  holiday_date date not null,
  name text not null,
  primary key (school_id, holiday_date)
);
alter table school_holidays enable row level security;
create policy school_holidays_tenant_isolation on school_holidays using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select on school_holidays to app_user, nca_super;
create table substitutions (
  substitution_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  on_date date not null,
  period smallint not null,
  class_id uuid not null,
  subject_id uuid not null,
  absent_user_id uuid not null,
  substitute_user_id uuid not null,
  status text not null default 'assigned',
  assigned_by uuid not null,
  assigned_at timestamptz not null default now()
);
-- Why a cover was undone: 'leave_cancelled' when its leave was withdrawn (C210), as My Day counts a teacher's
-- released covers (the c210_leave_rules migration).
alter table substitutions add column undone_reason text;
alter table substitutions enable row level security;
create policy substitutions_tenant_isolation on substitutions using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select, insert, update on substitutions to app_user;
create function public.teachers_away_on(p_date date) returns table (user_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct l.user_id
    from staff_leave l
    join users u on u.school_id = l.school_id and u.user_id = l.user_id and u.role::text = 'teacher'
   where l.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and (
       current_setting('app.current_role', true) in ('principal', 'school_admin')
       or (
         current_setting('app.current_role', true) = 'academic_coordinator'
         and p_date between (now() at time zone 'Asia/Kolkata')::date and (now() at time zone 'Asia/Kolkata')::date + 31
       )
     )
     and l.status = 'approved'
     and p_date between l.from_date and l.to_date
$$;
grant execute on function public.teachers_away_on(date) to app_user;
-- Promises to pay, as My Day counts them (C180).
create table fee_followups (
  followup_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  kind text not null,
  status text not null,
  promise_date date
);
alter table fee_followups enable row level security;
create policy fee_followups_tenant_isolation on fee_followups using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select, insert, update on fee_followups to app_user, nca_super;
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

-- C148: the needs-help queue, as My Day's card counts it.
create table pulse_followups (
  followup_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  student_id uuid not null,
  class_id uuid not null,
  kind text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);
alter table pulse_followups enable row level security;
create policy pulse_followups_tenant_isolation on pulse_followups using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select, insert, update on pulse_followups to app_user, nca_super;

-- C150: homework, as My Day's card counts it.
create table homework_targets (
  target_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  homework_id uuid not null,
  class_id uuid not null,
  title text not null,
  due_date date not null
);
create table homework_status (
  school_id uuid not null references schools(school_id),
  target_id uuid not null,
  class_id uuid not null,
  student_id uuid not null,
  done boolean not null,
  primary key (target_id, student_id)
);
alter table homework_targets enable row level security;
alter table homework_status enable row level security;
create policy homework_targets_tenant_isolation on homework_targets using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy homework_status_tenant_isolation on homework_status using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select, insert, update on homework_targets, homework_status to app_user, nca_super;


-- Early Warning, as My Day counts the open flags and those with nothing written yet (C209).
create table early_warning_flags (
  flag_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  student_id uuid not null,
  class_id uuid not null,
  resolved_at timestamptz
);
create table early_warning_actions (
  action_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  flag_id uuid not null
);
alter table early_warning_flags enable row level security;
alter table early_warning_actions enable row level security;
create policy early_warning_flags_tenant_isolation on early_warning_flags using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy early_warning_actions_tenant_isolation on early_warning_actions using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select, insert, update on early_warning_flags to app_user;
grant select, insert on early_warning_actions to app_user;

-- The School Health Auditor's check-ups, as My Day reads this week's (C210).
create table school_health_runs (
  run_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  run_date date not null,
  results jsonb not null,
  passed integer not null,
  applicable integer not null,
  unique (school_id, run_date)
);
alter table school_health_runs enable row level security;
create policy school_health_runs_tenant_isolation on school_health_runs using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select, insert, update on school_health_runs to app_user;

-- The grading scheme, as My Day asks whether a school has one yet (C213).
create table grading_schemes (
  scheme_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  version integer not null,
  scheme jsonb not null
);
alter table grading_schemes enable row level security;
create policy grading_schemes_tenant_isolation on grading_schemes using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select, insert on grading_schemes to app_user;


-- Exams, papers and marks, as My Day counts the papers waiting for a teacher's marks (C214), with the two
-- functions that count them: who may enter a paper's marks, and how far its entry has come.
create table exams (
  exam_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  name text not null,
  status text not null default 'open'
);
create table exam_papers (
  paper_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  exam_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  paper_date date,
  components jsonb not null
);
create table marks (
  mark_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  paper_id uuid not null,
  component text not null,
  student_id uuid not null
);
alter table exams enable row level security;
alter table exam_papers enable row level security;
alter table marks enable row level security;
create policy exams_tenant_isolation on exams using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy exam_papers_tenant_isolation on exam_papers using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy marks_tenant_isolation on marks using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select, insert, update, delete on exams, exam_papers, marks to app_user;
create function public.may_enter_marks(p_class_id uuid, p_subject_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when coalesce(current_setting('app.current_role', true), '') in ('principal', 'school_admin', 'academic_coordinator') then true
    when coalesce(current_setting('app.current_role', true), '') = 'teacher' then
      exists (select 1 from teacher_subjects ts join teachers t on t.school_id = ts.school_id and t.teacher_id = ts.teacher_id
               where ts.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid and ts.class_id = p_class_id and ts.subject_id = p_subject_id
                 and t.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
      or exists (select 1 from classes c where c.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid and c.class_id = p_class_id
                    and c.class_teacher_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
    else false
  end
$$;
create function public.exam_paper_progress(p_paper_id uuid) returns table (roll integer, entered integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select (select count(*)::integer from students s where s.school_id = p.school_id and s.class_id = p.class_id and s.status in ('active', 'pending_consent')),
         (select count(*)::integer from students s where s.school_id = p.school_id and s.class_id = p.class_id and s.status in ('active', 'pending_consent')
             and (select count(*) from marks m where m.school_id = p.school_id and m.paper_id = p.paper_id and m.student_id = s.student_id) >= jsonb_array_length(p.components))
    from exam_papers p where p.paper_id = p_paper_id and p.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
$$;
grant execute on function public.may_enter_marks(uuid, uuid), public.exam_paper_progress(uuid) to app_user;

-- A published exam's class (C215): its papers wait for nobody's marks, so My Day's count asks whether one is
-- published.
create table exam_publications (
  publication_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  exam_id uuid not null,
  class_id uuid not null,
  reopened_at timestamptz
);
alter table exam_publications enable row level security;
create policy exam_publications_tenant_isolation on exam_publications using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select on exam_publications to app_user;
create function public.exam_class_published(p_exam_id uuid, p_class_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from exam_publications x
                  where x.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
                    and x.exam_id = p_exam_id and x.class_id = p_class_id and x.reopened_at is null)
$$;
grant execute on function public.exam_class_published(uuid, uuid) to app_user;

-- Admission enquiries and their steps, as My Day counts the follow-ups due (C221): the office's enquiries, their
-- class and owner, and the steps that say when the family was last in contact.
create table admission_enquiries (
  enquiry_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  child_name text not null,
  guardian_name text not null,
  phone text not null,
  class_id uuid not null,
  source text not null default 'walk_in',
  stage text not null default 'enquiry',
  owner_id uuid not null,
  next_follow_up date,
  next_step text,
  closed_reason text,
  student_id uuid,
  created_at timestamptz not null default now()
);
alter table admission_enquiries enable row level security;
create policy admission_enquiries_tenant_isolation on admission_enquiries using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy admission_enquiries_office on admission_enquiries as restrictive for all using (current_setting('app.current_role', true) in ('principal', 'school_admin'));
grant select, insert, update on admission_enquiries to app_user;
create table admission_events (
  event_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  enquiry_id uuid not null,
  kind text not null,
  at timestamptz not null default now()
);
alter table admission_events enable row level security;
create policy admission_events_tenant_isolation on admission_events using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select, insert on admission_events to app_user;
-- The student data check (C222), as My Day counts the requests a guardian has answered and the office has not yet
-- corrected or closed.
create table data_check_requests (
  request_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  student_id uuid not null,
  outcome text,
  reply_at timestamptz,
  office_note_at timestamptz
);
alter table data_check_requests enable row level security;
create policy data_check_requests_tenant_isolation on data_check_requests using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
grant select on data_check_requests to app_user;
-- RTE claims (C223), as My Day counts those raised and still unpaid past the first age bucket
-- (the p7_rte_claims migration): the three finance roles only.
create table rte_claims (
  claim_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  state text not null default 'raised',
  amount_minor bigint not null,
  raised_on date not null
);
alter table rte_claims enable row level security;
create policy rte_claims_tenant_isolation on rte_claims using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy rte_claims_finance on rte_claims as restrictive for all using (current_setting('app.current_role', true) in ('principal', 'school_admin', 'accountant'));
grant select on rte_claims to app_user;
