-- =====================================================================
-- Migration 5 (Prompt A) — Configurable parameters per Amendment 1
-- (01_CONSTITUTION.md §6 mitigation table). No verbatim SQL is given
-- for this migration anywhere in 08_EXECUTION_BIBLE.md, unlike
-- migrations 6-8 -- this shape is derived from the mitigation table's
-- three named parameters plus src/lib/recognition.ts's documented
-- defaults (Decision Log C21).
--
-- Design choice: extend the existing per-school `system_config`
-- singleton (db/schema.sql, one row per school, already the home for
-- "pilot / feature flags, per school") rather than create a second
-- per-school settings table. Message rates are a separate table
-- because they are a rate TABLE (Bible's own word) with a verification
-- date per rate, not a handful of scalar columns.
-- =====================================================================

-- Pulse comprehension response-rate target: null until 30 days of real
-- data exist (Amendment 3 changed the metric from open rate; no old
-- figure carries over — this is the [GAP] itself, made queryable
-- instead of buried in a doc).
alter table system_config
  add column pulse_response_rate_target numeric,
  add column pulse_response_rate_target_source text,
  add column pulse_response_rate_target_set_at timestamptz;

-- Recognition thresholds: documented defaults from src/lib/recognition.ts
-- (PERSONAL_BEST_THRESHOLD, MIN_ASSESSMENTS, MIN_ATTENDANCE, 4 baseline
-- bands), wired here as per-school config with those exact values as
-- column defaults so an unconfigured school behaves identically to the
-- file's current hardcoded behavior until a school customizes it.
alter table system_config
  add column recognition_personal_best_threshold numeric not null default 0.05,
  add column recognition_min_assessments int not null default 2,
  add column recognition_min_attendance numeric not null default 0.6,
  add column recognition_band_count int not null default 4;

alter table system_config
  add constraint system_config_recognition_threshold_range
    check (recognition_personal_best_threshold > 0 and recognition_personal_best_threshold < 1),
  add constraint system_config_recognition_min_assessments_positive
    check (recognition_min_assessments >= 1),
  add constraint system_config_recognition_min_attendance_range
    check (recognition_min_attendance >= 0 and recognition_min_attendance <= 1),
  add constraint system_config_recognition_band_count_positive
    check (recognition_band_count >= 1);

-- Message rate table: NOT school-scoped. WhatsApp/SMS/email per-message
-- pricing is set by the provider/market (Meta's India card, referenced
-- in 05_BUSINESS_LOGIC.md §5), not negotiated per school, so it is
-- platform reference data the same way audit_log.school_id is nullable
-- for a platform-level event -- not an exception to "every operational
-- table carries school_id," because this table records no school's
-- transaction, it records what a message of a given shape costs right
-- now. The cost governor reads the latest effective row; it never
-- hardcodes a rate.
create table message_rate_table (
  rate_id          uuid primary key default gen_random_uuid(),
  channel          comm_channel not null,
  billing_category text not null check (billing_category in ('marketing','utility','authentication','service')),
  rate_paise       bigint not null check (rate_paise >= 0),
  gst_percent      numeric not null default 18,
  currency         text not null default 'INR',
  verified_source  text not null,
  verified_at      timestamptz not null,
  effective_from   date not null default current_date,
  created_at       timestamptz not null default now()
);
create index idx_rate_table_lookup on message_rate_table(channel, billing_category, effective_from desc);
