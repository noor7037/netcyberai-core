-- =====================================================================
-- Migration 3 (Prompt A) — compliance_config, at_risk_flags, pulse tables
-- Source: docs/05_BUSINESS_LOGIC.md §3 (Form 6 advisory config), §4
-- (at-risk detection), §5 (WhatsApp accountability loop); PRD §3.3.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §3 — Form 6 advisory: CPI and filing deadline are configuration,
-- never hardcoded constants. Null until an admin supplies each value
-- with its own source and recorded-at timestamp.
-- ---------------------------------------------------------------------
create table compliance_config (
  config_id           uuid primary key default gen_random_uuid(),
  school_id           uuid not null references schools(school_id),
  state               text not null default 'HR',
  cpi_percent         numeric,                    -- null until an admin supplies it
  cpi_source          text,                        -- where it came from
  cpi_recorded_at     timestamptz,
  filing_deadline     date,                        -- null until an admin supplies it; the
                                                     -- standing rule is 1 Feb, but Haryana has
                                                     -- extended this in practice in past years —
                                                     -- never hardcode a date in application code
  filing_deadline_source text,                      -- where the current-year date came from
  filing_deadline_recorded_at timestamptz,
  advisory_muted      boolean not null default false,
  muted_by            uuid references users(user_id),
  muted_at            timestamptz,
  updated_at          timestamptz not null default now()
);
create unique index idx_compliance_config_school on compliance_config(school_id);

-- ---------------------------------------------------------------------
-- §4 — At-risk detection. Staff-facing detection is unconditional;
-- parent-facing dispatch requires this flag AND the student's `at_risk`
-- consent purpose (Prompt G) — both, per the DPDP sequencing rule.
-- ---------------------------------------------------------------------
alter table schools
  add column at_risk_parent_dispatch_enabled boolean not null default false;

create table at_risk_flags (
  flag_id      uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(school_id),
  student_id   uuid not null references students(student_id),
  reason       text not null check (reason in ('attendance','marks','both')),
  detected_at  timestamptz not null default now(),
  resolved_at  timestamptz,
  notified_staff boolean not null default false,
  notified_parent boolean not null default false
);
create index idx_at_risk_school_student on at_risk_flags(school_id, student_id, detected_at desc);

-- ---------------------------------------------------------------------
-- §5 — Daily Learning Pulse. exception_state mirrors syllabus_progress's
-- four states (migration 6 adds 'not_taught' to that check constraint);
-- a 'not_taught' pulse_messages row is never created by application
-- code in the first place — no comprehension prompt is sent for a
-- lesson that didn't happen — but the column allows the value so a
-- state that WAS recorded can't silently violate its own check.
-- ---------------------------------------------------------------------
create table pulse_messages (
  pulse_id     uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(school_id),
  class_id     uuid not null references classes(class_id),
  subject_id   uuid references subjects(subject_id),
  topic        text not null,
  exception_state text check (exception_state in ('taught','delayed','partial','not_taught')),
  body_hinglish text not null,
  sent_on      date not null default current_date,
  created_at   timestamptz not null default now()
);
create index idx_pulse_school_date on pulse_messages(school_id, sent_on desc);

create table pulse_response_log (
  response_id  uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(school_id),
  pulse_id     uuid not null references pulse_messages(pulse_id),
  student_id   uuid not null references students(student_id),
  parent_id    uuid not null references parents(parent_id),
  tier         int check (tier in (1,2,3)),
  responded_at timestamptz not null default now(),
  provider_message_id text
);
create index idx_pulse_resp_school_pulse on pulse_response_log(school_id, pulse_id);
create index idx_pulse_resp_student on pulse_response_log(school_id, student_id, responded_at desc);
