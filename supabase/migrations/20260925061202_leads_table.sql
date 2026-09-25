-- =====================================================================
-- `leads` table -- the public Get Started / Book Demo intake record.
-- [GAP] flagged in docs/12_RECONSTRUCTION_INVESTIGATION.md section 2.2
-- (no `leads` table exists anywhere despite the master rebuild plan's
-- P1/P2 design assuming one) and again in the founder's own onboarding-
-- page copy ("Lead -> Approved -> Tenant Created -> ...", written before
-- a `leads` table backed any of it). Built now per the explicit
-- instruction that the public website's Get Started/Book Demo flows
-- must reach a real backend table, not a frontend-only submission.
--
-- This is the one genuinely pre-tenant table in the schema: a prospect
-- has no school_id yet, so none of the ordinary tenant-isolation
-- machinery (withTenantContext, app.current_tenant_id) applies. It is
-- reached only via withBackendConnection (src/lib/auth/db.ts), the same
-- no-SET-ROLE choke point already used for `sessions` -- never via
-- withTenantContext, since there is no tenant to set.
-- =====================================================================

create table leads (
  lead_id              uuid primary key default gen_random_uuid(),
  source               text not null check (source in ('get_started', 'book_demo')),
  org_type             text,
  school_name          text not null,
  contact_name         text not null,
  contact_phone        text not null,
  contact_email        text,
  city                 text,
  student_count_band   text,
  current_erp          text,
  required_modules     text[] not null default '{}',
  requirements         text,
  preferred_date       date,
  preferred_time       text,
  status               text not null default 'new'
                         check (status in ('new', 'contacted', 'qualified', 'converted', 'rejected', 'duplicate')),
  duplicate_of_lead_id uuid references leads(lead_id),
  converted_school_id  uuid references schools(school_id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index idx_leads_created on leads(created_at desc);
create index idx_leads_phone on leads(contact_phone);
create index idx_leads_status on leads(status);

-- app_backend is deliberately granted nothing on tenant tables (see
-- 20260917090000's own comment) and gets base-table access only where
-- explicitly named, same as its existing `sessions` grant. The public
-- leads API route needs both: INSERT (the submission itself) and
-- SELECT (a duplicate-phone/school check before inserting).
grant insert, select on leads to app_backend;

alter table leads enable row level security;
alter table leads force row level security;

-- Real, live-caught bug in this migration's first version, before it
-- was ever applied to production: a `using (true)` policy with no `TO`
-- clause applies to EVERY role that holds the underlying table grant,
-- not just the role it was written for. app_user/nca_super already hold
-- SELECT/INSERT on every table via role_grants.sql's blanket `alter
-- default privileges` rule, so an unscoped `using (true)` policy here
-- would have let ANY school-level session read and write the platform's
-- entire prospective-customer pipeline -- caught by a real live
-- verification query (a `teacher`-role session reading another
-- school's-worth of leads that should have been invisible to it)
-- against the dev database immediately after applying, before this file
-- was ever committed with the bug in it. Both policies below are scoped
-- with `to app_backend` specifically so they can never apply to any
-- other role, however broad that role's own table grant is.
create policy leads_public_insert on leads
  for insert to app_backend with check (true);

-- app_backend's own duplicate-check query (matching phone/school before
-- inserting) needs to read prior rows; this is bounded by the grant
-- above, the `to app_backend` scope, and the route's own logic (it
-- never echoes raw lead rows back to a client) -- there is no session-
-- derived fact to filter on for an unauthenticated caller.
create policy leads_backend_duplicate_check on leads
  for select to app_backend using (true);

-- Only a super_admin session (nca_super bypasses RLS entirely anyway,
-- but this stays explicit and consistent with every other table's own
-- role-check shape) can read or manage the platform's prospective-
-- customer pipeline through the Control Plane -- a school-level app_user
-- session has no business seeing leads that were never scoped to any
-- tenant.
create policy leads_super_admin_read on leads
  for select using (current_setting('app.current_role', true) = 'super_admin');

create policy leads_super_admin_write on leads
  for update using (current_setting('app.current_role', true) = 'super_admin')
  with check (current_setting('app.current_role', true) = 'super_admin');
