-- =====================================================================
-- Migration (Prompt E) -- onboarding stage tracking, the consent
-- purpose restructuring Decision Log C20 already decided but never
-- applied to the schema, and impersonation sessions.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. consent_purpose: Decision Log C20 / 04_SYSTEM_DESIGN_PRD.md §3.5
-- restructured this set months before this migration (core_records and
-- operational_communication required-for-service, daily_pulse/
-- recognition/weekly_brief opt-in, at_risk opt-in-plus-flag) but the
-- enum itself was never actually extended -- `operational_communication`
-- and `at_risk` were undeliverable values, not just undocumented ones.
-- Found while building this prompt's consent-completion meter, which
-- needs a correct "required" set to compute against.
-- =====================================================================
alter type consent_purpose add value 'operational_communication';
alter type consent_purpose add value 'at_risk';

-- ---------------------------------------------------------------------
-- 2. Onboarding stage. PRD §7.2's workflow starts at Lead/Approved,
-- which are pre-tenant (no school_id exists yet to attach a stage to)
-- -- out of a database column's reach by definition. Tracked from
-- Tenant Created (a schools row existing IS this stage) onward.
-- =====================================================================
create type onboarding_stage as enum (
  'tenant_created',
  'admin_invited',
  'data_imported',
  'data_validated',
  'consent_collection',
  'configuration',
  'training',
  'pilot_outbound_approved',
  'go_live'
);

alter table schools
  add column onboarding_stage onboarding_stage not null default 'tenant_created',
  add column onboarding_stage_updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------
-- 3. Impersonation sessions. PRD §2.3: time-boxed, reason recorded
-- before access is granted, logged, visible to the impersonated
-- school. The audit_log rows (ImpersonationStarted/ImpersonationEnded)
-- are what the impersonated school actually sees (already covered by
-- rls_policies.sql's audit_read_own_school); this table is the
-- enforcement mechanism -- expiry and active/inactive state -- that a
-- log entry alone can't provide.
-- =====================================================================
create table impersonation_sessions (
  impersonation_id uuid primary key default gen_random_uuid(),
  actor_user_id    uuid not null references users(user_id),
  target_user_id   uuid not null references users(user_id),
  target_school_id uuid not null references schools(school_id),
  reason           text not null,
  started_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  ended_at         timestamptz
);
create index idx_impersonation_actor on impersonation_sessions(actor_user_id);
create index idx_impersonation_active on impersonation_sessions(target_school_id, ended_at) where ended_at is null;

alter table impersonation_sessions enable row level security;
alter table impersonation_sessions force row level security;

-- Same shape as schools_tenant_isolation: the target school's own tenant
-- context can see impersonation sessions run against it (part of what
-- "visible to the impersonated school" means -- not just the resulting
-- audit rows, the session record itself); super_admin (nca_super)
-- bypasses RLS entirely for the actual start/end/expiry-check writes.
create policy impersonation_visible_to_target_school on impersonation_sessions
  for select using (
    target_school_id = current_setting('app.current_tenant_id', true)::uuid
  );
