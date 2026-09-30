-- =====================================================================
-- B2 (Decision Log C97, C98): the durable job pipeline and school
-- onboarding.
--
-- jobs                 Postgres outbox. A job is inserted in the same
--                      transaction as the business change that needs it;
--                      src/lib/jobs runs it after commit and the sweeper
--                      (next migration: pg_cron -> pg_net -> /api/jobs/run)
--                      retries it with exponential backoff until it
--                      succeeds or is dead-lettered.
-- school_applications  Public "Register your school" applications and
--                      their state machine (src/lib/onboarding/
--                      application-machine.ts). Pre-tenant, platform-only.
-- staff_invitations    Invitations of a school's staff (the principal from
--                      an approved application, then staff invited by the
--                      principal). Tenant-scoped.
-- intake_rate_events   Per-IP and per-email counters for the public form
--                      (hashed keys only, never a raw IP address).
-- platform_settings    Platform-wide switches (approval mode).
--
-- Platform tables are reached only through withPlatformService
-- (src/lib/auth/db.ts, SET LOCAL ROLE nca_super). No school role can read
-- them: app_user and app_backend hold no grant, and anon/authenticated
-- lose Supabase's default ones. The one exception is INSERT on jobs for
-- app_user, limited by policy to its own school's invite jobs, so a
-- principal's staff invite and its job commit together.
-- =====================================================================

-- ---- jobs -----------------------------------------------------------------
create table jobs (
  job_id          uuid primary key default gen_random_uuid(),
  type            text not null check (type ~ '^[a-z_]+\.[a-z_]+$'),
  payload         jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  school_id       uuid references schools(school_id),
  status          text not null default 'pending'
                    check (status in ('pending', 'running', 'succeeded', 'dead')),
  attempts        int not null default 0 check (attempts >= 0),
  max_attempts    int not null default 8 check (max_attempts between 1 and 50),
  next_run_at     timestamptz not null default now(),
  locked_until    timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz
);
-- The claim query: due work, oldest first.
create index idx_jobs_due on jobs (next_run_at) where status in ('pending', 'running');
create index idx_jobs_status_type on jobs (status, type);

-- ---- school applications ---------------------------------------------------
create table school_applications (
  application_id     uuid primary key default gen_random_uuid(),
  status             text not null default 'submitted'
                       check (status in ('submitted', 'email_verified', 'under_review', 'approved', 'rejected', 'provisioned', 'active')),
  school_name        text not null check (length(school_name) between 2 and 200),
  school_name_key    text not null,
  city               text not null check (length(city) between 2 and 100),
  state_code         text not null check (state_code ~ '^IN-[A-Z]{2}$'),
  board              board_type not null,
  approx_students    int check (approx_students between 1 and 100000),
  principal_name     text not null check (length(principal_name) between 2 and 200),
  email              text not null check (length(email) <= 254),
  email_key          text not null,
  mobile             text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  verify_code_hash   text,
  verify_expires_at  timestamptz,
  verify_attempts    int not null default 0,
  codes_sent         int not null default 0,
  last_code_sent_at  timestamptz,
  email_verified_at  timestamptz,
  reviewed_by        uuid,
  reviewed_at        timestamptz,
  decision_reason    text check (length(decision_reason) <= 1000),
  school_id          uuid references schools(school_id),
  invitation_id      uuid,
  activated_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
-- Dedupe: one live application per (normalised email, normalised school name).
create unique index uq_school_applications_live
  on school_applications (email_key, school_name_key) where status <> 'rejected';
create index idx_school_applications_status on school_applications (status, created_at desc);

-- ---- staff invitations -------------------------------------------------------
create table staff_invitations (
  invitation_id  uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(school_id),
  email          text not null check (length(email) <= 254),
  email_key      text not null,
  display_name   text not null check (length(display_name) between 2 and 200),
  role           user_role not null check (role not in ('super_admin', 'parent', 'student')),
  status         text not null default 'pending' check (status in ('pending', 'sent', 'accepted', 'revoked')),
  source         text not null check (source in ('application', 'staff')),
  application_id uuid references school_applications(application_id),
  invited_by     uuid,
  auth_user_id   uuid,
  membership_id  uuid,
  sends          int not null default 0,
  last_sent_at   timestamptz,
  accepted_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index uq_staff_invitations_live on staff_invitations (school_id, email_key) where status <> 'revoked';
create index idx_staff_invitations_school on staff_invitations (school_id, created_at desc);
create index idx_staff_invitations_auth_user on staff_invitations (auth_user_id) where auth_user_id is not null;

alter table school_applications
  add constraint school_applications_invitation_fk foreign key (invitation_id) references staff_invitations(invitation_id);

-- ---- intake rate events ------------------------------------------------------
create table intake_rate_events (
  event_id   bigint generated always as identity primary key,
  bucket     text not null check (bucket ~ '^[a-z_]+$'),
  key_hash   text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index idx_intake_rate_events_lookup on intake_rate_events (bucket, key_hash, created_at desc);

-- ---- platform settings -----------------------------------------------------------
-- Platform-wide switches the founder changes without a deploy. The first:
-- onboarding.approval_mode, 'manual' (the founder approves every school)
-- or 'auto' (a verified application is approved at once).
create table platform_settings (
  key        text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  value      jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into platform_settings (key, value) values ('onboarding.approval_mode', '"manual"'::jsonb)
  on conflict (key) do nothing;

-- ---- grants -------------------------------------------------------------------
revoke all on jobs, school_applications, intake_rate_events, staff_invitations, platform_settings from public, anon, authenticated, app_backend;
revoke all on jobs, school_applications, intake_rate_events, platform_settings from app_user;
grant select, insert, update on jobs, school_applications to nca_super;
grant select, insert, delete on intake_rate_events to nca_super;
grant select, update on platform_settings to nca_super;
grant select, insert, update on staff_invitations to nca_super, app_user;
-- Enqueue only: no SELECT, so the insert never uses RETURNING.
grant insert on jobs to app_user;

-- ---- row level security --------------------------------------------------------
alter table jobs enable row level security;
alter table jobs force row level security;
alter table school_applications enable row level security;
alter table school_applications force row level security;
alter table staff_invitations enable row level security;
alter table staff_invitations force row level security;
alter table intake_rate_events enable row level security;
alter table intake_rate_events force row level security;
alter table platform_settings enable row level security;
alter table platform_settings force row level security;

-- nca_super is BYPASSRLS; these platform policies are scoped `to nca_super`
-- so they can never apply to any other role (the leads-table lesson,
-- 20260925061202), and they state the intended access in the schema.
create policy jobs_platform_read on jobs for select to nca_super using (true);
create policy jobs_platform_update on jobs for update to nca_super using (true) with check (true);
create policy jobs_enqueue on jobs for insert to app_user, nca_super
  with check (
    current_user = 'nca_super'
    or (
      type = 'invite.send'
      and school_id is not null
      and school_id = (current_setting('app.current_tenant_id', true))::uuid
    )
  );

create policy school_applications_platform_read on school_applications for select to nca_super using (true);
create policy school_applications_platform_insert on school_applications for insert to nca_super with check (true);
create policy school_applications_platform_update on school_applications for update to nca_super using (true) with check (true);

create policy intake_rate_events_platform_read on intake_rate_events for select to nca_super using (true);
create policy intake_rate_events_platform_insert on intake_rate_events for insert to nca_super with check (true);
create policy intake_rate_events_platform_delete on intake_rate_events for delete to nca_super using (true);

create policy platform_settings_platform_read on platform_settings for select to nca_super using (true);
create policy platform_settings_platform_update on platform_settings for update to nca_super using (true) with check (true);

-- Tenant isolation (the same shape every tenant table uses), then a
-- RESTRICTIVE overlay: only the school's principal and school admin (and a
-- platform admin) see or write its invitations.
create policy staff_invitations_tenant_isolation on staff_invitations
  using (
    school_id = (current_setting('app.current_tenant_id', true))::uuid
    or current_setting('app.current_role', true) = 'super_admin'
  );
create policy staff_invitations_admin_only on staff_invitations as restrictive
  using (current_setting('app.current_role', true) in ('principal', 'school_admin', 'super_admin'))
  with check (current_setting('app.current_role', true) in ('principal', 'school_admin', 'super_admin'));
