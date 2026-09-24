-- =====================================================================
-- Academic session/term modeling + class/section normalization.
-- Founder-approved 2026-09-24 (Decision Log C67/C68): found by directly
-- comparing NetCyberAI's live schema against reference school-ERP
-- schemas (docs/DOMAIN_MODEL_COMPARISON.md) -- academic_year previously
-- existed only as a text column on fee_structures, nowhere else, and
-- classes.name conflated class+section into one free-text field
-- ('8-A'). Additive only: no existing column is dropped or renamed;
-- `classes.name` and `fee_structures.academic_year` are both left as-is
-- for backward compatibility with existing code paths.
--
-- Zero rows exist in `classes`/`exams`/`students` in the live dev
-- database at the time of this migration (confirmed via
-- mcp__Supabase__list_tables before writing this), so no backfill of
-- existing rows is needed -- this is a pure additive schema change, not
-- a data migration.
-- =====================================================================

create table academic_sessions (
  session_id  uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(school_id),
  label       text not null,              -- '2026-27'
  start_date  date not null,
  end_date    date not null,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  check (end_date > start_date)
);
create index idx_academic_sessions_school on academic_sessions(school_id);
create unique index idx_academic_sessions_school_label on academic_sessions(school_id, label);

-- At most one "current" session per school -- enforced at the database
-- level, not left to application discipline, matching this project's
-- existing standard for invariants that matter (e.g. append-only grants).
create unique index idx_academic_sessions_one_current
  on academic_sessions(school_id) where is_current;

alter table classes add column session_id uuid references academic_sessions(session_id);
alter table classes add column grade text;
alter table classes add column section text;

alter table exams add column session_id uuid references academic_sessions(session_id);

-- ---------------------------------------------------------------------
-- RLS: same tenant-isolation-only pattern already used for classes/
-- subjects (db/rls_policies.sql) -- academic_sessions carries no money
-- or PII, so it gets the plain pattern, not an accounting-style
-- RESTRICTIVE overlay (matching the classes/subjects precedent, not the
-- fee-table precedent).
-- ---------------------------------------------------------------------
alter table academic_sessions enable row level security;
alter table academic_sessions force row level security;

create policy academic_sessions_tenant_isolation on academic_sessions
  using (school_id = current_setting('app.current_tenant_id', true)::uuid);
