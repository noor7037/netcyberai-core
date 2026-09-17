-- =====================================================================
-- Migration 7 (Prompt A) — multi-school membership (Decision Log C14)
-- Source: 08_EXECUTION_BIBLE.md Prompt A step 7. The Bible gives this
-- DDL as "the shape, not a drop-in" and explicitly asks for real RLS
-- policy and index changes against the actual schema. Written here.
-- =====================================================================

alter type user_role add value 'academic_coordinator';

create table memberships (
  membership_id uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(user_id),
  school_id     uuid not null references schools(school_id),
  role          user_role not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (user_id, school_id)
);
create index idx_memberships_user on memberships(user_id);
create index idx_memberships_school on memberships(school_id);
create index idx_memberships_school_active on memberships(school_id, is_active) where is_active;

alter table users alter column school_id drop not null;
-- users.school_id becomes the user's primary/home school for defaulting
-- only. RLS session context resolves from the ACTIVE MEMBERSHIP, not
-- from users.school_id -- called out explicitly for Prompt B2.

-- ---------------------------------------------------------------------
-- RLS. memberships cannot use the plain tenant-isolation pattern alone:
-- resolving "which schools can this user access" (the switch-active-
-- school flow, and the very first lookup after login) happens BEFORE
-- app.current_tenant_id is set to any particular school -- only
-- app.current_user_id is known at that point. A tenant-only policy
-- would make that lookup return zero rows: a chicken-and-egg lockout,
-- not a security feature. Two permissive policies (Postgres OR's
-- multiple permissive policies together), so either is sufficient:
--   1. a user can always see their own membership rows, by user_id,
--      independent of what (if any) tenant context is currently set;
--   2. once a tenant context IS set, staff of that school can see
--      every membership row scoped to it (onboarding/admin surfaces).
-- ---------------------------------------------------------------------
alter table memberships enable row level security;
alter table memberships force row level security;

create policy memberships_self on memberships
  for select using (
    user_id = current_setting('app.current_user_id', true)::uuid
  );

create policy memberships_tenant_isolation on memberships
  using (
    school_id = current_setting('app.current_tenant_id', true)::uuid
  );
