-- =====================================================================
-- NetCyberAI — Core Schema (Postgres / Supabase)
-- Decision: Postgres canonical + RLS (locked — see chat decision log).
-- Every operational table carries school_id. No table is exempt.
-- =====================================================================

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type tenant_type as enum ('school', 'coaching', 'college');
create type board_type as enum ('CBSE', 'ICSE', 'STATE', 'IB', 'OTHER');
create type user_role as enum (
  'super_admin', 'school_admin', 'principal', 'teacher', 'accountant', 'parent', 'student'
);
create type fee_status as enum ('pending', 'paid', 'overdue', 'waived');
create type comm_channel as enum ('whatsapp', 'sms', 'email');
create type comm_status as enum (
  'queued', 'sent', 'delivered', 'read', 'failed', 'blocked_pilot',
  'blocked_consent', 'blocked_budget', 'blocked_quiet_hours', 'blocked_no_template'
);
create type recognition_type as enum ('personal_best', 'class_shine', 'consistency_badge', 'most_improved');
create type tc_state as enum ('applied', 'finance_clearance', 'remarks', 'principal_signed', 'delivered');
create type consent_purpose as enum ('core_records', 'daily_pulse', 'recognition', 'weekly_brief');
create type consent_method as enum ('dob_on_record', 'school_attested', 'digilocker_token', 'otp_plus_attestation');
create type student_status as enum ('pending_consent', 'active', 'inactive', 'transferred');

-- ---------------------------------------------------------------------
-- Tenancy root
-- ---------------------------------------------------------------------
create table schools (
  school_id           uuid primary key default gen_random_uuid(),
  name                text not null,
  address             text,
  board               board_type not null default 'STATE',
  tenant_type         tenant_type not null default 'school',
  is_pilot            boolean not null default true,
  pilot_allow_outbound boolean not null default false,
  plan                text not null default 'starter',       -- starter | growth | campus | full_os
  subscription_status text not null default 'trial',
  monthly_budget_paise bigint not null default 0,             -- cost governor cap
  recognition_class_ranking_enabled boolean not null default false,  -- opt-in, Constitution §15
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table users (
  user_id      uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(school_id),
  email        text,
  phone        text,
  password_hash text,
  role         user_role not null,
  display_name text not null,
  is_active    boolean not null default true,
  token_version int not null default 0,      -- bump to invalidate all issued JWTs on demand
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_users_school on users(school_id);
create unique index idx_users_school_email on users(school_id, email) where email is not null;

-- ---------------------------------------------------------------------
-- Academic structure
-- ---------------------------------------------------------------------
create table classes (
  class_id        uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(school_id),
  name            text not null,              -- e.g. '8-A'
  class_teacher_id uuid references users(user_id),
  created_at      timestamptz not null default now()
);
create index idx_classes_school on classes(school_id);

create table subjects (
  subject_id  uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(school_id),
  name        text not null
);
create index idx_subjects_school on subjects(school_id);

create table students (
  student_id    uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(school_id),
  admission_no  text,
  name          text not null,
  class_id      uuid references classes(class_id),
  roll_no       text,
  dob           date,
  status        student_status not null default 'pending_consent',  -- DPDP quarantine default
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_students_school on students(school_id);
create index idx_students_school_class on students(school_id, class_id);
create index idx_students_status on students(school_id, status);

create table parents (
  parent_id  uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(school_id),
  name       text not null,
  phone      text not null,          -- WhatsApp number
  email      text,
  relation   text,
  created_at timestamptz not null default now()
);
create index idx_parents_school on parents(school_id);

create table parent_student_map (
  school_id  uuid not null references schools(school_id),
  parent_id  uuid not null references parents(parent_id),
  student_id uuid not null references students(student_id),
  primary key (parent_id, student_id)
);
create index idx_psm_school on parent_student_map(school_id);
create index idx_psm_student on parent_student_map(school_id, student_id);

create table teachers (
  teacher_id uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(school_id),
  user_id    uuid not null references users(user_id),
  name       text not null,
  joining_date date,
  created_at timestamptz not null default now()
);
create index idx_teachers_school on teachers(school_id);

create table teacher_subjects (
  school_id  uuid not null references schools(school_id),
  teacher_id uuid not null references teachers(teacher_id),
  subject_id uuid not null references subjects(subject_id),
  class_id   uuid not null references classes(class_id),
  primary key (teacher_id, subject_id, class_id)
);

-- ---------------------------------------------------------------------
-- DPDP consent ledger — append-only, purpose-scoped
-- ---------------------------------------------------------------------
create table consent_ledger (
  consent_id        uuid primary key default gen_random_uuid(),
  school_id         uuid not null references schools(school_id),
  student_id        uuid not null references students(student_id),
  purpose           consent_purpose not null,
  granted           boolean not null,
  verification_method consent_method not null,
  evidence_ref      text,               -- pointer to stored evidence, not the evidence itself
  actor_user_id     uuid references users(user_id),
  notice_version    text not null,
  created_at        timestamptz not null default now()
);
create index idx_consent_school_student on consent_ledger(school_id, student_id, purpose);

-- ---------------------------------------------------------------------
-- Attendance, syllabus, exams
-- ---------------------------------------------------------------------
create table attendance (
  attendance_id uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(school_id),
  student_id    uuid not null references students(student_id),
  class_id      uuid not null references classes(class_id),
  date          date not null,
  status        text not null check (status in ('present','absent','late')),
  marked_by     uuid references users(user_id),
  created_at    timestamptz not null default now()
);
create unique index idx_attendance_unique on attendance(school_id, student_id, date);
create index idx_attendance_school_date on attendance(school_id, date);

create table syllabus_progress (
  progress_id uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(school_id),
  teacher_id  uuid not null references teachers(teacher_id),
  class_id    uuid not null references classes(class_id),
  subject_id  uuid not null references subjects(subject_id),
  topic       text not null,
  status      text not null default 'completed' check (status in ('completed','delayed','partial')),
  date        date not null default current_date,
  created_at  timestamptz not null default now()
);
create index idx_syllabus_school on syllabus_progress(school_id, class_id, date);

create table exams (
  exam_id   uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  name      text not null,
  date      date
);

create table marks (
  mark_id    uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(school_id),
  exam_id    uuid not null references exams(exam_id),
  student_id uuid not null references students(student_id),
  subject_id uuid not null references subjects(subject_id),
  score      numeric not null,
  max_score  numeric not null,
  created_at timestamptz not null default now()
);
create index idx_marks_school_student on marks(school_id, student_id);

-- ---------------------------------------------------------------------
-- Fees
-- ---------------------------------------------------------------------
create table fees_ledger (
  fee_id           uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools(school_id),
  student_id       uuid not null references students(student_id),
  amount_paise     bigint not null,
  due_date         date not null,
  status           fee_status not null default 'pending',
  razorpay_order_id   text,
  razorpay_payment_id text,
  receipt_url      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_fees_school_status on fees_ledger(school_id, status, due_date);
create index idx_fees_school_student on fees_ledger(school_id, student_id);

-- ---------------------------------------------------------------------
-- Communication (append-only audit trail — every outbound attempt)
-- ---------------------------------------------------------------------
create table communication_log (
  log_id            uuid primary key default gen_random_uuid(),
  school_id         uuid not null references schools(school_id),
  to_phone          text,
  channel           comm_channel not null,
  template_name     text,
  billing_category  text,             -- marketing | utility | authentication | service
  inside_service_window boolean,
  billable          boolean,
  est_cost_paise    bigint default 0,
  gst_paise         bigint default 0,
  status            comm_status not null default 'queued',
  provider_message_id text,
  read_at           timestamptz,
  created_at        timestamptz not null default now()
);
create index idx_commlog_school_time on communication_log(school_id, created_at desc);
create index idx_commlog_status on communication_log(school_id, status);

-- ---------------------------------------------------------------------
-- Recognition (anxiety-safe engine — see netcyberai_recognition.ts for the formula)
-- ---------------------------------------------------------------------
create table recognition_events (
  event_id     uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(school_id),
  student_id   uuid not null references students(student_id),
  fortnight_id text not null,          -- e.g. '2026-W37-38'
  type         recognition_type not null,
  title        text not null,
  description  text,
  score        numeric,                -- logit-delta or improvement magnitude, for audit
  is_notified  boolean not null default false,
  created_at   timestamptz not null default now()
);
create index idx_recognition_school_fortnight on recognition_events(school_id, fortnight_id);

create table teacher_impact_metrics (
  metric_id    uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(school_id),
  teacher_id   uuid not null references teachers(teacher_id),
  month        date not null,          -- first-of-month marker
  class_avg_attendance numeric,
  syllabus_completion_pct numeric,
  parent_feedback_score numeric,
  at_risk_improved_count int default 0,
  created_at   timestamptz not null default now()
);
create index idx_impact_school_teacher on teacher_impact_metrics(school_id, teacher_id, month);

create table parent_feedback (
  feedback_id uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(school_id),
  parent_id   uuid not null references parents(parent_id),
  teacher_id  uuid not null references teachers(teacher_id),
  rating      int not null check (rating between 1 and 5),
  comment     text,
  month       text not null,   -- 'YYYY-MM', used for the 1/month rate limit
  created_at  timestamptz not null default now()
);
create unique index idx_feedback_rate_limit on parent_feedback(school_id, parent_id, teacher_id, month);

-- ---------------------------------------------------------------------
-- Certificates (TC / Character / Bonafide)
-- ---------------------------------------------------------------------
create table certificate_requests (
  cert_id     uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(school_id),
  student_id  uuid not null references students(student_id),
  cert_type   text not null default 'TC',
  state       tc_state not null default 'applied',
  remarks     text,
  pdf_url     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_cert_school_state on certificate_requests(school_id, state);

-- ---------------------------------------------------------------------
-- Audit log (append-only, hash-chained — see rls policies file for grants)
-- ---------------------------------------------------------------------
create table audit_log (
  audit_id      bigserial primary key,
  occurred_at   timestamptz not null default now(),
  school_id     uuid references schools(school_id),   -- null = platform-level event
  actor_user_id uuid references users(user_id),
  actor_role    user_role,
  event_action  text not null,          -- e.g. 'student.create', 'fee.update'
  target_type   text,
  target_id     text,
  before_state  jsonb,
  after_state   jsonb,
  prev_hash     text,
  row_hash      text,
  created_at    timestamptz not null default now()
);
create index idx_audit_school_time on audit_log(school_id, occurred_at desc);

-- ---------------------------------------------------------------------
-- System config (pilot / feature flags, per school)
-- ---------------------------------------------------------------------
create table system_config (
  school_id   uuid primary key references schools(school_id),
  enabled_features jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
