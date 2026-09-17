-- =====================================================================
-- Migration 8 (Prompt A) — budget default, webhook_events, quiet hours
-- (Decision Log C15, C16.1, C16.2, C16.3)
-- Source: 08_EXECUTION_BIBLE.md Prompt A step 8, SQL given verbatim,
-- except quiet_hours defaults which the Bible asks to be chosen here
-- ("Set a sensible evening-to-morning default; leave configurable per
-- school"): 21:00-07:00, a conventional do-not-disturb window that
-- errs toward not waking a household, adjustable per school.
-- =====================================================================

-- C15: 0 currently means "every non-transactional message blocked."
-- Silent and confusing. NULL = not configured is explicit; the
-- onboarding wizard (Prompt E) requires a real budget before
-- pilot_allow_outbound can be set true, so nothing sends during
-- pilot anyway and nothing is blocked that would have sent.
alter table schools alter column monthly_budget_paise drop not null;
alter table schools alter column monthly_budget_paise drop default;

-- C16.1: the cost governor's own spec (PRD Sec5.2) logs this status
-- on transactional sends past budget; the enum doesn't have it.
alter type comm_status add value 'budget_exceeded_transactional';

-- C16.2: webhook idempotency (PRD Sec3.3, Prompt I) needs somewhere
-- to record payload_hash. school_id is nullable because a webhook
-- can arrive before tenant resolution.
create table webhook_events (
  event_id     uuid primary key default gen_random_uuid(),
  school_id    uuid references schools(school_id),
  provider     text not null check (provider in ('razorpay','whatsapp','n8n')),
  payload_hash text not null unique,
  payload      jsonb not null,
  processed_at timestamptz,
  created_at   timestamptz not null default now()
);

-- C16.3: blocked_quiet_hours is a specified comm_status, but no
-- config for quiet hours exists anywhere.
alter table schools add column quiet_hours_start time not null default '21:00';
alter table schools add column quiet_hours_end time not null default '07:00';
