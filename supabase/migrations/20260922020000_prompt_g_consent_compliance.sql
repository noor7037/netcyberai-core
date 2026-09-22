-- Prompt G: Consent & Compliance.
--
-- Stage 0 found the guardian-verification state machine described in
-- 04_SYSTEM_DESIGN_PRD.md Sec3.5 ("Not Required -> Pending -> Requested
-- -> Verified Guardian -> Active -> Withdrawn -> Expired / Tombstoned")
-- does not exist anywhere in the live schema: parent_student_map is a
-- bare (school_id, parent_id, student_id) junction table with no status
-- column at all, and no enum or table anywhere else models it. This
-- migration builds it, plus the retention-configuration table (Task 4,
-- confirmed absent in Stage 0) and the data-subject-request tracking
-- table (Task 3).

-- ---------------------------------------------------------------------
-- 1. Guardian verification state, on parent_student_map.
--
-- Deliberately per (parent_id, student_id) pair, not per purpose: this
-- tracks whether THIS guardian's identity has been checked for THIS
-- student, independent of which consent purposes are later granted or
-- withdrawn against that student (consent_ledger's own job, append-
-- only, untouched by this table). "Verified" and "Active" are recorded
-- as two distinct values in the enum per the PRD's own listing, but
-- this build treats the transition from Verified to Active as
-- immediate/automatic once a verification method succeeds -- nothing
-- in this prompt's spec defines a separate gate between them, and
-- inventing one here would be exactly the kind of parallel state
-- machine Task 2 explicitly warns against. Both values are still
-- distinctly observable (verified_at is set either way).
-- ---------------------------------------------------------------------
create type guardian_verification_status as enum (
  'not_required', 'pending', 'requested', 'verified', 'active', 'withdrawn', 'expired', 'tombstoned'
);

alter table parent_student_map
  add column verification_status guardian_verification_status not null default 'not_required',
  add column verification_method consent_method,
  add column verification_evidence_ref text,
  -- otp_plus_attestation only: a system-generated code, hashed at rest
  -- (staff reads/displays the raw code once at generation time; only
  -- the hash is ever stored) -- see Task 1's own note on why this is a
  -- staff-mediated interim method, not a real OTP delivery channel.
  add column verification_code_hash text,
  add column verification_code_expires_at timestamptz,
  add column verification_attempts int not null default 0,
  add column requested_at timestamptz,
  add column verified_at timestamptz,
  add column verified_by uuid,
  add column updated_at timestamptz not null default now();

alter table parent_student_map
  add constraint parent_student_map_school_verified_by_fkey
  foreign key (school_id, verified_by) references users(school_id, user_id);

-- ---------------------------------------------------------------------
-- 2. Retention configuration (Task 4). Stage 0 confirmed nothing
-- systematic exists -- only captured_documents.retention_until, one
-- column on one table. Modeled per-category, per-school (not one
-- global duration): financial records, academic records, attendance,
-- communication logs, the audit trail, captured documents, pulse
-- message logs, and consent records all have genuinely different
-- real-world retention needs (Constitution/PRD: financial records are
-- never deleted; a Pulse message log has no comparable reason to
-- persist indefinitely once Prompt H builds it).
--
-- This table is CONFIGURATION only -- no automatic purge job is built
-- here. Nothing calls it yet, same as the consent gate function this
-- prompt also builds; enforcement is a future prompt's job once there
-- is a real scheduling mechanism to hang it on.
-- ---------------------------------------------------------------------
create type retention_category as enum (
  'financial', 'academic_record', 'attendance', 'communication_log',
  'audit_trail', 'capture_document', 'pulse_message', 'consent_record'
);

create table retention_policy (
  policy_id       uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(school_id),
  category        retention_category not null,
  -- null = retained indefinitely, no automatic purge ever intended
  -- (financial records per Constitution/PRD; audit_trail and
  -- consent_record because they are themselves the compliance
  -- evidence a purge would destroy).
  retention_years numeric,
  notes           text,
  updated_by      uuid,
  updated_at      timestamptz not null default now()
);
create unique index idx_retention_policy_school_category on retention_policy(school_id, category);

alter table retention_policy
  add constraint retention_policy_school_updated_by_fkey
  foreign key (school_id, updated_by) references users(school_id, user_id);

-- Sensible per-category defaults, seeded for every school that exists
-- today. A school's own compliance staff can override any row later
-- (Task 4 built the configuration surface, not a fixed policy).
insert into retention_policy (school_id, category, retention_years, notes)
select s.school_id, c.category, c.retention_years, c.notes
from schools s
cross join (values
  ('financial'::retention_category, null::numeric, 'Never purged automatically -- Constitution/PRD: financial records are retained indefinitely.'),
  ('academic_record', 7, 'Marks, syllabus progress, exam records.'),
  ('attendance', 3, 'Daily attendance rows.'),
  ('communication_log', 2, 'WhatsApp/SMS delivery logs once Prompt H/L exist.'),
  ('audit_trail', null, 'Never purged automatically -- the audit trail is itself compliance evidence.'),
  ('capture_document', 5, 'Uploaded documents (birth certificates, TCs, etc); Aadhaar images are never stored regardless of this policy.'),
  ('pulse_message', 1, 'Pulse/comprehension message logs once Prompt H exists.'),
  ('consent_record', null, 'Never purged automatically -- consent_ledger is the append-only proof of what consent existed and when.')
) as c(category, retention_years, notes);

alter table retention_policy enable row level security;
alter table retention_policy force row level security;
create policy retention_policy_tenant_isolation on retention_policy
  using (school_id = current_setting('app.current_tenant_id', true)::uuid);

-- ---------------------------------------------------------------------
-- 3. Data subject requests (Task 3). Staff-initiated, per Decision Log
-- C13 -- no parent portal exists, so there is no self-service request
-- form to build. requested_by_description is free text, not a FK: the
-- person asking (a parent, a guardian, sometimes a student themselves)
-- may not have any user/parent row a request could reference, and
-- forcing one would misrepresent who actually asked.
--
-- Deletion is gated behind an explicit, separately-confirmed
-- authorization step (authorized_by/authorized_at) distinct from
-- logging the request (logged_by) and from actually executing it
-- (executed_at) -- nothing pseudonymizes a real record just because a
-- request was logged. Whether DPDP erasure should actually override
-- financial retention is a real legal question this build does not
-- resolve (see pseudonymize_student() below); this table's job is
-- tracking the request and gating execution, not deciding the policy.
-- ---------------------------------------------------------------------
create type dsr_request_type as enum ('access', 'correction', 'deletion');
create type dsr_request_status as enum ('logged', 'in_progress', 'completed', 'rejected');

create table data_subject_requests (
  request_id              uuid primary key default gen_random_uuid(),
  school_id               uuid not null references schools(school_id),
  student_id              uuid not null references students(student_id),
  request_type            dsr_request_type not null,
  requested_by_description text not null,
  logged_by               uuid not null,
  status                  dsr_request_status not null default 'logged',
  notes                   text,
  authorized_by           uuid,
  authorized_at           timestamptz,
  executed_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index idx_dsr_school_student on data_subject_requests(school_id, student_id);

alter table data_subject_requests
  add constraint data_subject_requests_school_logged_by_fkey
  foreign key (school_id, logged_by) references users(school_id, user_id);
alter table data_subject_requests
  add constraint data_subject_requests_school_authorized_by_fkey
  foreign key (school_id, authorized_by) references users(school_id, user_id);

alter table data_subject_requests enable row level security;
alter table data_subject_requests force row level security;
create policy data_subject_requests_tenant_isolation on data_subject_requests
  using (school_id = current_setting('app.current_tenant_id', true)::uuid);
